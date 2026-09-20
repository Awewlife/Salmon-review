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
