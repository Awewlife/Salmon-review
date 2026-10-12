import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Retention} from '../server/updater/retention.js';
import {atomicJSON,treeHash} from '../server/updater/files.js';
import {Docker} from '../server/updater/docker.js';
const source='https://github.com/Awewlife/Salmon-review';
async function fixture(t){
  const directory=await mkdtemp(path.join(os.tmpdir(),'salmon-retention-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await mkdir(path.join(directory,'backups'));
  const removed=[],images=[],containers=[];
  const docker={images:async()=>images,list:async()=>containers,image:async tag=>{const image=images.find(i=>i.RepoTags.includes(tag)||i.Id===tag);if(!image)throw new Error('docker_404');return image},removeImage:async tag=>removed.push(tag)};
  const r=new Retention(directory,docker);
  const addImage=(version,tags=[`salmon-review:${version}`],origin=source)=>{const i={Id:'sha256:'+version,RepoTags:tags,Config:{Labels:{'org.opencontainers.image.source':origin,'org.opencontainers.image.version':version}}};images.push(i);return i};
  const backup=async(n,options={})=>{
    const id=n.toString(16).padStart(24,'0'),folder=path.join(directory,'backups',id);await mkdir(folder);await writeFile(path.join(folder,'fixture'),'record-'+n);
    const journal={id,created:n,version:'0.3.8',oldVersion:'0.3.7',committed:true,backupComplete:true,backupDigest:await treeHash(folder),...options};await r.record(journal);return {id,folder,journal};
  };
  return {r,directory,removed,images,containers,docker,addImage,backup};
}
test('retention deletes only older official unreferenced images, retaining all project and stopped-container dependencies',async t=>{
  const f=await fixture(t);await f.r.record({committed:true,version:'0.3.8',oldVersion:'0.3.7'});
  for(const v of ['0.3.8','0.3.7','0.3.6','0.3.5','0.3.4','0.3.3'])f.addImage(v);
  f.addImage('0.3.2',['salmon-review:0.3.2','custom:saved']);f.addImage('0.3.1',['salmon-review:0.3.1'],'https://example.com');f.addImage('0.3.0',['salmon-review:local']);
  f.containers.push({Image:'salmon-review:0.3.5',ImageID:'sha256:0.3.5',State:'running'}, {Image:'salmon-review:0.3.4',ImageID:'sha256:0.3.4',State:'exited'});
  assert.equal((await f.r.cleanup()).pending,false);assert.deepEqual(f.removed,['sha256:0.3.6','sha256:0.3.3']);
});
test('container inventory failure preserves images, exposes retry and never invokes global prune',async t=>{
  const f=await fixture(t);await f.r.record({committed:true,version:'0.3.8',oldVersion:'0.3.7'});f.addImage('0.3.5');
  f.docker.list=async()=>{throw new Error('snapshot not found')};assert.equal((await f.r.cleanup()).pending,true);assert.deepEqual(f.removed,[]);
  f.docker.list=async()=>[];assert.equal((await f.r.cleanup()).pending,false);assert.deepEqual(f.removed,['sha256:0.3.5']);
  const docker=new Docker();const calls=[];docker.request=(...args)=>calls.push(args);docker.removeImage('salmon-review:0.3.5');
  assert.deepEqual(calls,[['DELETE','/images/salmon-review%3A0.3.5?force=false&noprune=true']]);
});
test('backup pruning keeps the newest two verified copies and leaves legacy folders and live data untouched',async t=>{
  const f=await fixture(t);const a=await f.backup(1),b=await f.backup(2),c=await f.backup(3);
  await mkdir(path.join(f.directory,'backups','legacy'));await writeFile(path.join(f.directory,'github.json'),'fixture-credential');
  const result=await f.r.cleanup();assert.equal(result.backups,1);assert.equal(result.legacyBackups,1);assert.equal(result.pending,false);
  assert.deepEqual((await readdir(path.join(f.directory,'backups'))).sort(),[b.id,c.id,'legacy'].sort());
  assert.equal(await readFile(path.join(f.directory,'github.json'),'utf8'),'fixture-credential');
  assert.equal((await f.r.state()).backups.some(x=>x.id===a.id),false);
});
test('corrupt newest backup cannot evict older recovery copies',async t=>{
  const f=await fixture(t);await f.backup(1);await f.backup(2);const c=await f.backup(3);
  await writeFile(path.join(c.folder,'fixture'),'corrupt');assert.equal((await f.r.cleanup()).pending,true);
  assert.equal((await readdir(path.join(f.directory,'backups'))).length,3);
});
test('unfinished transactions prohibit all cleanup and registration is idempotent across crashes',async t=>{
  const f=await fixture(t);await f.backup(1);await f.backup(2);const c=await f.backup(3);f.addImage('0.3.5');
  await atomicJSON(path.join(f.directory,'transaction.json'),{committed:true});assert.equal((await f.r.cleanup()).pending,true);
  assert.equal((await readdir(path.join(f.directory,'backups'))).length,3);assert.deepEqual(f.removed,[]);
  await f.r.record(c.journal);assert.equal((await f.r.state()).backups.length,3);assert.equal((await f.r.state()).previous,'0.3.7');
  await assert.rejects(f.r.record({...c.journal,committed:false}),/uncommitted/);
});
test('interrupted backup deletion is safely retried without needing its now-partial contents to match',async t=>{
  const f=await fixture(t),a=await f.backup(1);await f.backup(2);await f.backup(3);
  const state=await f.r.state();state.backups.find(b=>b.id===a.id).deleting=true;await atomicJSON(path.join(f.directory,'retention.json'),state);
  await rm(path.join(a.folder,'fixture'));const result=await f.r.cleanup();assert.equal(result.pending,false);assert.equal(result.backups,1);
  assert.equal((await readdir(path.join(f.directory,'backups'))).length,2);
});
test('invalid backup metadata and linked backup paths never expand cleanup outside the backup directory',async t=>{
  const f=await fixture(t);await f.backup(1);await f.backup(2);await f.backup(3);
  const state=await f.r.state();state.backups[0].id='../outside';await atomicJSON(path.join(f.directory,'retention.json'),state);
  await assert.rejects(f.r.cleanup(),/invalid_retention/);
  if(process.platform==='win32')return;
  state.backups.shift();await atomicJSON(path.join(f.directory,'retention.json'),state);
  const linked=state.backups[0];await rm(path.join(f.directory,'backups',linked.id),{recursive:true});
  await mkdir(path.join(f.directory,'outside'));await writeFile(path.join(f.directory,'outside','keep'),'keep');await symlink(path.join(f.directory,'outside'),path.join(f.directory,'backups',linked.id));
  assert.equal((await f.r.cleanup()).pending,true);assert.equal(await readFile(path.join(f.directory,'outside','keep'),'utf8'),'keep');
});
