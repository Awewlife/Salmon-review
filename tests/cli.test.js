import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {CliAccount} from '../server/account.js';
import {syncCli} from '../server/sync-cli.js';
import {cliError} from '../server/nxapi-cli.js';
import {createApp} from '../server/main.js';
const fixture=fileURLToPath(new URL('./cli-fixture.mjs',import.meta.url));
function fake(mode){return (profile,args)=>spawn(process.execPath,[fixture,mode,profile,args[2]??''],{stdio:['pipe','pipe','pipe'],windowsHide:true})}
function directory(t){const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-cli-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir}
const callback='npf71b963c1b7b6d119://auth#state=test-state&session_token_code=test-code';

test('published nxapi executable generates authorization URL without a configured client; rejects bad state before submitting',async t=>{
  const a=new CliAccount(directory(t));
  try{
    const auth=await a.start();assert.equal(new URL(auth.url).hostname,'accounts.nintendo.com');
    await assert.rejects(a.complete(callback),/auth_callback/);assert.equal(a.read(),null);
  }finally{await a.cancel()}
});
test('CLI auth persists only after successful exit; failed reconnect keeps old profile; logout removes all credentials',async t=>{
  const dir=directory(t),a=new CliAccount(dir,{launch:fake('auth-ok')});
  await a.start();await assert.rejects(a.complete(callback+'\nextra'),/auth_callback/);await a.complete(callback);
  const first=a.read();assert(first);assert(existsSync(path.join(first.profile,'persist','fixture')));
  assert(!readFileSync(a.file,'utf8').includes('SECRET'));
  a.launch=fake('auth-fail');await a.start();await assert.rejects(a.complete(callback),/^Error: upstream_disabled$/);
  assert.deepEqual(a.read(),first);assert.equal(a.pending,null);
  a.launch=fake('auth-ok');await a.start();await a.complete(callback);assert.notEqual(a.read().profile,first.profile);assert(!existsSync(first.profile));
  const reopened=new CliAccount(dir);assert.deepEqual(reopened.read(),a.read());
  const last=reopened.read().profile;await reopened.clear();assert.equal(reopened.read(),null);assert(!existsSync(last));
});
test('CLI login expires, cancels and times out without losing an existing login',async t=>{
  const a=new CliAccount(directory(t),{launch:fake('auth-ok')});await a.start();await a.complete(callback);
  const first=a.read();a.launch=fake('auth-hang');a.completeTimeout=60;
  await a.start();await assert.rejects(a.complete(callback),/interrupted/);assert.deepEqual(a.read(),first);
  await a.start();a.pending.expires=Date.now()-1;await assert.rejects(a.complete(callback),/auth_callback/);await a.cancel();assert.deepEqual(a.read(),first);
});
test('CLI sync imports completed files on failure, waits for partial writes and deduplicates the retry',async t=>{
  const dir=directory(t),input={credentials:{backend:'nxapi-cli',profile:dir},exportDirectory:path.join(dir,'exports'),known:[]},events=[];
  await assert.rejects(syncCli(input,async(type,value)=>events.push({type,value}),{launch:fake('sync-fail'),interval:15}),/^Error: network$/);
  const records=events.filter(e=>e.type==='record');assert.equal(records.length,1);assert(events.some(e=>e.type==='progress'&&e.value.done===1));
  input.known=[records[0].value.result.id];events.length=0;
  await syncCli(input,async(type,value)=>events.push({type,value}),{launch:fake('sync-ok'),interval:15});assert.equal(events.filter(e=>e.type==='record').length,0);
  assert.equal(cliError('Session token SECRET; 429').message,'rate_limited');
});
test('CLI sync recovers a truncated file after restart instead of letting nxapi skip it forever',async t=>{
  const dir=directory(t),out=path.join(dir,'exports');mkdirSync(out);writeFileSync(path.join(out,'splatnet3-coop-result-fixture.json'),'{');
  const events=[];await syncCli({credentials:{backend:'nxapi-cli',profile:dir},exportDirectory:out,known:[]},async(type,value)=>events.push({type,value}),{launch:fake('sync-ok'),interval:15});
  assert.equal(events.filter(e=>e.type==='record').length,1);assert(readdirSync(out).some(name=>name.includes('.incomplete-')));
});
test('web account flow works without client configuration and returns no CLI token output',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-cli-http-test-'));
  const app=await createApp({directory:dir,accountOptions:{launch:fake('auth-ok')}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})});
  const base='http://127.0.0.1:'+app.server.address().port,status=await fetch(base+'/api/status').then(r=>r.json());
  assert.equal(status.authBackend,'nxapi-cli');assert.equal(status.connected,false);
  const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Salmon-CSRF':status.csrf},body:JSON.stringify(body)});const text=await r.text();assert(!text.includes('SECRET'));return {status:r.status,body:JSON.parse(text)}};
  assert.equal((await post('/api/auth/start',{})).status,200);
  assert.equal((await post('/api/auth/complete',{url:callback})).body.connected,true);
  assert.equal((await post('/api/auth/logout',{})).body.connected,false);
});
