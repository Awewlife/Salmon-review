// Isolated Docker test; never mounts production volumes or downloads releases.
import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {version} from '../server/version.js';
import {Updater} from '../server/updater/service.js';
import {Docker} from '../server/updater/docker.js';
import {json} from '../server/updater/files.js';
import {appHTTP} from '../server/updater/app-http.js';
import {fixture} from './fixtures.js';
const nextVersion=version.split('.').map((n,i)=>i===2?Number(n)+1:n).join('.');
const project='salmon-bundle-test',docker=new Docker();
const runner=await docker.inspect(process.env.HOSTNAME);
assert.equal(runner.Config.Labels['com.docker.compose.project'],project);
assert.equal(runner.Mounts.find(m=>m.Destination==='/data').Name,project+'_salmon-data');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const container=async service=>{
 const list=await docker.list({label:[`com.docker.compose.project=${project}`,`com.docker.compose.service=${service}`]});
 const item=list.find(c=>!c.Names.some(n=>n.includes('-rollback-')));assert.ok(item,service);return docker.inspect(item.Id);
};
const appGet=async route=>{const c=await container('app');return appHTTP(c.NetworkSettings.Networks[project+'_default'].IPAddress,route)};
const waitFor=async predicate=>{for(let i=0;i<300;i++){try{const value=await predicate();if(value)return value}catch{}await pause(100)}throw new Error('timed out')};
await writeFile('/updates/github.json',JSON.stringify({token:'fixture-local-only-token',login:'fixture'}),{mode:0o600});
await writeFile('/data/bundle-secret.txt','local-data-preserved',{mode:0o600});
const initial=await appGet('/api/status'),f=fixture(),app=await container('app');
assert.equal((await appHTTP(app.NetworkSettings.Networks[project+'_default'].IPAddress,'/api/import',{csrf:initial.body.csrf,body:{documents:[f.summary,f.record]}})).status,200);
async function begin(tag,{defer=false}={}){
 const old=await container('updater'),d=new Docker(),inspect=d.inspect.bind(d);
 // Keep this driver alive while the real updater is replaced.
 d.inspect=id=>inspect(id===process.env.HOSTNAME?old.Id:id);
 const u=new Updater({docker:d});u.token=(await readFile('/updates/channel.token','utf8')).trim();
 u.credential=await json('/updates/github.json');u.info=await json('/updates/status.json',{});
 const image=await docker.image(tag),m={updaterProtocol:2,version:image.Config.Labels['org.opencontainers.image.version'],image:tag,imageIds:[image.Id],commit:image.Config.Labels['org.opencontainers.image.revision']};
 if(defer)u.bundle.ensureHelper=async()=>{};
 try{await u.bundle.begin(m,image.Id)}catch(e){console.error(JSON.stringify({service:old.Config.Labels['com.docker.compose.service'],mounts:old.Mounts,ports:old.HostConfig.PortBindings,appMounts:(await container('app')).Mounts}));throw e}return {old,state:await json('/updates/bundle.json')};
}
async function settled(phase,secret='local-data-preserved'){
 await waitFor(async()=>!await json('/updates/bundle.json'));
 const info=await json('/updates/status.json');assert.equal(info.phase,phase,JSON.stringify(info));
 await waitFor(async()=>{const r=await appGet('/api/update/status');return r.body.enabled&&!r.body.busy});
 assert.equal(await readFile('/data/bundle-secret.txt','utf8'),secret);
 assert.equal((await appGet('/api/status')).body.records,1);
 assert.equal((await json('/updates/github.json')).token,'fixture-local-only-token');
}
const started=await begin('salmon-review:bundle-target-test',{defer:true});
await docker.stop(started.old.Id);await docker.start(started.old.Id);
await settled('success');
assert.equal((await container('updater')).Config.Labels['org.opencontainers.image.version'],version);
assert.equal((await container('app')).Config.Labels['org.opencontainers.image.version'],version);
assert.equal((await json('/updates/installed.json')).updaterVersion,version);
console.log('PASS: restart after handoff upgrades both services, preserves records and credentials');
for(const service of ['app','updater']){const c=await container(service);await docker.stop(c.Id);await docker.start(c.Id)}
await waitFor(async()=>{const r=await appGet('/api/update/status');return r.body.updaterVersion===version&&!r.body.busy});
const beforeFailure={app:(await container('app')).Id,updater:(await container('updater')).Id};
await begin('salmon-review:bundle-bad-test');await settled('failed');
assert.equal((await container('app')).Id,beforeFailure.app);assert.equal((await container('updater')).Id,beforeFailure.updater);
assert.equal((await json('/updates/installed.json')).updaterVersion,version);
console.log('PASS: failed updater rolls back both containers and data; installed versions unchanged');
const interrupted=await begin('salmon-review:bundle-next-test');
await waitFor(async()=>{const tx=await json('/updates/transaction.json');return tx?.newId&&!tx.committed});
const helper=await docker.inspect(interrupted.state.helperName);await docker.stop(helper.Id);
await docker.start(helper.Id);await settled('failed');
assert.equal((await container('app')).Id,beforeFailure.app);assert.equal((await container('updater')).Id,beforeFailure.updater);
console.log('PASS: helper interruption before commit restores both components and data after restart');
await writeFile('/updates/pause-after-commit','1');
const committing=await begin('salmon-review:bundle-next-test');
await waitFor(async()=>await readFile('/updates/commit-paused','utf8'));
assert.equal((await json('/updates/transaction.json')).committed,true);
const committingHelper=await docker.inspect(committing.state.helperName);
await docker.stop(committingHelper.Id);await rm('/updates/pause-after-commit');
await writeFile('/data/bundle-secret.txt','new-user-data',{mode:0o600});
await docker.start(committingHelper.Id);await settled('success','new-user-data');
const installed=await container('updater');await docker.stop(installed.Id);await docker.start(installed.Id);
await waitFor(async()=>{const r=await appGet('/api/update/status');return r.body.updaterVersion===nextVersion&&!r.body.busy});
assert.equal(await readFile('/data/bundle-secret.txt','utf8'),'new-user-data');
console.log('PASS: helper interruption after commit completes both components without overwriting new writes');
await waitFor(async()=>{
 const helpers=await docker.list({label:[`com.docker.compose.project=${project}`,'com.docker.compose.service=update-helper']});
 for(const item of helpers)if((await docker.inspect(item.Id)).State.Running)return false;
 return true;
});
console.log('PASS: completed helpers exit instead of leaving background containers running');

const cleanup=new Updater();await cleanup.bundle.cleanupHelpers();
assert.equal((await docker.list({label:[`com.docker.compose.project=${project}`,'com.docker.compose.service=update-helper']})).length,0);
console.log('PASS: exited helper containers are removed within the same test project');
