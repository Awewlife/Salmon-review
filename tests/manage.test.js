import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Minimal DOM boundary; run the actual browser controller and pause its network
// requests to inspect the visible state before a response arrives.
async function page({open=true,connected=false}={}){
  const elements=new Map();
  class Element{
    constructor(){this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.classes=new Set();this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)}}
    set innerHTML(value){this.markup=value;for(const [,id] of value.matchAll(/id="([^"]+)"/g))elements.set(id,new Element())}
    querySelectorAll(){return [...elements.values()]}
    removeAttribute(key){delete this[key]}
    showModal(){this.open=true}
    close(){this.open=false}
    scrollIntoView(){this.scrolled=true}
    focus(){this.focused=true}
  }
  for(const id of ['manage-dialog','sync-strip','sync-status','sync-last','quick-sync','quick-connect','sync-feedback','data-refresh-note','nav-manage'])elements.set(id,new Element());
  const status={csrf:'fixture',connected,records:50,lastImport:null,sync:{last:null,active:false,lastSuccess:null,nextAttempt:0,paused:null,autoMinutes:0}};
  let transport=async()=>({url:'https://accounts.nintendo.com/connect/1.0.0/authorize?state=fixture',expires:Date.now()+600000});
  const intervals=[], replacements=[];let timeOffset=0;
  class Clock extends Date {static now(){return Date.now()+timeOffset}}
  let readTransport=async url=>url==='/api/status'?structuredClone(status):{excluded:[]};
  const context={Date:Clock,AbortSignal,document:{querySelector:selector=>elements.get(selector.slice(1))??null},window:{SALMON_DATA:{excluded:[]},hasLoadedData:()=>true,replaceData(data){replacements.push(data)}},setInterval(fn,ms){intervals.push({fn,ms})},fetch:async(url,options)=>{
    if(url==='/api/status'||url==='/api/data')return {ok:true,json:async()=>readTransport(url)};
    const result=await transport(url,JSON.parse(options.body));return {ok:!result.error,json:async()=>result.error??result};
  }};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/manage.js',import.meta.url),'utf8'),context);
  if(open)await context.window.openManage();else await new Promise(resolve=>setImmediate(resolve));
  return {get:id=>elements.get(id),status,setTransport:fn=>transport=fn,setRead:fn=>readTransport=fn,replacements,clockTick:ms=>{timeOffset+=ms;intervals.find(i=>i.ms===1000).fn()},poll:()=>intervals.find(i=>i.ms===4000).fn()};
}
test('retry immediately clears old login error and stale link while a new request is pending',async()=>{
  const p=await page();p.setTransport(async()=>({error:{code:'network',message:'上一次网络失败'}}));
  await p.get('connect-account').onclick();assert(p.get('auth-message').classes.has('error'));
  let release;p.setTransport(()=>new Promise(resolve=>release=resolve));
  const retry=p.get('connect-account').onclick();
  assert.match(p.get('auth-message').textContent,/正在生成/);
  assert.equal(p.get('auth-message').classes.has('error'),false);assert.equal(p.get('manage-message').classes.has('error'),false);
  assert.equal(p.get('nintendo-login').href,undefined);assert.equal(p.get('auth-steps').hidden,true);
  assert.equal(p.get('connect-account').disabled,true);
  release({url:'https://accounts.nintendo.com/new',expires:Date.now()+600000});await retry;
  assert.equal(p.get('nintendo-login').href,'https://accounts.nintendo.com/new');assert.equal(p.get('auth-steps').hidden,false);
  assert.equal(p.get('finish-auth').disabled,true);
});
test('retrying callback clears its old error before validation finishes, and success stays separate from old sync failures',async()=>{
  const p=await page();await p.get('connect-account').onclick();
  p.get('auth-link').value='https://accounts.nintendo.com/wrong';await p.get('finish-auth').onclick();assert(p.get('auth-message').classes.has('error'));
  let release;p.setTransport(()=>new Promise(resolve=>release=resolve));
  p.get('auth-link').value='npf71b963c1b7b6d119://auth#fixture';p.get('auth-link').oninput();
  const finish=p.get('finish-auth').onclick();
  assert.match(p.get('auth-message').textContent,/正在验证/);assert.equal(p.get('auth-message').classes.has('error'),false);
  assert.equal(p.get('auth-link').value,'');assert.equal(p.get('finish-auth').disabled,true);
  p.status.connected=true;p.status.sync.last={id:1,state:'failed',error:'auth_required',finished:'2026-09-20T01:00:00Z'};
  release({});await finish;
  assert.match(p.get('auth-message').textContent,/连接成功/);assert.match(p.get('sync-status').textContent,/账号已连接/);
  assert.doesNotMatch(p.get('sync-status').textContent,/重新连接/);assert.match(p.get('sync-details').textContent,/上次同步未完成/);
  assert.equal(p.get('auth-steps').hidden,true);
});
test('disconnected shortcut opens the dialog at the account section without starting authentication',async()=>{
  const p=await page({open:false});let calls=0;p.setTransport(async()=>{calls++;return {}});
  assert.equal(p.get('quick-connect').hidden,false);assert.equal(p.get('quick-sync').disabled,true);
  await p.get('quick-sync').onclick();await p.get('quick-connect').onclick();
  assert.equal(calls,0);assert.equal(p.get('manage-dialog').open,true);
  assert.equal(p.get('account-section').scrolled,true);assert.equal(p.get('account-section').focused,true);
});
test('toolbar sync works before opening management, prevents duplicate clicks and clears errors on retry',async()=>{
  const p=await page({open:false,connected:true});
  p.setTransport(async()=>({error:{code:'network',message:'网络暂时不可用'}}));
  await p.get('quick-sync').onclick();assert.equal(p.get('sync-feedback').classes.has('error'),true);
  let release,calls=0;p.setTransport((url)=>{assert.equal(url,'/api/sync');calls++;return new Promise(resolve=>release=resolve)});
  const pending=p.get('quick-sync').onclick();
  assert.equal(p.get('quick-sync').disabled,true);assert.equal(p.get('sync-feedback').classes.has('error'),false);
  assert.match(p.get('sync-feedback').textContent,/正在开始/);
  await p.get('quick-sync').onclick();assert.equal(calls,1);
  p.status.sync.active=true;release({});await pending;
  assert.equal(p.get('quick-sync').disabled,true);assert.equal(p.get('quick-sync').textContent,'正在同步…');
  assert.equal(p.get('manage-dialog').open,undefined);
  p.status.sync.active=false;p.status.sync.nextAttempt=Date.now()+60000;
  await p.get('quick-sync').onclick();assert.equal(calls,1);
  await p.get('nav-manage').onclick();assert.match(p.get('quick-sync').textContent,/秒后可重试|稍后再同步/);assert.equal(p.get('sync-now').disabled,true);
});

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('slow status and data refreshes keep the displayed snapshot until both finish, without overlapping polls',async()=>{
  const p=await page({open:false}),before=p.replacements.length;
  const statusRead=deferred(),dataRead=deferred();let calls=0;
  p.setRead(url=>{calls++;return url==='/api/status'?statusRead.promise:dataRead.promise});
  p.status.lastImport='new import';
  const poll=p.poll(),duplicate=p.poll();await tick();
  assert.equal(calls,1);assert.equal(p.replacements.length,before);
  statusRead.resolve(structuredClone(p.status));await tick();
  assert.equal(calls,2);assert.equal(p.replacements.length,before);
  assert.match(p.get('data-refresh-note').textContent,/暂显示上次/);
  dataRead.resolve({excluded:[],marker:'new snapshot'});await Promise.all([poll,duplicate]);
  assert.equal(p.replacements.length,before+1);assert.equal(p.replacements.at(-1).marker,'new snapshot');
  assert.equal(p.get('data-refresh-note').textContent,'');
});

test('failed status or data requests retain the current snapshot and a later poll recovers',async()=>{
  const p=await page({open:false}),before=p.replacements.length;
  p.setRead(async()=>{throw new Error('offline')});await p.poll();
  p.clockTick(1000);assert.equal(p.replacements.length,before);assert.match(p.get('sync-status').textContent,/当前战绩保持显示/);
  p.status.lastImport='changed';
  p.setRead(async url=>{if(url==='/api/status')return structuredClone(p.status);throw new Error('data unavailable')});await p.poll();
  assert.equal(p.replacements.length,before);assert.match(p.get('data-refresh-note').textContent,/已保留当前展示/);
  p.setRead(async url=>url==='/api/status'?structuredClone(p.status):{excluded:[],marker:'recovered'});await p.poll();
  assert.equal(p.replacements.at(-1).marker,'recovered');assert.equal(p.get('data-refresh-note').textContent,'');
  const after=p.replacements.length;await p.poll();assert.equal(p.replacements.length,after);
});


test('manual button uses five-second deadline instead of automatic backoff and enables without another status read',async()=>{
  const p=await page({open:false,connected:true});
  p.status.sync.nextAttempt=Date.now()+300000;p.status.sync.manualNextAttempt=Date.now()+5000;
  await p.poll();assert.equal(p.get('quick-sync').disabled,true);assert.match(p.get('quick-sync').textContent,/5 秒后可重试/);
  p.clockTick(4000);assert.equal(p.get('quick-sync').disabled,true);assert.match(p.get('quick-sync').textContent,/1 秒后可重试/);
  p.clockTick(1000);assert.equal(p.get('quick-sync').disabled,false);assert.equal(p.get('quick-sync').textContent,'立即同步');
});

test('rate limit keeps manual controls disabled and expired credentials offer direct reconnection',async()=>{
  const p=await page({open:false,connected:true});
  p.status.sync.manualNextAttempt=p.status.sync.rateLimitedUntil=Date.now()+900000;
  await p.poll();p.clockTick(5000);assert.equal(p.get('quick-sync').disabled,true);assert.equal(p.get('quick-sync').textContent,'限流等待中');
  p.status.sync.rateLimitedUntil=0;p.status.sync.manualNextAttempt=0;p.status.sync.paused='auth_required';
  await p.poll();assert.equal(p.get('quick-sync').disabled,true);assert.equal(p.get('quick-connect').hidden,false);
  assert.equal(p.get('quick-connect').textContent,'重新连接账号');
  await p.get('quick-connect').onclick();assert.equal(p.get('account-section').focused,true);
  p.status.sync.paused=null;await p.poll();assert.equal(p.get('quick-sync').disabled,false);assert.equal(p.get('sync-now').disabled,false);
  assert.equal(p.get('quick-connect').hidden,true);
});
