import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {Store} from '../server/store.js';
import {safeAssetUrl} from '../server/normalize.js';
import {fixture} from './fixtures.js';
function setup(t){const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-test-'));const store=new Store(dir);t.after(()=>{try{store.close()}catch{};rmSync(dir,{recursive:true,force:true})});return {store,dir}}
const context={window:{}};vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/metrics.js',import.meta.url),'utf8'),context);const metrics=context.window.SalmonStats;
test('empty store, orphan import, summary arrival, deduplication and restart',t=>{
  const {store,dir}=setup(t),f=fixture();assert.equal(store.snapshot().jobs.length,0);
  store.import([f.record]);assert.equal(store.snapshot().archived,1);assert.equal(store.snapshot().jobs.length,0);
  store.import([f.summary]);let d=store.snapshot();assert.equal(d.jobs.length,1);assert.equal(d.shifts[0].complete,true);assert.equal(d.jobs[0].kills,46);
  assert.equal(store.import([f.record]).skipped,1);store.close();const reopened=new Store(dir);assert.equal(reopened.snapshot().jobs.length,1);reopened.close();
});
test('old shifts persist when a new summary arrives; same day rules have separate identities',t=>{
  const {store}=setup(t),a=fixture(),b=fixture({id:'match-2',start:'2026-09-21T00:00:00Z'});store.import([a.record,a.summary]);store.import([b.record,b.summary]);assert.equal(store.snapshot().shifts.length,2);
  const unsupported=fixture({id:'contest',rule:'TEAM_CONTEST'});store.import([unsupported.record,unsupported.summary]);assert.equal(store.snapshot().jobs.length,2);assert.equal(store.snapshot().excluded.length,1);
});
test('atomic import rejects mixed accounts, invalid player IDs and credential files',t=>{
  const {store}=setup(t),a=fixture(),b=fixture({id:'another',owner:'other'});assert.throws(()=>store.import([a.record,b.record]),/account_mismatch/);assert.equal(store.snapshot().archived,0);
  store.import([a.record]);assert.throws(()=>store.import([b.record]),/account_mismatch/);
  const broken=fixture({id:'broken'});delete broken.record.result.memberResults[0].player.id;assert.throws(()=>store.import([broken.record]),/invalid_record/);assert.equal(store.snapshot().archived,1);
  assert.throws(()=>store.import([{result:{session_token:'test-secret'}}]),/credentials_in_import/);
});
test('missing statistics are excluded, never treated as zero',t=>{
  const {store}=setup(t),f=fixture();delete f.record.result.myResult.defeatEnemyCount;store.import([f.record,f.summary]);assert.equal(store.snapshot().archived,1);assert.equal(store.snapshot().jobs.length,0);assert.match(store.snapshot().excluded[0].reasons.join(','),/不完整/);
});
test('duplicate waves and missing hazard cannot silently contribute to totals',t=>{
  const {store}=setup(t),a=fixture({id:'bad-wave'}),b=fixture({id:'bad-hazard'});a.record.result.waveResults.push(a.record.result.waveResults[0]);delete b.record.result.dangerRate;store.import([a.record,a.summary,b.record,b.summary]);assert.equal(store.snapshot().archived,2);assert.equal(store.snapshot().jobs.length,0);
});
test('backup roundtrip preserves raw fields, no credentials, idempotent restore',t=>{
  const {store}=setup(t),f=fixture();store.import([f.record,f.summary]);const backup=store.backup();const other=setup(t).store;other.restore(backup);assert.deepEqual(other.backup().documents,backup.documents);assert.equal(other.restore(backup).added,0);assert.equal(JSON.stringify(backup).includes('session_token'),false);
});
test('failed waves and remaining specials; clear including failed king never tagged',t=>{
  const {store}=setup(t);for(const wave of [1,2,3]){const f=fixture({id:'wave-'+wave,failedWave:wave});store.import([f.record,f.summary])}
  const jobs=store.snapshot().jobs;for(const j of jobs){assert.equal(metrics.passedWaves(j),j.failedWave-1);assert.equal(metrics.unusedSpecials(j,j.players[0]).remaining,1)}
  const j=structuredClone(jobs[0]);j.clear=true;assert.equal(metrics.unusedSpecials(j,j.players[0]),null);j.clear=false;j.waves.push({number:4,specials:[j.players[0].special]});assert.equal(metrics.unusedSpecials(j,j.players[0]).remaining,1);
  j.waves[0].specials.push(j.players[0].special);assert.equal(metrics.unusedSpecials(j,j.players[0]),null);
  j.players[1].special.weaponId=j.players[0].special.weaponId;assert.equal(metrics.unusedSpecials(j,j.players[0]),null);
});
test('same nicknames remain distinct; rename retains identity; absent matches break lines',()=>{
  const jobs=[['a','b'],['a'],['a','b']].map((ids,i)=>({time:String(i),continuousWithPrevious:i>0,players:ids.map(key=>({key,name:i===2?'新名字':'同名',me:false,kills:1}))}));
  assert.equal(metrics.suspectedTeammates(jobs).length,1);assert.equal(metrics.suspectedTeammates(jobs)[0].key,'a');assert.equal(metrics.segments(jobs,'b','kills').length,2);assert.equal(metrics.killAverage([],true).value,null);
});
test('asset URL allowlist',()=>{
  assert.equal(safeAssetUrl('http://127.0.0.1/test'),null);assert.equal(safeAssetUrl('https://cdn.nintendo.net.attacker.com/test'),null);assert.equal(safeAssetUrl('https://cdn.nintendo.net:444/test'),null);assert.equal(safeAssetUrl('https://cdn.nintendo.net/test'),'https://cdn.nintendo.net/test');
});
