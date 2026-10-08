import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/update.js',import.meta.url),'utf8');
async function fixture(connected=true){
  const elements=new Map(),timers=[],calls=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{open:false,hidden:true,textContent:'',value:'',innerHTML:'',addEventListener(){},showModal(){this.open=true},close(){this.open=false},querySelector:()=>null});return elements.get(id)};
  let state={enabled:true,phase:'idle',auth:{connected},available:false,busy:false};
  const c={window:{},document:{querySelector:element},location:{reload(){}},AbortSignal,setInterval:fn=>timers.push(fn),fetch:async(url,options)=>{
    calls.push({url,options});
    if(url==='/api/update/check')state={...state,available:true,latest:'0.3.7',phase:'available'};
    return {ok:true,json:async()=>url==='/api/status'?{version:'0.3.6',csrf:'fixture'}:url==='/api/update/status'?{...state}:{accepted:true}};
  }};
  vm.createContext(c);vm.runInContext(source,c);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
  return {c,element,timers,calls,flush,setState:patch=>{state={...state,...patch}}};
}
test('authorized startup checks once, notifies without a sidebar item, and respects dismissal',async()=>{
  const f=await fixture();
  assert.equal(f.calls.filter(c=>c.url==='/api/update/check').length,1);
  f.timers[0]();await f.flush();assert.equal(f.element('#update-notice').hidden,false);
  assert.match(f.element('#manage-update-status').textContent,/0.3.7/);
  f.element('#dismiss-update-notice').onclick();assert.equal(f.element('#update-notice').hidden,true);
  for(let i=0;i<3;i++){f.timers[1]();await f.flush()}
  assert.equal(f.calls.filter(c=>c.url==='/api/update/check').length,1);assert.equal(f.element('#update-notice').hidden,true);
  await f.c.window.SalmonUpdates.open();assert.equal(f.element('#update-dialog').open,true);
  await f.element('#check-update').onclick();assert.equal(f.calls.filter(c=>c.url==='/api/update/check').length,2);
});
test('startup without GitHub credentials does not call the release check or prompt an update',async()=>{
  const f=await fixture(false);f.timers[1]();await f.flush();
  assert.equal(f.calls.filter(c=>c.url==='/api/update/check').length,0);assert.equal(f.element('#update-notice').hidden,true);
});
