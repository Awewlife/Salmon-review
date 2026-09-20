import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Minimal DOM boundary; run the actual browser controller and pause its network
// requests to inspect the visible state before a response arrives.
async function page(){
  const elements=new Map();
  class Element{
    constructor(){this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.classes=new Set();this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)}}
    set innerHTML(value){this.markup=value;for(const [,id] of value.matchAll(/id="([^"]+)"/g))elements.set(id,new Element())}
    querySelectorAll(){return [...elements.values()]}
    removeAttribute(key){delete this[key]}
    showModal(){this.open=true}
    close(){this.open=false}
  }
  for(const id of ['manage-dialog','sync-strip','nav-manage'])elements.set(id,new Element());
  const status={csrf:'fixture',connected:false,records:50,lastImport:null,sync:{last:null,active:false,lastSuccess:null,nextAttempt:0,paused:null,autoMinutes:0}};
  let transport=async()=>({url:'https://accounts.nintendo.com/connect/1.0.0/authorize?state=fixture',expires:Date.now()+600000});
  const context={document:{querySelector:selector=>elements.get(selector.slice(1))??null},window:{SALMON_DATA:{excluded:[]},replaceData(){}},setInterval(){},fetch:async(url,options)=>{
    if(url==='/api/status')return {ok:true,json:async()=>structuredClone(status)};
    if(url==='/api/data')return {ok:true,json:async()=>({excluded:[]})};
    const result=await transport(url,JSON.parse(options.body));return {ok:!result.error,json:async()=>result.error??result};
  }};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/manage.js',import.meta.url),'utf8'),context);
  await context.window.openManage();
  return {get:id=>elements.get(id),status,setTransport:fn=>transport=fn};
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
  assert.match(p.get('auth-message').textContent,/连接成功/);assert.match(p.get('sync-strip').textContent,/账号已连接/);
  assert.doesNotMatch(p.get('sync-strip').textContent,/重新连接/);assert.match(p.get('sync-details').textContent,/上次同步未完成/);
  assert.equal(p.get('auth-steps').hidden,true);
});
