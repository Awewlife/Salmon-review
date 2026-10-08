import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const snapshot={jobs:[],shifts:[],player:'测试玩家',generated:'2026-09-30T00:00:00Z',excluded:[]};
function cache(storage){const c={window:{},sessionStorage:storage};vm.createContext(c);vm.runInContext(source('view-data.js'),c);return c}

test('tab display cache restores only a valid snapshot and tolerates corrupt or unavailable storage',()=>{
  let saved=null;const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value}};
  const first=cache(storage);assert.equal(first.window.SALMON_DATA,null);
  first.window.SalmonViewData.save(snapshot);
  assert.equal(cache(storage).window.SALMON_DATA.player,'测试玩家');
  saved='{invalid';assert.equal(cache(storage).window.SALMON_DATA,null);
  saved=JSON.stringify({jobs:[],csrf:'not a snapshot'});assert.equal(cache(storage).window.SALMON_DATA,null);
  const blocked=cache({getItem(){throw Error('blocked')},setItem(){throw Error('quota')}});
  assert.equal(blocked.window.SALMON_DATA,null);assert.doesNotThrow(()=>blocked.window.SalmonViewData.save(snapshot));
});

test('unchanged snapshots leave the DOM intact; changed data preserves selected shift and scroll; invalid data is rejected',()=>{
  const c=cache({getItem:()=>JSON.stringify(snapshot),setItem(){}}),elements=new Map(),scrolls=[];
  c.document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{innerHTML:'',classList:{toggle(){}}});return elements.get(selector)}};
  Object.assign(c.window,{scrollX:0,scrollY:620,scrollTo:(...xy)=>scrolls.push(xy),addEventListener(){}});
  c.location={hash:''};vm.runInContext(source('app.js'),c);
  vm.runInContext('overview=()=>{app.innerHTML="chart:"+shiftId+":"+DATA.jobs.length}',c);
  const first={...snapshot,jobs:[{id:'one',shift:'old-shift',players:[{name:'me'}]}],shifts:[{id:'old-shift'}]};
  c.window.replaceData(first);assert.equal(elements.get('#app').innerHTML,'chart:old-shift:1');
  const before=scrolls.length;
  c.window.replaceData({...first,generated:'2026-09-30T01:00:00Z'});
  assert.equal(scrolls.length,before);assert.equal(elements.get('#app').innerHTML,'chart:old-shift:1');
  assert.throws(()=>c.window.replaceData({jobs:null}),/格式异常/);
  assert.equal(elements.get('#app').innerHTML,'chart:old-shift:1');
  c.window.replaceData({...first,jobs:[...first.jobs,{id:'two',shift:'new-shift',players:[{name:'me'}]}],shifts:[{id:'new-shift'},...first.shifts]});
  assert.equal(elements.get('#app').innerHTML,'chart:old-shift:2');assert.deepEqual(scrolls.at(-1),[0,620]);
});

test('startup without a cached snapshot distinguishes loading from an empty archive',()=>{
  const c=cache({getItem:()=>null,setItem(){}}),elements=new Map();
  c.document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{innerHTML:'',classList:{toggle(){}}});return elements.get(selector)}};
  Object.assign(c.window,{addEventListener(){},scrollTo(){}});c.location={hash:''};
  vm.runInContext(source('app.js'),c);
  assert.match(elements.get('#app').innerHTML,/正在读取本机战绩/);
  c.window.replaceData(snapshot);assert.match(elements.get('#app').innerHTML,/开始你的打工复盘/);
});


test('overview performance chart opens the selected match for pointer and keyboard activation',()=>{
  const c=cache({getItem:()=>null,setItem(){}}),elements=new Map();
  const hits=[{dataset:{chartJob:'job-normal'}},{dataset:{chartJob:'job-interrupted'}}];
  c.document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{innerHTML:'',style:{},classList:{toggle(){}}});return elements.get(selector)},querySelectorAll:()=>hits};
  Object.assign(c.window,{addEventListener(){},scrollTo(){}});c.location={hash:''};
  c.openTrend=()=>assert.fail('chart points must not open trend dialog');
  vm.runInContext(source('app.js'),c);vm.runInContext('wireChart([])',c);
  hits[0].onclick();assert.equal(c.location.hash,'job-normal');
  hits[1].onclick();assert.equal(c.location.hash,'job-interrupted');
  for(const key of ['Enter',' ']){
    let prevented=false;c.location.hash='';
    hits[0].onkeydown({key,preventDefault(){prevented=true}});
    assert.equal(c.location.hash,'job-normal');assert.equal(prevented,true);
  }
});
