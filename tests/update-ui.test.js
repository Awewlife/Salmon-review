import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/update.js',import.meta.url),'utf8');
async function fixture(connected=true,intercept=()=>null){
  const elements=new Map(),timers=[],calls=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{open:false,hidden:true,textContent:'',value:'',innerHTML:'',addEventListener(type,fn){this['on'+type]=fn},showModal(){this.open=true},close(){this.open=false},querySelector:selector=>element(selector)});return elements.get(id)};
  let state={enabled:true,phase:'idle',auth:{connected},available:false,busy:false};
  const c={window:{},document:{querySelector:element},location:{reload(){}},AbortSignal,setInterval:fn=>timers.push(fn),fetch:async(url,options)=>{
    calls.push({url,options});
    const intercepted=intercept(url,options);if(intercepted)return intercepted;
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


test('slow authorization shows progress immediately and ignores stale status while preventing duplicate submissions',async()=>{
  let finish;
  const f=await fixture(false,url=>url==='/api/update/authorize'?new Promise(resolve=>{finish=resolve}):null);
  f.setState({phase:'failed',message:'上次校验失败'});
  await f.c.window.SalmonUpdates.open();
  const dialog=f.element('#update-dialog'),input=f.element('#update-token');
  input.value='test-token-not-a-real-secret';
  const request=f.element('#connect-update').onclick();
  assert.match(dialog.innerHTML,/正在校验 GitHub 权限/);
  assert.match(dialog.innerHTML,/id="connect-update"[^>]*disabled[^>]*>正在校验/);
  assert.doesNotMatch(dialog.innerHTML,/上次校验失败/);
  assert.equal(input.value,'');
  await f.flush();
  await f.element('#connect-update').onclick();
  assert.equal(f.calls.filter(c=>c.url==='/api/update/authorize').length,1);
  f.setState({message:'后台刷新返回旧错误'});
  f.timers[0]();await f.flush();
  assert.match(dialog.innerHTML,/正在校验 GitHub 权限/);
  assert.doesNotMatch(dialog.innerHTML,/后台刷新返回旧错误/);
  f.setState({auth:{connected:true,login:'fixture'},phase:'idle',message:'权限校验成功'});
  finish({ok:true,json:async()=>({accepted:true})});
  await request;
  assert.doesNotMatch(dialog.innerHTML,/正在校验/);
  assert.match(dialog.innerHTML,/权限校验成功/);
});

test('failed authorization can be retried with the old error cleared until the new result arrives',async()=>{
  let finish,attempt=0;
  const f=await fixture(false,url=>{
    if(url!=='/api/update/authorize')return null;
    if(attempt++===0)return Promise.resolve({ok:false,json:async()=>({message:'凭据权限不足'})});
    return new Promise(resolve=>{finish=resolve});
  });
  await f.c.window.SalmonUpdates.open();
  f.element('#update-token').value='test-token-not-a-real-secret';
  await f.element('#connect-update').onclick();
  assert.match(f.element('#update-dialog').innerHTML,/凭据权限不足/);
  f.element('#update-token').value='test-token-retry-not-a-secret';
  const request=f.element('#connect-update').onclick();
  assert.doesNotMatch(f.element('#update-dialog').innerHTML,/凭据权限不足/);
  assert.match(f.element('#update-dialog').innerHTML,/正在校验/);
  await f.flush();
  finish({ok:false,json:async()=>({message:'新一次校验失败'})});
  await request;
  assert.match(f.element('#update-dialog').innerHTML,/新一次校验失败/);
  assert.doesNotMatch(f.element('#update-dialog').innerHTML,/正在校验/);
});

test('cancel control shows progress, prevents duplicates and enables retry when cleanup finishes',async()=>{
  let finish;
  const f=await fixture(true,url=>url==='/api/update/cancel-install'?new Promise(resolve=>finish=resolve):null);
  f.setState({phase:'downloading',canCancel:true,cancelSupported:true,busy:true,available:false,latest:'0.3.8'});
  await f.c.window.SalmonUpdates.open();const dialog=f.element('#update-dialog');
  assert.match(dialog.innerHTML,/id="cancel-update"[^>]*>取消更新/);
  const request=f.element('#cancel-update').onclick();await f.flush();
  assert.match(dialog.innerHTML,/正在取消更新并清理下载文件/);
  await f.element('#cancel-update').onclick();assert.equal(f.calls.filter(c=>c.url==='/api/update/cancel-install').length,1);
  f.setState({phase:'cancelling',canCancel:false});finish({ok:true,json:async()=>({accepted:true})});await request;
  assert.match(dialog.innerHTML,/id="cancel-update"[^>]*disabled[^>]*>正在取消/);
  f.setState({phase:'cancelled',busy:false,available:true});f.timers[0]();await f.flush();
  assert.doesNotMatch(dialog.innerHTML,/id="cancel-update"/);
  assert.match(dialog.innerHTML,/id="install-update"[^>]*class="button primary"\s*>/);
  await f.element('#install-update').onclick();assert.equal(f.calls.filter(c=>c.url==='/api/update/install').length,1);
});
test('older updater and installation phases do not advertise unsafe cancellation',async()=>{
  const f=await fixture();await f.c.window.SalmonUpdates.open();
  f.setState({phase:'downloading',busy:true});f.timers[0]();await f.flush();
  assert.match(f.element('#update-dialog').innerHTML,/当前更新组件不支持取消/);
  assert.doesNotMatch(f.element('#update-dialog').innerHTML,/id="cancel-update"/);
  f.setState({phase:'loading',cancelSupported:true,canCancel:false});f.timers[0]();await f.flush();
  assert.match(f.element('#update-dialog').innerHTML,/已进入安装或恢复阶段，无法取消/);
});

test('cleanup warning remains visible separately from successful update status',async()=>{
  const f=await fixture();f.setState({retentionSupported:true,phase:'success',message:'更新成功',cleanup:{pending:true,message:'旧文件清理暂未完成',legacyBackups:1}});
  await f.c.window.SalmonUpdates.open();const html=f.element('#update-dialog').innerHTML;
  assert.match(html,/更新成功/);assert.match(html,/最近两份已校验备份/);assert.match(html,/旧文件清理暂未完成/);assert.match(html,/1 份旧备份缺少校验记录/);
});


test('bundle handoff and component swap show versions, disable cancellation and wait for final release',async()=>{
  const f=await fixture();await f.c.window.SalmonUpdates.open();
  for(const phase of ['handoff','updating_updater']){
    f.setState({phase,busy:true,cancelSupported:true,canCancel:false,selfUpdateSupported:true,updaterVersion:'0.3.10'});f.timers[0]();await f.flush();
    const html=f.element('#update-dialog').innerHTML;
    assert.match(html,/更新组件 0.3.10/);assert.match(html,/主程序和更新组件会一起更新/);
    assert.match(html,/已进入安装或恢复阶段，无法取消/);assert.doesNotMatch(html,/id="cancel-update"/);
  }
});
