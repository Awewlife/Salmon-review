import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/diagnostics.js',import.meta.url),'utf8');
function api(){const c={window:{},AbortController,setTimeout,clearTimeout,performance};vm.createContext(c);vm.runInContext(source,c);return c.window.SalmonDiagnosticReport}
const secret='SECRET_PLAYER_TOKEN_PATH';
const fixtures=()=>({
  '/api/status':{version:'0.3.8',records:309,connected:true,csrf:secret,owner:secret,lastImport:'2026-10-12T08:00:00.000Z',sync:{active:false,autoMinutes:0,paused:null,lastSuccess:'2026-10-12T08:00:00.000Z',last:{id:secret,kind:secret,state:'success',started:'2026-10-12T08:00:00.000Z',finished:'2026-10-12T08:00:02.000Z',done:3,total:3,added:1,error:null,raw:secret}}},
  '/api/diagnostics':{runtime:{node:'22.23.2',platform:'linux',arch:'x64',uptimeSeconds:40,rssBytes:1000,path:secret},updaterConfigured:true,database:{ok:true,records:309,summaries:14,shifts:14,assets:40,schemaVersion:1,elapsedMs:1,raw:secret},storage:{databaseBytes:5000,freeBytes:5*1024**3,totalBytes:10*1024**3,permissions:true,directory:secret},settings:secret},
  '/api/data':{player:secret,jobs:[{id:secret,shift:'s',players:[{name:secret}],raw:secret}],shifts:[{id:'s',raw:secret}],chartJobs:[{raw:secret}],excluded:[{raw:secret}]},
  '/api/update/status':{enabled:true,phase:'idle',current:'0.3.8',latest:'0.3.8',available:false,busy:false,progress:0,updated:100,checked:90,auth:{connected:true,required:false,login:secret,token:secret},message:secret,notes:secret,url:secret,cleanup:{pending:false,paths:[secret]}}
});
const response=value=>({ok:true,status:200,json:async()=>value});
const pending=signal=>new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error(secret));else signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true})});

test('diagnostics uses only local reads and exports an allowlisted aggregate report',async()=>{
  const f=fixtures(),calls=[],progress=[];
  const report=await api().collect({fetcher:async(url,options)=>{calls.push(url);assert.equal(options.method,undefined);assert.equal(options.body,undefined);return response(f[url])},context:{userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/154.0 Edg/154.0 '+secret,displayCachePresent:true,token:secret},onProgress:r=>progress.push(JSON.stringify(r))});
  assert.deepEqual(calls,Object.keys(f));assert.equal(report.state,'complete');assert.equal(report.checks.length,4);
  assert(report.checks.every(c=>c.status==='ok'&&c.elapsedMs>=0));assert(progress.some(p=>p.includes('"status":"running"')));
  assert.equal(report.browser.family,'Edge');assert.equal(report.browser.major,154);
  assert.equal(report.checks[2].details.jobs,1);assert.equal(report.checks[2].details.excluded,1);
  assert(!JSON.stringify(report).includes(secret));assert(!progress.join('').includes(secret));
});

test('unavailable service still yields exportable storage/update failures and skips heavy data read',async()=>{
  const calls=[];const report=await api().collect({fetcher:async url=>{calls.push(url);throw new Error(secret)}});
  assert.equal(report.state,'complete');assert.equal(calls.length,3);assert(!calls.includes('/api/data'));
  assert.equal(report.checks[2].status,'skipped');assert.equal(report.checks[2].code,'service_unavailable');
  assert.equal(report.checks[0].code,'network');assert(!JSON.stringify(report).includes(secret));
});

test('cancel aborts the active request, retains completed checks and skips later probes',async()=>{
  const controller=new AbortController(),f=fixtures(),calls=[];
  const report=await api().collect({signal:controller.signal,fetcher:async(url,{signal})=>{calls.push(url);if(url==='/api/diagnostics'){setTimeout(()=>controller.abort(),5);return pending(signal)}return response(f[url])}});
  assert.equal(report.state,'cancelled');assert.equal(report.checks[0].status,'ok');assert.equal(report.checks[1].status,'cancelled');
  assert.equal(report.checks[2].status,'skipped');assert.equal(calls.length,2);assert(!JSON.stringify(report).includes(secret));
});

test('timeouts cover response body reads and permit the next probe and a fresh run',async()=>{
  const f=fixtures(),a=api();const report=await a.collect({timeoutMs:10,fetcher:async(url,{signal})=>url==='/api/data'?{ok:true,status:200,json:()=>pending(signal)}:response(f[url])});
  assert.equal(report.checks[2].code,'timeout');assert.equal(report.checks[3].status,'ok');
  const retry=await a.collect({fetcher:async url=>response(f[url])});assert(retry.checks.every(c=>c.status==='ok'));
});

test('malformed and HTTP errors never export response bodies; task codes are bounded',async()=>{
  const f=fixtures();f['/api/status'].sync.last.error=secret;f['/api/status'].sync.last.state='failed';f['/api/status'].sync.paused=secret;
  const report=await api().collect({fetcher:async url=>url==='/api/data'?response({raw:secret}):url==='/api/update/status'?{ok:false,status:403,json:()=>{throw new Error('must not read')}}:response(f[url])});
  assert.equal(report.checks[0].status,'warning');assert.equal(report.checks[0].details.sync.last.error,'unknown');
  assert.equal(report.checks[2].code,'invalid_response');assert.equal(report.checks[3].httpStatus,403);assert(!JSON.stringify(report).includes(secret));
});

test('a pre-cancelled run makes no requests and still creates a report',async()=>{
  const controller=new AbortController();controller.abort();
  const report=await api().collect({signal:controller.signal,fetcher:()=>{throw new Error('must not fetch')}});
  assert.equal(report.state,'cancelled');assert.equal(report.checks.length,4);assert(report.checks.every(c=>c.status==='skipped'));
});
