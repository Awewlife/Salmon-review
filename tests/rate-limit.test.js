import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {mkdtempSync,rmSync} from 'node:fs';
import {retryMetadata,retryDeadline,RETRY_MARKER} from '../server/rate-limit.js';
import {launchProfile,cliError} from '../server/nxapi-cli.js';
import {fetchCareer} from '../server/career-cli.js';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const require=createRequire(import.meta.url),base=path.resolve(path.dirname(require.resolve('nxapi')),'..');
const {RateLimitError,checkUseLimit}=await import(pathToFileURL(path.join(base,'common/auth/util.js')));
const {getNaToken}=await import(pathToFileURL(path.join(base,'common/auth/na.js')));
const now=1900000000000;

test('nxapi rolling window releases only when fewer than four attempts remain; limiter remains intact',async()=>{
  const times=[now-1000,now-2000,now-3000,now-55*60000,now-56*60000];
  const error=new RateLimitError('Too many attempts to authenticate','splatnet3',times.map(time=>({time})));
  const retry=retryMetadata(error,now);
  assert.equal(retry.retryAt,now+5*60000+1);
  assert.equal(retryMetadata(error,now+60000).retryAt,retry.retryAt);
  assert.deepEqual(retryMetadata(error,now+3600000),{retryAt:now+3600000,retrySource:'nxapi'});
  const na=new RateLimitError('limited','na',Array.from({length:4},()=>({time:now-14*60000})));
  assert.equal(retryMetadata(na,now).retryAt,now+60001);
  assert.deepEqual(retryMetadata(new RateLimitError('limited','unknown',na.attempts),now),{});
  let writes=0;const storage={getItem:async()=>Array.from({length:4},()=>({time:Date.now()-1000})),setItem:async()=>writes++};
  await assert.rejects(checkUseLimit(storage,'splatnet3','fixture'),RateLimitError);assert.equal(writes,0);
});

test('explicit HTTP seconds and dates take priority, handle clock skew, and invalid values fall back',()=>{
  const error=value=>({response:{headers:new Headers({'Retry-After':value})}});
  assert.deepEqual(retryMetadata(error('42'),now),{retryAt:now+42000,retrySource:'upstream'});
  assert.equal(retryMetadata(error('0'),now).retryAt,now);
  assert.equal(retryMetadata(error(new Date(now+60000).toUTCString()),now).retryAt,now+60000);
  const skew=error(new Date(now+60000).toUTCString());skew.response.headers.set('Date',new Date(now-60000).toUTCString());
  assert.equal(retryMetadata(skew,now).retryAt,now+120000);
  assert.equal(retryMetadata(error(new Date(now-60000).toUTCString()),now).retryAt,now);
  for(const value of ['no','-1','Infinity','999999999999999999999'])assert.deepEqual(retryMetadata(error(value),now),{});
  const local=new RateLimitError('limited','splatnet3',Array.from({length:4},()=>({time:now-1000})));
  local.response=error('12').response;assert.equal(retryMetadata(local,now).retryAt,now+12000);
  assert.equal(retryDeadline({},now),now+3600000);
  assert.equal(retryDeadline({retryAfter:12},now),now+12000);
  assert.equal(retryDeadline({retryAfter:NaN},now),now+3600000);
});

test('real Nintendo Account limiter uses its shorter fifteen-minute window',async t=>{
  t.mock.timers.enable({apis:['Date'],now});
  const jwt=[{alg:'HS256'},{iss:'https://accounts.nintendo.com',typ:'session_token',aud:'fixture-client',exp:now/1000+3600,sub:'fixture-user'}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.fake';
  const storage={getItem:async key=>key.startsWith('RateLimitAttempts-')?Array.from({length:4},()=>({time:now-14*60000})):null,setItem:async()=>assert.fail('must remain limited')};
  await assert.rejects(getNaToken(storage,jwt,'fixture-client',true),error=>error instanceof RateLimitError&&retryMetadata(error,now).retryAt===now+60001);
  storage.getItem=async key=>key.startsWith('RateLimitAttempts-')?Array.from({length:4},()=>({time:now-16*60000})):null;
  await assert.rejects(getNaToken(storage,jwt,'fixture-client',true),/must remain limited/);
});

test('actual nxapi CLI error reporting passes a sanitized deadline without resetting to an hour',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-retry-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(const mode of ['local','http']){
    const before=Date.now(),child=launchProfile(dir,fileURLToPath(new URL('./retry-cli-fixture.mjs',import.meta.url)),[mode]);
    let stderr='';child.stderr.on('data',c=>stderr+=c);child.stdout.resume();child.stdin.end();
    const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
    assert.equal(code,1,stderr);const error=cliError(stderr);
    assert.equal(error.message,'rate_limited');assert.equal(error.retrySource,mode==='local'?'nxapi':'upstream');
    const duration=mode==='local'?300001:42000;
    assert(error.retryAt>=before+duration&&error.retryAt<=Date.now()+duration);
    assert(!JSON.stringify(error).includes('SECRET'));assert(!JSON.stringify(error).includes('fixture-account'));
    assert.equal(stderr.split('\n').filter(line=>line.startsWith(RETRY_MARKER)).length,1);
  }
  assert.equal(cliError('429 SECRET').retryAt,undefined);
  assert.equal(cliError(RETRY_MARKER+'{"retryAt":null,"retrySource":"nxapi"}\n429').retryAt,undefined);
});

test('career subprocess preserves only validated retry metadata',async()=>{
  const launch=()=>{
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
    process.nextTick(()=>{child.stdout.end(JSON.stringify({error:'rate_limited',retryAt:now,retrySource:'upstream',token:'SECRET'}));child.emit('close',1)});return child;
  };
  await assert.rejects(fetchCareer({credentials:{backend:'nxapi-cli',profile:'fixture'}},{launch}),error=>error.message==='rate_limited'&&error.retryAt===now&&error.retrySource==='upstream'&&!JSON.stringify(error).includes('SECRET'));
});
