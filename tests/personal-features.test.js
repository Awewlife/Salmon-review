import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
function context(storage=new Map()){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',replaceChildren(...children){this.children=children}});return elements.get(id)};
  const c=vm.createContext({window:{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}},document:{querySelector:element,createElement:()=>({})}});
  return {c,element};
}
test('display preferences survive reload, reject unknown data and do not persist match filters',()=>{
  const storage=new Map(),a=context(storage);vm.runInContext(source('preferences.js'),a.c);
  a.c.window.SalmonPreferences.save({mode:'share',shareScale:'fixed',showNames:false,showQuarter:true,showTotal:true,showPower:true,overviewMode:'score',from:4,to:9,selected:['player'],token:'secret'});
  const b=context(storage);vm.runInContext(source('preferences.js'),b.c);
  assert.deepEqual(JSON.parse(JSON.stringify(b.c.window.SalmonPreferences.get())),{mode:'share',shareScale:'fixed',showNames:false,showQuarter:true,showTotal:true,showPower:true,overviewMode:'score'});
  assert.doesNotMatch([...storage.values()].join(''),/player|secret|from|to"/);
  b.c.window.SalmonPreferences.save({mode:'invalid',showNames:'true'});
  assert.equal(b.c.window.SalmonPreferences.get().mode,'share');assert.equal(b.c.window.SalmonPreferences.get().showNames,false);
});
test('bad or unavailable browser storage keeps working with defaults and in-memory preferences',()=>{
  for(const value of ['bad json','null','42','{"mode":"bad","showNames":"false"}']){
    const {c}=context(new Map([['salmon-chart-preferences-v1',value]]));vm.runInContext(source('preferences.js'),c);
    assert.equal(c.window.SalmonPreferences.get().mode,'quantity');assert.equal(c.window.SalmonPreferences.get().showPower,false);assert.equal(c.window.SalmonPreferences.get().showNames,true);
  }
  const {c}=context();Object.defineProperty(c.window,'localStorage',{get(){throw Error('blocked')}});
  vm.runInContext(source('preferences.js'),c);c.window.SalmonPreferences.save({showQuarter:true});assert.equal(c.window.SalmonPreferences.get().showQuarter,true);
});
function records(){const {c}=context();vm.runInContext(source('grade-chart.js')+source('personal-records.js'),c);return c.window.SalmonRecords}
const job=(index,patch={})=>({id:'job-'+index,index,clear:true,continuousWithPrevious:index>1,supported:true,gradeId:8,grade:'传说',gradePoint:40,players:[{me:false,eggs:999,kills:999},{me:true,eggs:20,kills:10}],...patch});
test('personal records compare rank before score, exclude interrupted and unsupported results, and use the local player',()=>{
  const r=records().calculate([job(1,{gradeId:7,grade:'达人+3',gradePoint:99}),job(2),job(3,{interrupted:true,gradePoint:999}),job(4,{supported:false,gradePoint:999}),job(5,{gradePoint:null})]);
  assert.equal(r.grade.job.id,'job-2');assert.equal(r.eggs.value,20);assert.equal(r.eggs.job.id,'job-1');assert.equal(r.kills.value,10);
});
test('longest winning streak breaks on loss, interruption, unknown adjacency and missing records',()=>{
  const r=records().calculate([job(1),job(2),job(3,{interrupted:true}),job(4),job(5),job(6,{clear:false}),job(7),job(8),job(9,{continuousWithPrevious:false}),job(10),job(11),job(12,{continuousWithPrevious:false})]);
  assert.equal(r.streak.value,3);assert.equal(r.streak.start.index,9);assert.equal(r.streak.job.index,11);
});
test('record cards handle empty, zero, invalid score and tied values and escape linked content',()=>{
  const api=records();assert.equal(api.calculate([]).streak,null);
  const jobs=[job(1,{gradeId:7,grade:'<img>',gradePoint:150,clear:false,players:[{me:true,eggs:0,kills:0}]}),job(2,{gradeId:8,gradePoint:0,clear:false,players:[{me:true,eggs:0,kills:0}]})];
  const result=api.calculate(jobs);assert.equal(result.grade.job.id,'job-2');assert.equal(result.eggs.value,0);assert.equal(result.streak,null);
  assert.match(api.render(jobs),/href="#job-1"/);assert.match(api.render([]),/暂无记录/);
  assert.doesNotMatch(api.render([job(1,{grade:'<img>'})]),/<img>/);
});
test('bundled release notice works offline and dismissal survives reload without affecting chart preferences',()=>{
  const storage=new Map(),a=context(storage);vm.runInContext(source('release-notes.js'),a.c);
  a.c.window.SalmonReleaseNotes.observe('0.3.9');assert.equal(a.element('#release-notice').hidden,true);
  a.c.window.SalmonReleaseNotes.observe('0.3.10');assert.equal(a.element('#release-notice').hidden,false);
  assert.equal(a.element('#release-notice-list').children.length,3);
  a.element('#dismiss-release-notice').onclick();assert.equal(a.element('#release-notice').hidden,true);
  const b=context(storage);vm.runInContext(source('release-notes.js'),b.c);b.c.window.SalmonReleaseNotes.observe('0.3.10');assert.equal(b.element('#release-notice').hidden,true);
  assert.equal(b.c.window.SalmonReleaseNotes.current('0.3.10').length,3);
});
test('release notice still dismisses when browser storage is blocked',()=>{
  const {c,element}=context();Object.defineProperty(c.window,'localStorage',{get(){throw Error('blocked')}});vm.runInContext(source('release-notes.js'),c);
  c.window.SalmonReleaseNotes.observe('0.3.10');element('#dismiss-release-notice').onclick();c.window.SalmonReleaseNotes.observe('0.3.10');assert.equal(element('#release-notice').hidden,true);
});
