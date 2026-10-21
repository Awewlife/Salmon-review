import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeCareer,validateCareer,loadOfficialCareer} from '../server/career.js';
import {Store} from '../server/store.js';
import {Tasks} from '../server/tasks.js';
import {createApp} from '../server/main.js';
import {fixture} from './fixtures.js';
const img={url:'https://cdn.nintendo.net/icon.png'};
function career(){return normalizeCareer({stageHighestRecords:[{coopStage:{id:'stage1',name:'地图',image:img},grade:{name:'传说'},gradePoint:999}],defeatEnemyRecords:[{enemy:{id:'enemy1',name:'高塔鱼',image:img},defeatCount:12345}],defeatBossRecords:[{enemy:{id:'boss1',name:'横纲',image:img},defeatCount:321}]},fixture().record.result.myResult.player,'https://cdn.nintendo.com/avatar.jpg')}
function setup(t){const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-career-'));const store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});return store}
test('official totals are stored verbatim, independent of local match totals; snapshot contains only local asset URLs',t=>{
 const s=setup(t);const f=fixture();s.import([f.record,f.summary]);const before=s.backup().documents;s.saveCareer(career());
 assert.deepEqual(s.backup().documents,before);assert.equal(s.career().record.enemies[0].count,12345);assert.equal(s.career().record.stages[0].gradePoint,999);assert.match(s.career().record.avatar,/^\/assets\//);assert.equal(s.career().record.owner,undefined);
});
test('career rejects missing counts and untrusted images, preserves unknown stage records',()=>{
 const c=career();c.enemies[0].count=null;assert.throws(()=>validateCareer(c));c.enemies[0].count=3;c.avatar='http://localhost/private';assert.throws(()=>validateCareer(c));
 const raw={stageHighestRecords:[{coopStage:{id:'s',name:'未知'},grade:null,gradePoint:null}],defeatEnemyRecords:[],defeatBossRecords:[]};assert.equal(normalizeCareer(raw,fixture().record.result.myResult.player,null).stages[0].gradePoint,null);
 assert.throws(()=>normalizeCareer({...raw,defeatEnemyRecords:[{enemy:{id:'e',name:'鱼'}}]},fixture().record.result.myResult.player,null));
});
test('career backup roundtrip and account mismatch reject before any records are imported',t=>{
 const s=setup(t),other=setup(t),f=fixture();s.import([f.record,f.summary]);s.saveCareer(career());const b=s.backup();other.restore(b);assert.deepEqual(other.get('career'),s.get('career'));
 const mismatch=setup(t),wrong=structuredClone(b);wrong.career.owner='b'.repeat(24);assert.throws(()=>mismatch.restore(wrong),/account_mismatch/);assert.equal(mismatch.snapshot().archived,0);
 assert.throws(()=>s.saveCareer(wrong.career),/account_mismatch/);assert.equal(s.get('career').enemies[0].count,12345);
 const legacy=setup(t);legacy.restore({format:b.format,version:1,documents:b.documents});assert.equal(legacy.get('career'),null);
});
test('failed refresh preserves official snapshot and errors are sanitized; locks prevent conflicting sync',async t=>{
 const s=setup(t);s.saveCareer(career());const a={read:()=>({backend:'nxapi-cli',profile:'fake'})};const tasks=new Tasks(s,a,async()=>{throw new Error('network')});
 await assert.rejects(tasks.refreshCareer(),/network/);assert.equal(s.get('career').enemies[0].count,12345);assert.equal(s.career().error.code,'network');assert.equal(tasks.active,false);
 tasks.active=true;await assert.rejects(tasks.refreshCareer(),/busy/);tasks.active=false;tasks.updateLocked=true;await assert.rejects(tasks.refreshCareer(),/busy/);
});
test('career API requires CSRF, returns official records without owner or credentials',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-career-api-'));const app=await createApp({directory:dir,runner:async()=>career()});
 app.account.read=()=>({backend:'nxapi-cli',profile:'fake'});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})});const base='http://127.0.0.1:'+app.server.address().port;
 const no=await fetch(base+'/api/career/refresh',{method:'POST'});assert.equal(no.status,403);
 const state=await(await fetch(base+'/api/status')).json();const result=await fetch(base+'/api/career/refresh',{method:'POST',headers:{'X-Salmon-CSRF':state.csrf}});assert.equal(result.status,200);
 const data=await result.json();assert.equal(data.record.bosses[0].count,321);assert.equal(data.record.owner,undefined);assert.equal(data.record.stages[0].gradePoint,999);
 const cached=await(await fetch(base+'/api/career')).json();assert.deepEqual(cached,data);
});

test('live query flow binds official career data to a fresh coop identity, not currentPlayer name',async()=>{
 const calls=[];const player=fixture().record.result.myResult.player;
 const client={getCoopHistory:async()=>({data:{coopResult:{historyGroups:{nodes:[{historyDetails:{nodes:[{id:'latest'}]}}]}}}}),getCoopHistoryDetail:async id=>{calls.push(id);return {data:{coopHistoryDetail:{myResult:{player}}}}},persistedQuery:async(id,args)=>{calls.push(id,args);return {data:{coopRecord:{stageHighestRecords:[],defeatEnemyRecords:[],defeatBossRecords:[]}}}}};
 const result=await loadOfficialCareer(client,'official-hash',null);assert.equal(result.owner,career().owner);assert.deepEqual(calls,['latest','official-hash',{}]);
 client.getCoopHistory=async()=>({errors:[{}],data:{coopResult:{historyGroups:{nodes:[]}}}});await assert.rejects(loadOfficialCareer(client,'official-hash',null),/upstream/);
});
