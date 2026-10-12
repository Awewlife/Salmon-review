import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createApp} from '../server/main.js';
import {Tasks,workerCall} from '../server/tasks.js';
import {classify} from '../server/errors.js';
import {fixture} from './fixtures.js';
async function setup(t){const directory=mkdtempSync(path.join(os.tmpdir(),'salmon-http-'));const app=await createApp({directory});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;const status=await fetch(base+'/api/status').then(r=>r.json());t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true})});return {...app,base,csrf:status.csrf}}
test('diagnostics reads aggregate local health without writing or disclosing settings, paths or credentials',async t=>{
  const {base,store,csrf,tasks}=await setup(t),f=fixture();
  store.import([f.record,f.summary]);store.set('diagnostic-secret','SECRET_TOKEN_VALUE');
  const changes=()=>store.db.prepare('SELECT total_changes() AS n').get().n;
  const before=changes(),runBefore=tasks.status().last;
  const res=await fetch(base+'/api/diagnostics'),report=await res.json();
  assert.equal(res.status,200);assert.equal(report.database.ok,true);assert.equal(report.database.records,1);assert.equal(report.database.schemaVersion,1);
  assert.equal(report.storage.permissions,true);assert(report.storage.databaseBytes>0);assert(report.storage.totalBytes>0);assert.equal(report.updaterConfigured,false);
  assert.equal(changes(),before);assert.deepEqual(tasks.status().last,runBefore);
  const serialized=JSON.stringify(report);for(const secret of ['SECRET_TOKEN_VALUE',csrf,store.directory,'raw','owner','settings'])assert(!serialized.includes(secret));
  assert.equal((await fetch(base+'/api/diagnostics',{headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal((await fetch(base+'/diagnostics.js')).status,200);
});
test('HTTP lifecycle: empty startup, safe import, dynamic frontend, backup, restart-safe data',async t=>{
  const {base,csrf}=await setup(t);const f=fixture();const post=(url,body,headers={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-Salmon-CSRF':csrf,...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/api/data').then(r=>r.json())).jobs.length,0);
  assert.equal((await post('/api/import',{documents:[f.record,f.summary]})).status,200);assert.equal((await fetch(base+'/api/data').then(r=>r.json())).jobs.length,1);
  assert.match(await fetch(base+'/data.js').then(r=>r.text()),/window.SALMON_DATA/);
  const backup=await fetch(base+'/api/backup').then(r=>r.json());assert.equal((await post('/api/restore',backup).then(r=>r.json())).added,0);
  assert.equal((await post('/api/settings',{autoMinutes:15})).status,200);
  assert.equal((await post('/api/import',{documents:[]} ,{Origin:'https://attacker.example'})).status,403);
  const hostileHost=await new Promise((resolve,reject)=>{http.get(base+'/api/data',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)});
  assert.equal(hostileHost,403);
  assert.equal((await fetch(base+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/credentials.enc')).status,404);assert.equal((await fetch(base+'/server/main.js')).status,404);
  const license=await fetch(base+'/LICENSE');assert.equal(license.status,200);assert.match(license.headers.get('content-type'),/^text\/plain/);assert.match(await license.text(),/GNU AFFERO GENERAL PUBLIC LICENSE/);
  const auth=await post('/api/sync',{}).then(r=>r.json());assert.equal(auth.code,'auth_required');
});
test('synchronization saves completed records on failure, deduplicates on retry, excludes concurrent runs',async t=>{
  const {store,account}=await setup(t),f=fixture();account.read=()=>({backend:'nxapi-cli',profile:'test-only'});
  let release;const hold=new Promise(resolve=>release=resolve);
  const tasks=new Tasks(store,account,async(input,emit)=>{await emit('summary',f.summary);await emit('record',f.record);await hold;throw new Error('network')});
  tasks.start();assert.throws(()=>tasks.start(),/busy/);release();await tasks.completion;
  assert.equal(store.snapshot().jobs.length,1);assert.equal(tasks.status().last.state,'failed');assert(tasks.status().nextAttempt>Date.now());assert.throws(()=>tasks.start(),/cooldown/);
  store.set('nextAttempt',0);store.set('manualNextAttempt',0);tasks.runner=async(input,emit)=>{assert(input.known.includes(f.record.result.id));await emit('summary',f.summary);await emit('record',f.record);await emit('progress',{done:1,total:1})};tasks.start();await tasks.completion;assert.equal(tasks.status().last.state,'success');assert.equal(tasks.status().last.added,0);assert.equal(store.snapshot().jobs.length,1);
});
test('browser same-origin metadata tolerates rewritten Origin, while cross-site and cross-port requests remain blocked',async t=>{
  const {base,csrf}=await setup(t),headers={Origin:'http://127.0.0.1','Sec-Fetch-Site':'same-origin'};
  for(const route of ['/style.css','/manage.css','/data.js','/view-data.js','/app.js','/api/status']){
    // Use HTTP directly: Fetch synthesizes Sec-Fetch-* headers itself.
    const status=await new Promise((resolve,reject)=>{http.get(base+route,{headers},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)});
    assert.equal(status,200,route);
  }
  const raw=(site,origin,token)=>new Promise((resolve,reject)=>{const req=http.request(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':site,...(token?{'X-Salmon-CSRF':token}:{})}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end(JSON.stringify({autoMinutes:0}))});
  assert.equal(await raw('same-origin','http://127.0.0.1',csrf),200);
  assert.equal(await raw('same-origin','http://127.0.0.1',null),403);
  assert.equal(await raw('cross-site',base,csrf),403);
  assert.equal(await raw('same-site','http://127.0.0.1:9999',csrf),403);
  assert.equal((await fetch(base+'/api/status',{headers:{Origin:'http://127.0.0.1:9999'}})).status,403);
});
test('authentication failures pause automation; rate limits preserve Retry-After; error text is sanitized',async t=>{
  const {store,account}=await setup(t);account.read=()=>({backend:'nxapi-cli',profile:'test-only'});
  const tasks=new Tasks(store,account,async()=>{throw new Error('Remote configuration prevents Coral authentication')});tasks.start();await tasks.completion;assert.equal(tasks.status().paused,'upstream_disabled');
  store.set('nextAttempt',0);store.set('manualNextAttempt',0);tasks.runner=async()=>{throw Object.assign(new Error('rate_limited'),{retryAfter:3600})};tasks.start();await tasks.completion;assert(tasks.status().nextAttempt>Date.now()+3590000);
  assert.equal(classify(new Error('upstream text containing SECRET')),'upstream');assert.equal(classify({response:{status:401}}),'auth_required');
});
test('web updater endpoints require CSRF; internal controls cannot be called by ordinary pages; maintenance blocks writes',async t=>{
  const {base,csrf,tasks}=await setup(t);
  for(const route of ['check','authorize','disconnect','cancel-install'])assert.equal((await fetch(base+'/api/update/'+route,{method:'POST'})).status,403);
  for(const route of ['prepare','validate','activate','cancel'])assert.equal((await fetch(base+'/api/update/'+route,{method:'POST',headers:{'X-Salmon-CSRF':csrf,'X-Salmon-Updater':'forged'}})).status,403);
  assert.equal((await fetch(base+'/api/update/status').then(r=>r.json())).enabled,false);
  tasks.updateLocked=true;
  assert.throws(()=>tasks.start(),/busy/);
  assert.equal((await fetch(base+'/api/settings',{method:'POST',headers:{'X-Salmon-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({autoMinutes:0})})).status,409);
  assert.equal((await fetch(base+'/api/data')).status,200);
});

test('network failure permits manual retry at five seconds while automatic backoff grows and survives restart',async t=>{
  const {store,account}=await setup(t);account.read=()=>({backend:'nxapi-cli',profile:'fixture'});
  t.mock.timers.enable({apis:['Date'],now:1900000000000});
  const fail=async()=>{throw new Error('network')};let tasks=new Tasks(store,account,fail);
  tasks.start();await tasks.completion;
  assert.equal(tasks.status().manualNextAttempt,Date.now()+5000);
  assert.equal(tasks.status().nextAttempt,Date.now()+300000);
  t.mock.timers.tick(4999);assert.throws(()=>tasks.start(),/cooldown/);
  t.mock.timers.tick(1);tasks=new Tasks(store,account,fail);
  assert.throws(()=>tasks.start({automatic:true}),/cooldown/);
  tasks.start();await tasks.completion;
  assert.equal(tasks.status().nextAttempt,Date.now()+600000);
  t.mock.timers.tick(600000);tasks.runner=async()=>{};
  tasks.start({automatic:true});await tasks.completion;assert.equal(store.get('failures'),0);
});

test('rate limits apply to both paths across restart and reconnection, respecting the boundary',async t=>{
  const {store,account}=await setup(t);account.read=()=>({backend:'nxapi-cli',profile:'fixture'});
  t.mock.timers.enable({apis:['Date'],now:1900000000000});
  let tasks=new Tasks(store,account,async()=>{throw Object.assign(new Error('rate_limited'),{retryAfter:3600})});
  tasks.start();await tasks.completion;const until=Date.now()+3600000;
  assert.equal(tasks.status().manualNextAttempt,until);assert.equal(tasks.status().nextAttempt,until);
  tasks=new Tasks(store,account,async()=>{});tasks.reconnected();
  t.mock.timers.tick(3599999);
  assert.throws(()=>tasks.start(),/cooldown/);assert.throws(()=>tasks.start({automatic:true}),/cooldown/);
  t.mock.timers.tick(1);tasks.start();await tasks.completion;assert.equal(tasks.status().last.state,'success');
});

test('expired stored credentials block retries until successful account reconnection clears the backoff',async t=>{
  const {store,account,tasks,base,csrf}=await setup(t);account.read=()=>({backend:'nxapi-cli',profile:'fixture'});
  tasks.runner=async()=>{throw new Error('auth_required')};tasks.start();await tasks.completion;
  assert.equal(tasks.status().paused,'auth_required');
  assert.throws(()=>tasks.start(),/auth_required/);
  assert.throws(()=>tasks.start({automatic:true}),/auth_required/);
  account.complete=async()=>{};
  const response=await fetch(base+'/api/auth/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Salmon-CSRF':csrf},body:JSON.stringify({url:'test-only'})});
  assert.equal(response.status,200);assert.equal(tasks.status().paused,null);assert.equal(tasks.status().manualNextAttempt,0);
  assert.equal(store.get('failures'),0);tasks.runner=async()=>{};tasks.start();await tasks.completion;
});

test('legacy network cooldown is shortened only for manual retry, while legacy rate limits stay binding',async t=>{
  const {store,account}=await setup(t);account.read=()=>({backend:'nxapi-cli',profile:'fixture'});
  t.mock.timers.enable({apis:['Date'],now:1900000000000});
  const finish=new Date().toISOString();
  store.db.prepare("INSERT INTO runs(kind,state,started,finished,error) VALUES('sync','failed',?,?,'network')").run(finish,finish);
  store.set('nextAttempt',Date.now()+300000);const tasks=new Tasks(store,account,async()=>{});
  t.mock.timers.tick(5000);assert.equal(tasks.status().manualNextAttempt,Date.now());
  assert.throws(()=>tasks.start({automatic:true}),/cooldown/);
  store.db.prepare("UPDATE runs SET error='rate_limited'").run();store.set('nextAttempt',Date.now()+900000);
  tasks.reconnected();assert.throws(()=>tasks.start(),/cooldown/);assert.equal(tasks.status().manualNextAttempt,Date.now()+900000);
});
