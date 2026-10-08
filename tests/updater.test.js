import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile,mkdir,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateManifest,compareVersions,assetURL,repository,downloadImage} from '../server/updater/release.js';
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
  assert.throws(()=>assetURL('0.3.6','../file'));assert.ok(assetURL('0.3.6','update.json').startsWith('https://github.com/'+repository+'/'));
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
