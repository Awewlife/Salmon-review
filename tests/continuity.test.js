import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {Store} from '../server/store.js';
import {fixture} from './fixtures.js';

const context={window:{}};vm.createContext(context);
vm.runInContext(readFileSync(new URL('../dist/metrics.js',import.meta.url),'utf8'),context);
const metrics=context.window.SalmonStats;
function setup(t){
  const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-sequence-')),store=new Store(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});return store;
}
function record(n){const f=fixture({id:'sequence-'+n});f.record.result.playedTime=`2026-09-19T01:${String(n).padStart(2,'0')}:00Z`;return f.record}
function summary(newestFirst,total){
  const value=fixture().summary,g=value.result.historyGroups.nodes[0];
  g.playCount=total;g.historyDetails.nodes=newestFirst.map(n=>({id:'sequence-'+n}));return value;
}
const flags=jobs=>jobs.map(j=>j.continuousWithPrevious);

test('partial shift can identify a confirmed contiguous 28-match window',t=>{
  const store=setup(t),ids=Array.from({length:28},(_,i)=>i+1);
  store.import([...ids.map(record),summary([...ids].reverse(),45)]);
  const data=store.snapshot();assert.equal(data.shifts[0].complete,false);
  assert.equal(data.shifts[0].loaded,28);assert.equal(data.shifts[0].total,45);
  assert.deepEqual(flags(data.jobs),[false,...Array(27).fill(true)]);
  assert.equal(metrics.suspectedTeammates(data.jobs).length,3);
  assert.equal(metrics.suspectedTeammates(data.jobs)[0].longest,28);
});

test('missing middle detail breaks teammate streaks and chart lines; importing it reconnects them',t=>{
  const store=setup(t);store.import([1,2,4,5].map(record).concat(summary([5,4,3,2,1],5)));
  let jobs=store.snapshot().jobs;assert.deepEqual(flags(jobs),[false,true,false,true]);
  assert.equal(metrics.suspectedTeammates(jobs).length,0);
  assert.deepEqual(Array.from(metrics.segments(jobs,jobs[0].players[0].key,'eggs'),s=>s.length),[2,2]);
  store.import([record(3)]);jobs=store.snapshot().jobs;
  assert.deepEqual(flags(jobs),[false,true,true,true,true]);
  assert.equal(metrics.suspectedTeammates(jobs)[0].longest,5);
});

test('excluded detail also breaks continuity rather than disappearing from streak counts',t=>{
  const store=setup(t),bad=record(3);delete bad.result.myResult.defeatEnemyCount;
  store.import([record(1),record(2),bad,record(4),record(5),summary([5,4,3,2,1],5)]);
  const data=store.snapshot();assert.equal(data.excluded.length,1);
  assert.deepEqual(flags(data.jobs),[false,true,false,true]);
  assert.equal(metrics.suspectedTeammates(data.jobs).length,0);
});

test('rolling summary windows preserve older edges but need explicit evidence to join two windows',t=>{
  const store=setup(t);store.import([1,2,3,4,5,6].map(record).concat(summary([3,2,1],6)));
  store.import([summary([6,5,4],6)]);
  assert.deepEqual(flags(store.snapshot().jobs),[false,true,true,false,true,true]);
  assert.equal(metrics.suspectedTeammates(store.snapshot().jobs)[0].longest,3);
  store.import([summary([4,3],6)]);
  const other=setup(t);other.restore(store.backup());
  assert.deepEqual(flags(other.snapshot().jobs),[false,true,true,true,true,true]);
  assert.equal(metrics.suspectedTeammates(other.snapshot().jobs)[0].longest,6);
});

test('a complete count or short time interval alone cannot prove adjacency',t=>{
  const store=setup(t);for(const n of [1,2,3])store.import([record(n),summary([n],3)]);
  const data=store.snapshot();assert.equal(data.shifts[0].complete,true);
  assert.deepEqual(flags(data.jobs),[false,false,false]);assert.equal(metrics.suspectedTeammates(data.jobs).length,0);
});

test('interrupted result is excluded from statistics but preserves confirmed teammate continuity',t=>{
  const store=setup(t),bad=record(3);bad.result.resultWave=-1;bad.result.waveResults=[];
  store.import([1,2,4,5].map(record).concat(bad,summary([5,4,3,2,1],4)));
  const data=store.snapshot(),s=data.shifts[0];
  assert.equal(s.complete,true);assert.equal(s.saved,4);assert.equal(s.loaded,4);assert.equal(s.interrupted,1);assert.equal(s.excluded,0);
  assert.equal(data.archived,5);assert.match(data.excluded[0].reasons.join(','),/对局中断/);
  assert.deepEqual(flags(data.jobs),[false,true,false,true]);
  assert.equal(metrics.suspectedTeammates(data.jobs).length,0);
});

test('interrupted result cannot fill a missing normal result; malformed result has a separate statistics count',t=>{
  const store=setup(t),bad=record(3);bad.result.resultWave=-1;bad.result.waveResults=[];
  store.import([record(1),bad,summary([3,2,1],2)]);
  let s=store.snapshot().shifts[0];assert.equal(s.complete,false);assert.equal(s.saved,1);assert.equal(s.total,2);
  const malformed=record(2);delete malformed.result.myResult.defeatEnemyCount;store.import([malformed]);
  s=store.snapshot().shifts[0];assert.equal(s.complete,true);assert.equal(s.saved,2);assert.equal(s.loaded,1);assert.equal(s.excluded,1);
});

test('chart timeline retains interrupted scores without changing statistics or bridging missing records',t=>{
  const store=setup(t),stopped=record(3);
  stopped.result.resultWave=-1;stopped.result.waveResults=[];stopped.result.afterGradePoint=540;
  for(const p of [stopped.result.myResult,...stopped.result.memberResults])p.goldenDeliverCount=0;
  store.import([record(1),record(2),stopped,record(4),record(6),summary([6,5,4,3,2,1],5)]);
  const d=store.snapshot(),timeline=d.chartJobs;
  assert.equal(d.jobs.length,4);assert.equal(timeline.length,5);
  assert.deepEqual(flags(d.jobs),[false,true,false,false]);
  assert.deepEqual(flags(timeline),[false,true,true,true,false]);
  assert.equal(timeline[2].interrupted,true);assert.equal(timeline[2].gradePoint,540);
  assert.deepEqual(timeline.map(j=>j.index),[1,2,3,4,5]);
  assert.equal(timeline[2].players[0].eggs,null);
  assert.equal(timeline[2].recordedPerformance.players[0].eggs,0);
  assert.equal(timeline[2].recordedPerformance.players[0].kills,stopped.result.myResult.defeatEnemyCount);
  assert.equal(metrics.suspectedTeammates(d.jobs).length,0);
  assert.equal(metrics.suspectedTeammates(timeline).length,3);
  assert.equal(metrics.suspectedTeammates(timeline)[0].longest,3);
  assert.deepEqual(Array.from(metrics.segments(timeline,timeline[0].players[0].key,'eggs'),part=>part.length),[4,1]);
});


test('four matches, interruption, two matches form a six-match teammate streak',t=>{
  const store=setup(t),stopped=record(5);stopped.result.resultWave=-1;stopped.result.waveResults=[];
  store.import([1,2,3,4,6,7].map(record).concat(stopped,summary([7,6,5,4,3,2,1],6)));
  const data=store.snapshot(),people=metrics.suspectedTeammates(data.chartJobs);
  assert.equal(people.length,3);
  for(const p of people){assert.equal(p.longest,6);assert.equal(p.count,6);}
  assert.equal(data.jobs.length,6);assert.equal(data.shifts[0].loaded,6);
});

test('interruptions preserve teammate runs only when roster and every adjacency are confirmed',()=>{
  const job=(n,interrupted=false)=>({time:String(n).padStart(2,'0'),continuousWithPrevious:n>0,interrupted,players:[{key:'a',name:'A'}]});
  const jobs=[job(0),job(1),job(2,true),job(3,true),job(4)];
  const rows=metrics.suspectedTeammates(jobs);
  assert.equal(rows.length,1);assert.equal(rows[0].longest,3);assert.equal(rows[0].count,3);
  for(let i=1;i<jobs.length;i++){
    const gap=structuredClone(jobs);gap[i].continuousWithPrevious=false;
    assert.equal(metrics.suspectedTeammates(gap).length,0);
  }
  for(let i=1;i<jobs.length;i++){
    const absent=structuredClone(jobs);absent[i].players=[];
    assert.equal(metrics.suspectedTeammates(absent).length,0);
  }
  assert.equal(metrics.suspectedTeammates(jobs.slice(0,-1)).length,0);
  assert.equal(metrics.suspectedTeammates([job(0,true),job(1),job(2)]).length,0);
  assert.equal(metrics.suspectedTeammates([job(0,true),job(1,true),job(2,true)]).length,0);
});
