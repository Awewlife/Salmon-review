import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile,mkdir,symlink,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateManifest,compareVersions,repository,downloadImage,githubFetch,verifyAccess,privateReleases,manifestFor} from '../server/updater/release.js';
import {candidateConfig,sameProjectApp} from '../server/updater/docker.js';
import {Updater} from '../server/updater/service.js';
import {backupData,treeHash,inspectTree} from '../server/updater/files.js';
const manifest={format:1,updaterProtocol:1,dataFormat:1,repository,version:'0.3.6',platform:'linux/amd64',image:'salmon-review:0.3.6',commit:'a'.repeat(40),asset:'salmon-review-0.3.6-linux-amd64.tar.gz',bytes:100,sha256:'b'.repeat(64),imageIds:['sha256:'+'c'.repeat(64)]};
test('only authentic compatible manifests and fixed release URLs are accepted',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const envelope=m=>{const b=Buffer.from(JSON.stringify(m));return {payload:b.toString('base64'),signature:sign(null,b,privateKey).toString('base64')}};
  assert.equal(validateManifest(envelope(manifest),publicKey,'0.3.6').version,'0.3.6');
  assert.throws(()=>validateManifest({...envelope(manifest),payload:Buffer.from('{}').toString('base64')},publicKey,'0.3.6'),/invalid_signature/);
  for(const patch of [{version:'9.0.0'},{dataFormat:2},{updaterProtocol:2},{asset:'../../evil'},{image:'other:latest'},{repository:'attacker/repo'},{bytes:3*1024**3}])assert.throws(()=>validateManifest(envelope({...manifest,...patch}),publicKey,'0.3.6'));
  assert.equal(compareVersions('0.3.10','0.3.9'),1);assert.throws(()=>compareVersions('latest','0.3.5'));
});
const old=()=>({Id:'old',Name:'/sample-app-1',Config:{Image:'salmon-review:0.3.5',User:'node',Env:['UPDATE_DIR=/updates'],Labels:{'org.opencontainers.image.version':'0.3.5','com.docker.compose.project':'sample','com.docker.compose.service':'app'}},Mounts:[{Type:'volume',Name:'sample_salmon-data',Destination:'/data'}],HostConfig:{PortBindings:{'8787/tcp':[{HostIp:'127.0.0.1',HostPort:'8787'}]}},NetworkSettings:{Networks:{sample_default:{Aliases:['app'],IPAddress:'172.0.0.2'}}},State:{Running:true,Status:'running'}});
test('container replacement preserves data volume, ports and isolation; rejects a different project',()=>{
  const app=old(),self={Config:{Labels:{'com.docker.compose.project':'sample'}},Mounts:app.Mounts};
  assert.equal(sameProjectApp(self,app),'sample');
  const config=candidateConfig(app,manifest,'tx');assert.deepEqual(config.HostConfig,app.HostConfig);assert.equal(config.User,'node');assert.ok(config.Env.includes('SALMON_UPDATE_TRIAL=1'));
  app.Mounts[0].Name='different';assert.throws(()=>sameProjectApp({...self,Mounts:[{Type:'volume',Name:'sample_salmon-data',Destination:'/data'}]},app));
  app.HostConfig.PortBindings['8787/tcp'][0].HostIp='0.0.0.0';assert.throws(()=>sameProjectApp(self,app));
});
async function fixture(t,{corrupt=false,failCreate=false}={}){
  const directory=await mkdtemp(path.join(os.tmpdir(),'salmon-updater-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const trace=[],app=old();let candidate=null;
  const docker={
    load:async()=>trace.push('load'),image:async()=>({Id:corrupt?'bad':manifest.imageIds[0],Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.revision':manifest.commit,'org.opencontainers.image.version':manifest.version}}}),
    stop:async id=>{trace.push('stop:'+id);(id==='old'?app:candidate).State.Running=false},
    rename:async(id,name)=>{trace.push('rename:'+id);app.Name='/'+name},
    create:async(name,config)=>{trace.push('create');if(failCreate)throw new Error('docker_failed');candidate={...old(),Id:'new',Config:config,Name:'/'+name};return {Id:'new'}},
    start:async id=>{trace.push('start:'+id);(id==='old'?app:candidate).State.Running=true},
    inspect:async id=>id==='old'?app:candidate,
    list:async()=>candidate?[candidate]:[],remove:async id=>trace.push('remove:'+id)
  };
  const u=new Updater({directory,docker,manifest:async()=>manifest,download:async()=>trace.push('download'),backup:async()=>trace.push('backup'),restore:async()=>trace.push('restore')});
  u.discover=async()=>app;u.appCall=async(target,endpoint)=>{trace.push(endpoint+':'+target.Id);return {version:'0.3.6',records:199,fingerprint:'same',connected:true}};
  u.info={phase:'available',available:true,latest:'0.3.6'};
  return {u,trace,directory};
}
test('download/image validation failure never stops old app or writes its data',async t=>{
  const {u,trace}=await fixture(t,{corrupt:true});await u.install('0.3.6');await u.completion;
  assert.deepEqual(trace,['download','load']);assert.equal(u.info.phase,'failed');
});
test('failed replacement restores backup and old app; no volume is removed',async t=>{
  const {u,trace,directory}=await fixture(t,{failCreate:true});await u.install('0.3.6');await u.completion;
  assert.ok(trace.indexOf('backup')<trace.indexOf('create'));assert.ok(trace.includes('restore'));assert.ok(trace.includes('start:old'));assert.equal(u.info.phase,'failed');
  await assert.rejects(readFile(path.join(directory,'transaction.json')),/ENOENT/);
});
test('a concurrent install and an unselected version cannot enqueue an update',async t=>{
  const {u}=await fixture(t);await assert.rejects(u.install('9.0.0'),/no_update/);u.busy=true;await assert.rejects(u.install('0.3.6'),/busy/);
});
test('offline backup preserves all bytes and rejects linked files outside the data directory',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'salmon-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const data=path.join(root,'data'),backup=path.join(root,'backup');await mkdir(data);await mkdir(path.join(data,'nested'));
  await writeFile(path.join(data,'nested','secret'),'fixture-only');await backupData(data,backup);assert.equal(await treeHash(data),await treeHash(backup));
  await writeFile(path.join(backup,'nested','secret'),'changed-byte');assert.notEqual(await treeHash(data),await treeHash(backup));
  if(process.platform!=='win32'){await symlink('/etc/passwd',path.join(data,'link'));await assert.rejects(inspectTree(data),/unsafe_data_file/)}
});
test('download must match signed byte count and hash; partial or altered files never become installable',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'salmon-download-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const file=path.join(root,'image.tar.gz'),bytes=Buffer.from('test-image');
  const m={...manifest,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  await downloadImage(m,file,()=>{},async()=>new Response(bytes));assert.deepEqual(await readFile(file),bytes);
  await rm(file);
  await assert.rejects(downloadImage(m,file,()=>{},async()=>new Response('bad-image!')),/invalid_download/);
  await assert.rejects(readFile(file),/ENOENT/);await assert.rejects(readFile(file+'.part'),/ENOENT/);
});

const fixtureToken='ghp_'+'x'.repeat(36);
test('private download requires credentials and strips them from CDN redirects',async()=>{
  let requests=[];
  const transport=async(url,options)=>{requests.push({url:String(url),...options});return requests.length===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/fixture'}}):new Response('image')};
  await assert.rejects(githubFetch(`https://api.github.com/repos/${repository}/releases`,{transport}),/auth_required/);assert.equal(requests.length,0);
  await githubFetch(`https://api.github.com/repos/${repository}/releases/assets/1`,{token:fixtureToken,asset:true,transport});
  assert.equal(requests[0].headers.Authorization,'Bearer '+fixtureToken);assert.equal(requests[0].headers.Accept,'application/octet-stream');assert.equal(requests[1].headers.Authorization,undefined);
  for(const url of ['http://api.github.com/user','https://evil.example/file','https://api.github.com/repos/other/repo/releases','https://release-assets.githubusercontent.com/direct'])await assert.rejects(githubFetch(url,{token:fixtureToken,transport}),/invalid_source/);
  const redirected=async()=>new Response(null,{status:302,headers:{location:'https://evil.example/file'}});
  await assert.rejects(githubFetch('https://api.github.com/user',{token:fixtureToken,transport:redirected}),/invalid_source/);
});
test('invalid or revoked access is distinct from rate limits and missing signed releases',async()=>{
  for(const [status,headers,error] of [[401,{},'auth_invalid'],[403,{},'access_denied'],[404,{},'access_denied'],[403,{'x-ratelimit-remaining':'0'},'release_limited'],[429,{},'release_limited']])await assert.rejects(githubFetch('https://api.github.com/user',{token:fixtureToken,transport:async()=>new Response(null,{status,headers})}),new RegExp(error));
  const transport=async url=>Response.json(String(url).endsWith('/user')?{login:'tester'}:String(url).includes('/releases')?[]:{full_name:repository,private:true,permissions:{pull:true}});
  assert.deepEqual(await verifyAccess(fixtureToken,transport),{login:'tester'});
  await assert.rejects(verifyAccess(fixtureToken,async()=>Response.json({full_name:repository,private:false,permissions:{pull:true}})),/access_denied/);
});
test('credentials are local, private, absent from status, and removable without affecting data',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'salmon-auth-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const u=new Updater({directory,verify:async token=>{if(token!==fixtureToken)throw new Error('auth_invalid');return {login:'tester'}}});
  await u.authorize(fixtureToken);
  assert.equal(JSON.parse(await readFile(path.join(directory,'github.json'),'utf8')).token,fixtureToken);
  if(process.platform!=='win32')assert.equal((await stat(path.join(directory,'github.json'))).mode&0o777,0o600);
  assert.equal(u.status().auth.login,'tester');assert.ok(!JSON.stringify(u.status()).includes(fixtureToken));assert.ok(!(await readFile(path.join(directory,'status.json'),'utf8')).includes(fixtureToken));
  await assert.rejects(u.authorize('wrong_'+'a'.repeat(30)),/auth_invalid/);assert.equal(u.credential.token,fixtureToken);
  u.busy=true;await assert.rejects(u.disconnect(),/busy/);u.busy=false;
  await u.disconnect();assert.equal(u.status().auth.connected,false);assert.equal(u.status().available,false);await assert.rejects(readFile(path.join(directory,'github.json')),/ENOENT/);
});
test('cached availability cannot bypass revoked authorization before installation',async t=>{
  const {u,trace}=await fixture(t);u.manifest=async()=>{throw new Error('access_denied')};
  await u.install('0.3.6');await u.completion;
  assert.deepEqual(trace,[]);assert.equal(u.status().auth.required,true);assert.equal(u.status().phase,'failed');assert.equal(u.status().available,false);
  await assert.rejects(privateReleases(()=>null).manifest('0.3.6'),/auth_required/);
});

test('private manifest resolves numeric asset ID through API with octet-stream negotiation',async()=>{
  const requests=[];
  const transport=async(url,options)=>{requests.push({url:String(url),headers:options.headers});return String(url).endsWith('/releases/tags/v0.3.6')?Response.json({draft:false,assets:[{id:42,name:'update.json',browser_download_url:'https://evil.example/ignored'}]}):Response.json({payload:'e30=',signature:'invalid'})};
  await assert.rejects(manifestFor('0.3.6',{token:fixtureToken,transport}),/invalid_signature/);
  assert.equal(requests.length,2);assert.equal(requests[0].headers.Accept,'application/vnd.github+json');assert.equal(requests[1].url,`https://api.github.com/repos/${repository}/releases/assets/42`);assert.equal(requests[1].headers.Accept,'application/octet-stream');
});
