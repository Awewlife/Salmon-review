import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {version} from '../server/version.js';
import {Updater} from '../server/updater/service.js';
import {atomicJSON,json} from '../server/updater/files.js';
import {componentConfig,helperConfig,sameProjectUpdater} from '../server/updater/docker.js';
const volumes=[{Type:'volume',Name:'fixture_data',Destination:'/data'},{Type:'volume',Name:'fixture_updates',Destination:'/updates'}];
const updater=()=>({Id:'updater-id',Image:'sha256:'+'a'.repeat(64),Name:'/fixture-updater-1',Config:{Hostname:'old-host',Image:'salmon-review:0.3.10',Cmd:['node','server/updater/service.js'],Env:['UPDATE_DIR=/updates'],Labels:{'com.docker.compose.project':'fixture','com.docker.compose.service':'updater','org.opencontainers.image.version':'0.3.10'}},Mounts:[...structuredClone(volumes),{Type:'bind',Source:'/var/run/docker.sock',Destination:'/var/run/docker.sock'}],HostConfig:{Binds:['fixture_data:/data','fixture_updates:/updates','/var/run/docker.sock:/var/run/docker.sock'],RestartPolicy:{Name:'unless-stopped'},ReadonlyRootfs:true},State:{Running:true,Status:'running'},NetworkSettings:{Networks:{fixture_default:{Aliases:['updater','old-host']}}}});
const app=()=>({...updater(),Id:'app-id',Name:'/fixture-app-1',Mounts:structuredClone(volumes),Config:{Labels:{'com.docker.compose.project':'fixture','com.docker.compose.service':'app'}},HostConfig:{PortBindings:{'8787/tcp':[{HostIp:'127.0.0.1',HostPort:'8787'}]}}});
const manifest={version:'0.3.11',image:'salmon-review:0.3.11',commit:'b'.repeat(40)};
async function setup(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'salmon-bundle-unit-'));t.after(()=>rm(directory,{force:true,recursive:true}));
 const old=updater(),a=app(),created=[];
 const docker={inspect:async id=>{if(id==='fixture-updater-1-helper-'+('c'.repeat(24)))throw new Error('docker_404');return old},create:async(name,config)=>{created.push({name,config});return {Id:'helper-id'}}};
 const u=new Updater({directory,docker});u.discover=async()=>a;u.token='fixture';return {u,old,a,created,directory,docker};
}
test('component replacement and helper preserve volumes but helper never claims updater DNS or app transaction',()=>{
 const old=updater(),state={id:'c'.repeat(24),helperName:'fixture-helper',helperImage:old.Image};
 const candidate=componentConfig(old,manifest,state.id),helper=helperConfig(old,state);
 assert.equal(candidate.Hostname,undefined);assert.equal(candidate.Env.includes('SALMON_UPDATE_TRIAL=1'),false);
 assert.equal(candidate.Labels['salmon-review.update-transaction'],undefined);
 assert.equal(helper.Image,old.Image);assert.deepEqual(helper.Cmd,['node','server/updater/helper.js',state.id]);
 assert.deepEqual(helper.NetworkingConfig.EndpointsConfig.fixture_default.Aliases,['fixture-helper']);
 assert.equal(helper.HostConfig.RestartPolicy.Name,'unless-stopped');assert.equal(old.HostConfig.RestartPolicy.Name,'unless-stopped');
 assert.deepEqual(helper.HostConfig.Binds,old.HostConfig.Binds);assert.deepEqual(helper.Healthcheck,{Test:['NONE']});
});
test('updater project boundary rejects wrong updates volume, exposed ports, missing socket and wrong role',()=>{
 assert.equal(sameProjectUpdater(updater(),app()),'fixture');
 for(const mutate of [u=>u.Mounts[1].Name='other',u=>u.HostConfig.PortBindings={'8790/tcp':[{HostIp:'127.0.0.1'}]},u=>u.Mounts.pop(),u=>u.Config.Labels['com.docker.compose.service']='app']){
  const u=updater();mutate(u);assert.throws(()=>sameProjectUpdater(u,app()),/project_mismatch/);
 }
});
test('handoff persists ownership before starting helper and does not release busy when creation fails',async t=>{
 const {u,directory}=await setup(t);u.busy=true;
 u.bundle.ensureHelper=async state=>{assert.equal((await json(path.join(directory,'bundle.json'))).id,state.id);assert.equal(u.delegated,true);throw new Error('docker_unavailable')};
 await assert.rejects(u.bundle.begin(manifest,'sha256:'+'b'.repeat(64)),/docker_unavailable/);
 assert.equal(u.busy,true);assert.ok(await json(u.bundle.file()));
 await assert.rejects(u.install(manifest.version),/busy/);await assert.rejects(u.authorize('fixture-token-for-test-12345'),/busy/);
});
test('service startup during handoff leaves app transaction, credentials and status byte-for-byte unchanged',async t=>{
 const {u}=await setup(t),saved={phase:'updating_updater',message:'fixture'};
 await atomicJSON(u.bundle.file(),{id:'c'.repeat(24)});await atomicJSON(u.file('status.json'),saved);
 await atomicJSON(u.file('transaction.json'),{oldId:'old',committed:false});await atomicJSON(u.file('github.json'),{token:'local-only',login:'tester'});await writeFile(u.file('channel.token'),'channel');
 const names=['status.json','transaction.json','github.json'],before=await Promise.all(names.map(n=>readFile(u.file(n),'utf8')));
 u.bundle.ensureHelper=async()=>{};await u.init();
 assert.equal(u.busy,true);assert.equal(u.status().selfUpdateSupported,true);assert.equal(u.status().updaterVersion,version);
 assert.deepEqual(await Promise.all(names.map(n=>readFile(u.file(n),'utf8'))),before);
 await rm(u.bundle.file());await u.bundle.refresh();assert.equal(u.busy,false);assert.equal(u.credential.login,'tester');
});
test('unrelated container occupying helper name is rejected without start or replacement',async t=>{
 const {u,docker}=await setup(t);docker.inspect=async()=>updater();
 await assert.rejects(u.bundle.ensureHelper({id:'c'.repeat(24),project:'fixture',helperName:'collision',helperImage:'sha256:'+'a'.repeat(64)}),/project_mismatch/);
});
