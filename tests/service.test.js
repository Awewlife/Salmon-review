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
  const auth=await post('/api/sync',{}).then(r=>r.json());assert.equal(auth.code,'auth_required');
});
test('synchronization saves completed records on failure, deduplicates on retry, excludes concurrent runs',async t=>{
  const {store,vault}=await setup(t),f=fixture();vault.save({sessionToken:'test-only'});const old=process.env.NXAPI_AUTH_CLIENT_ID;process.env.NXAPI_AUTH_CLIENT_ID='test-client';t.after(()=>{if(old===undefined)delete process.env.NXAPI_AUTH_CLIENT_ID;else process.env.NXAPI_AUTH_CLIENT_ID=old});
  let release;const hold=new Promise(resolve=>release=resolve);
  const tasks=new Tasks(store,vault,async(input,emit)=>{await emit('summary',f.summary);await emit('record',f.record);await hold;throw new Error('network')});
  tasks.start();assert.throws(()=>tasks.start(),/busy/);release();await tasks.completion;
  assert.equal(store.snapshot().jobs.length,1);assert.equal(tasks.status().last.state,'failed');assert(tasks.status().nextAttempt>Date.now());assert.throws(()=>tasks.start(),/cooldown/);
  store.set('nextAttempt',0);tasks.runner=async(input,emit)=>{assert(input.known.includes(f.record.result.id));await emit('summary',f.summary);await emit('record',f.record);await emit('progress',{done:1,total:1})};tasks.start();await tasks.completion;assert.equal(tasks.status().last.state,'success');assert.equal(tasks.status().last.added,0);assert.equal(store.snapshot().jobs.length,1);
});
test('authentication failures pause automation; rate limits preserve Retry-After; error text is sanitized',async t=>{
  const {store,vault}=await setup(t);vault.save({sessionToken:'test-only'});const old=process.env.NXAPI_AUTH_CLIENT_ID;process.env.NXAPI_AUTH_CLIENT_ID='test-client';t.after(()=>{if(old===undefined)delete process.env.NXAPI_AUTH_CLIENT_ID;else process.env.NXAPI_AUTH_CLIENT_ID=old});
  const tasks=new Tasks(store,vault,async()=>{throw new Error('Remote configuration prevents Coral authentication')});tasks.start();await tasks.completion;assert.equal(tasks.status().paused,'upstream_disabled');
  store.set('nextAttempt',0);tasks.runner=async()=>{throw Object.assign(new Error('rate_limited'),{retryAfter:3600})};tasks.start();await tasks.completion;assert(tasks.status().nextAttempt>Date.now()+3590000);
  assert.equal(classify(new Error('upstream text containing SECRET')),'upstream');assert.equal(classify({response:{status:401}}),'auth_required');
});
test('public nxapi authorizer works in an isolated child; mismatched state is rejected before token exchange',async()=>{
  const auth=await workerCall({action:'auth-start'},()=>{},30000);assert.equal(new URL(auth.url).hostname,'accounts.nintendo.com');assert(auth.state&&auth.verifier);
  await assert.rejects(workerCall({action:'auth-complete',auth,url:'npf71b963c1b7b6d119://auth#state=wrong&session_token_code=not-a-token'},()=>{},30000),/auth_callback/);
});
