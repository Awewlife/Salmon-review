import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({window:{},Event});
for(const name of ['metrics','radar','radar-compare','radar-export','i18n-catalog','i18n'])vm.runInContext(readFileSync(new URL(`../dist/${name}.js`,import.meta.url),'utf8'),context);
const api=context.window.SalmonRadarCompare;
const keys=['eggs','kills','power','rescues','deaths'];
const job=(i,values=[10,10,10,10])=>({id:`j${i}`,time:new Date(Date.UTC(2026,0,1)+i*3600000).toISOString(),players:values.map((value,n)=>({key:`p${n}`,me:n===0,...Object.fromEntries(keys.map(k=>[k,value]))}))});

test('recent means 100 valid jobs after sorting, not 100 archived rows or one shift',()=>{
 const jobs=Array.from({length:125},(_,i)=>({...job(i),shift:i<70?'a':'b'}));
 jobs[124].interrupted=true;jobs[123].supported=false;delete jobs[122].players[1].kills;
 const before=JSON.stringify(jobs);const c=api.model(jobs.toReversed());
 assert.equal(c.all.count,122);assert.equal(c.all.excluded,3);assert.equal(c.recent.count,100);
 assert.equal(c.recentJobs[0].id,'j22');assert.equal(c.recentJobs.at(-1).id,'j121');assert.equal(c.same,false);
 assert.equal(JSON.stringify(jobs),before);
});

test('both series aggregate totals and share one scale, with recent included in history',()=>{
 const jobs=[job(0,[10000,0,0,0]),...Array.from({length:100},(_,i)=>job(i+1))];
 const c=api.model(jobs);assert.equal(c.all.count,101);assert.equal(c.recent.rows[0].index,100);
 assert.equal(c.all.rows[0].personal,11000/101);assert.ok(c.all.rows[0].index>300);
 assert.equal(c.max,350);assert.equal(c.rows[0].delta,-214.3);assert.equal(api.delta(c.rows[0]),'↓ 214.3 个百分点');
 const html=api.render(jobs);assert.match(html,/350%/);assert.equal((html.match(/class="radar-historical"/g)||[]).length,1);
 assert.equal((html.match(/radar-grid radar-reference/g)||[]).length,1);assert.doesNotMatch(html,/class="radar-baseline"/);
});

test('small archives explicitly identify overlapping samples and never fabricate 100 jobs',()=>{
 for(const n of [1,25,100]){
   const jobs=Array.from({length:n},(_,i)=>job(i)),c=api.model(jobs);
   assert.equal(c.same,true);assert.equal(c.recent.count,n);assert.ok(c.rows.every(r=>r.delta===0));
   const html=api.render(jobs);assert.match(html,/近期样本与全部历史相同/);assert.ok(html.includes(`最近 ${n} 场`));
 }
 assert.doesNotMatch(api.render([{...job(0),interrupted:true}]),/<svg/);
 assert.throws(()=>api.sourceSvg([]));
});

test('survival caps do not hide raw averages or claim a zero change',()=>{
 const c=api.model(Array.from({length:101},(_,i)=>job(i,i===0?[0,8,8,8]:[1,20,20,20])));
 const row=c.rows[4];assert.equal(row.bothAtCap,true);assert.equal(api.delta(row),'均已封顶');
 assert.notEqual(row.recent.personal,row.all.personal);
 const html=api.render(c.allJobs,{table:'averages'});assert.match(html,/被救援/);assert.match(html,/15.3/);
 const zero=api.model([job(0,[0,0,0,0])]);assert.equal(zero.rows[4].bothAtCap,false);assert.equal(zero.rows[4].recent.index,100);
 assert.doesNotMatch(api.render([job(0,[0,0,0,0])]),/NaN|Infinity/);
});

test('exports keep both series, two date ranges and the selected table without shift metadata',()=>{
 const jobs=Array.from({length:101},(_,i)=>job(i));
 for(const table of ['index','averages']){
   const out=context.window.SalmonRadarExport.svg(jobs,null,'Player <&>',{history:true,comparison:true,table});
   assert.equal(out.width,1000);assert.equal(out.height,1230);
   for(const text of ['近期对比','最近 100 场','全部历史 · 101 场有效结算','2026-01-01','2026-01-05','Player &lt;&amp;&gt;','radar-historical','100% 均分基准'])assert.ok(out.svg.includes(text),text);
   if(table==='averages'){assert.match(out.svg,/个人场均/);assert.match(out.svg,/全队 25% 场均/);assert.doesNotMatch(out.svg,/个百分点/)}
   else {assert.match(out.svg,/差值/);assert.match(out.svg,/个百分点/)}
   assert.doesNotMatch(out.svg,/本期|排班：|NaN|Infinity|foreignObject/);
 }
});

test('comparison UI and image texts translate fully into English and Inkling',()=>{
 const jobs=Array.from({length:3},(_,i)=>job(i));
 for(const table of ['index','averages']){
   const html=api.render(jobs,{table})+api.sourceSvg(jobs,'',{table}).svg;
   const texts=[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1]).filter(t=>/[\u3400-\u9fff]/.test(t));
   for(const text of texts)for(const language of ['en','inkling'])assert.doesNotMatch(context.window.SalmonI18n.t(text,language),/[\u3400-\u9fff]/,text);
 }
 assert.equal(context.window.SalmonI18n.t('近期对比','ja'),'最近との比較');
 assert.equal(context.window.SalmonI18n.t('全部历史','zh-TW'),'全部歷史');
 context.window.SalmonI18n.set('inkling');
 assert.throws(()=>context.window.SalmonRadarExport.svg(jobs,null,'',{history:true,comparison:true}),/inkling_png_only/);
 assert.doesNotThrow(()=>context.window.SalmonRadarExport.svg(jobs,null,'',{history:true,comparison:true,rasterize:true}));
 context.window.SalmonI18n.set('zh-CN');
});


test('the comparison module is served by the application and included in the page',async t=>{
 const {createApp}=await import('../server/main.js');
 const {mkdtempSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'salmon-compare-test-'));
 const app=await createApp({directory:dir});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})});
 const base='http://127.0.0.1:'+app.server.address().port;
 const response=await fetch(base+'/radar-compare.js');assert.equal(response.status,200);assert.match(await response.text(),/SalmonRadarCompare/);
 assert.match(await (await fetch(base)).text(),/src="radar-compare.js"/);
});


test('previous baseline uses the immediately preceding disjoint block of up to 100 valid jobs',()=>{
 for(const [n,previous] of [[101,1],[150,50],[200,100],[201,100],[250,100]]){
   const valid=Array.from({length:n},(_,i)=>job(i));
   const extra=[{...job(n+1),interrupted:true},{...job(n+2),supported:false}];
   const c=api.model([...valid,...extra].toReversed(),{period:'previous'});
   assert.equal(c.period,'previous');assert.equal(c.recent.count,100);assert.equal(c.all.count,previous);
   assert.equal(c.allJobs[0].id,'j'+Math.max(0,n-200));assert.equal(c.allJobs.at(-1).id,'j'+(n-101));
   assert.equal(c.recentJobs[0].id,'j'+(n-100));assert.equal(c.recentJobs.at(-1).id,'j'+(n-1));
   assert.equal(c.same,false);assert.equal(c.ready,true);
   assert.ok(c.allJobs.every(j=>!c.recentJobs.some(r=>r.id===j.id)));
   const html=api.render(valid,{period:'previous'});assert.ok(html.includes(`前 ${previous} 场`));
   if(previous<100)assert.ok(html.includes(`前段仅有 ${previous} 场有效结算`));
   assert.doesNotMatch(html,/全部历史包含|近期样本与全部历史相同/);
 }
});

test('no earlier block never creates a zero baseline or an exportable comparison',()=>{
 for(const n of [0,1,99,100]){
   const jobs=Array.from({length:n},(_,i)=>job(i));const c=api.model(jobs,{period:'previous'});
   assert.equal(c.ready,false);assert.equal(c.all.count,0);assert.equal(c.recent.count,n);
   assert.doesNotMatch(api.render(jobs,{period:'previous'}),/<svg/);
   if(n)assert.match(api.render(jobs,{period:'previous'}),/尚无更早的有效场次/);
   assert.throws(()=>api.sourceSvg(jobs,'',{period:'previous'}));
   assert.match(context.window.SalmonRadarExport.controls(jobs,{available:c.ready}),/disabled/);
 }
});

test('previous mode exports correct ranges, values, sample warnings and purple baseline',()=>{
 const jobs=Array.from({length:150},(_,i)=>job(i,i<50?[2,6,6,6]:[8,4,4,4]));
 for(const table of ['index','averages']){
   const output=context.window.SalmonRadarExport.svg(jobs,null,'Player',{history:true,comparison:true,period:'previous',table});
   assert.match(output.svg,/前 50 场/);assert.match(output.svg,/前段仅有 50 场有效结算/);
   assert.match(output.svg,/两组有效场次互不重叠/);assert.doesNotMatch(output.svg,/全部历史包含|#91adb9/);
   assert.match(output.svg,/#b99aff/);assert.match(output.svg,/#7a8388/);
   if(table==='index'){assert.match(output.svg,/160%/);assert.match(output.svg,/40%/);assert.match(output.svg,/120 个百分点/)}
 }
});

test('new period controls, warnings and exports translate in all supported locales',()=>{
 const jobs=Array.from({length:150},(_,i)=>job(i));
 const contents=[api.render(jobs,{period:'previous'}),api.sourceSvg(jobs,'',{period:'previous'}).svg,api.render([job(0)],{period:'previous'})];
 const texts=contents.flatMap(html=>[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1])).filter(t=>/[\u3400-\u9fff]/.test(t));
 texts.push('对比前 100 场','对比全部历史','对照范围');
 for(const text of texts)for(const lang of ['en','inkling'])assert.doesNotMatch(context.window.SalmonI18n.t(text,lang),/[\u3400-\u9fff]/,lang+': '+text);
 assert.equal(context.window.SalmonI18n.t('前 50 场','zh-TW'),'前 50 場');
 assert.equal(context.window.SalmonI18n.t('前 50 场','ja'),'その前の50回');
 context.window.SalmonI18n.set('inkling');
 assert.throws(()=>context.window.SalmonRadarExport.svg(jobs,null,'',{comparison:true,period:'previous'}),/inkling_png_only/);
 context.window.SalmonI18n.set('zh-CN');
});
