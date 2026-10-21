import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx={window:{}};vm.createContext(ctx);
for(const file of ['metrics','radar'])vm.runInContext(readFileSync(new URL('../dist/'+file+'.js',import.meta.url),'utf8'),ctx);
const {model,render}=ctx.window.SalmonRadar;
const keys=['eggs','kills','power','rescues','deaths'];
const job=(values)=>({players:values.map((v,i)=>({key:'p'+i,me:i===0,...Object.fromEntries(keys.map(k=>[k,v]))}))});
test('radar divides personal average by team quarter average, not average of match percentages',()=>{
 const m=model([job([10,10,10,10]),job([90,0,0,10])]);
 assert.equal(m.count,2);assert.equal(m.rows.length,5);
 for(const d of m.rows){assert.equal(d.personal,50);assert.equal(d.baseline,17.5);assert.ok(Math.abs(d.percent-285.714285714)<1e-8)}
 assert.equal(m.max,300);
});
test('all-zero valid matches are zero percent with a visible 100 percent baseline',()=>{
 const m=model([job([0,0,0,0])]);assert.equal(m.count,1);assert.equal(m.max,100);
 assert.ok(m.rows.every(d=>d.percent===0&&d.personal===0&&d.baseline===0));assert.doesNotMatch(render([job([0,0,0,0])]),/NaN|Infinity/);
});
test('interruptions and incomplete records never dilute any dimension',()=>{
 const missing=job([10,10,10,10]);delete missing.players[2].rescues;
 const duplicate=job([10,10,10,10]);duplicate.players[2].key='p1';
 const noSelf=job([10,10,10,10]);noSelf.players[0].me=false;
 const m=model([job([20,10,10,0]),{...job([0,0,0,0]),interrupted:true},missing,duplicate,noSelf,{...job([9,9,9,9]),supported:false}]);
 assert.equal(m.count,1);assert.equal(m.excluded,5);assert.ok(m.rows.every(d=>d.personal===20&&d.baseline===10&&d.percent===200));
});
test('self is found by me flag; rescues and rescued keep their own values and direction',()=>{
 const j=job([10,20,30,40]);j.players[0].rescues=2;j.players[0].deaths=8;j.players.reverse();
 const m=model([j]);assert.equal(m.rows[3].personal,2);assert.equal(m.rows[4].personal,8);assert.ok(m.rows[4].percent>m.rows[3].percent);
 assert.match(render([j]),/生存指数由被救援次数反向计算/);
});
test('maximum individual share fits 400 percent, and missing data shows an empty state',()=>{
 const m=model([job([100,0,0,0])]);assert.equal(m.max,400);assert.ok(m.rows.every(d=>d.percent===400));
 assert.match(render([]),/暂无完整/);assert.doesNotMatch(render([]),/<svg/);
});
test('radar uses player totals, as existing quarter lines do, not enemy or wave aggregates',()=>{
 const j={...job([10,10,10,10]),kills:200,eggs:900,power:4000};
 assert.ok(model([j]).rows.every(d=>d.baseline===10&&d.percent===100));
});
test('radar tab choice survives preference save and reload',()=>{
 let value=null;const window={localStorage:{getItem:()=>value,setItem:(k,v)=>{value=v}}};
 const c=vm.createContext({window}),source=readFileSync(new URL('../dist/preferences.js',import.meta.url),'utf8');
 vm.runInContext(source,c);window.SalmonPreferences.save({overviewMode:'radar'});vm.runInContext(source,c);
 assert.equal(window.SalmonPreferences.get().overviewMode,'radar');
});

test('rescued axis reverses direction while preserving actual averages and raw ratios',()=>{
 const low=model([job([1,3,2,2])]).rows[4];
 assert.equal(low.personal,1);assert.equal(low.baseline,2);assert.equal(low.percent,50);assert.equal(low.index,200);assert.equal(low.capped,false);
 const high=model([job([4,0,2,2])]).rows[4];assert.equal(high.index,50);assert.equal(high.percent,200);
 const equal=model([job([2,2,2,2])]).rows[4];assert.equal(equal.index,100);
});
test('rescued inverse index handles zero and caps only drawing values',()=>{
 const zero=model([job([0,4,4,4])]).rows[4];assert.equal(zero.index,200);assert.equal(zero.personal,0);assert.equal(zero.capped,true);
 const allZero=model([job([0,0,0,0])]).rows[4];assert.equal(allZero.index,100);assert.equal(allZero.capped,false);
 const extreme=model([job([1,20,20,20])]).rows[4];assert.equal(extreme.index,200);assert.equal(extreme.baseline,15.25);assert.equal(extreme.capped,true);
 assert.match(render([job([1,20,20,20])]),/200%（封顶）/);
});
vm.runInContext(readFileSync(new URL('../dist/radar-export.js',import.meta.url),'utf8'),ctx);
const exporter=ctx.window.SalmonRadarExport;
const shift={stage:{name:'地图 <test> & 名称'},start:'2026-10-21T00:00:00Z',end:'2026-10-22T16:00:00Z'};
test('radar export contains same plot, five raw average rows, legend and inverse rules',()=>{
 const jobs=[job([1,20,20,20])],output=exporter.svg(jobs,shift,'玩家 <&>');
 assert.equal(output.width,900);assert.equal(output.height,1100);
 const chart=render(jobs).match(/<svg\b[\s\S]*?<\/svg>/)[0];
 assert.ok(output.svg.includes(chart.replace('<svg ','<svg x="150" y="150" width="600" height="492" ')));
 for(const text of ['搬蛋 · 颗','击杀 · 只','红蛋 · 颗','救援 · 次','被救援 · 次','全队 25% · 100% 基准','个人场均','图示指数','最高 200%','15.3','（封顶）'])assert.ok(output.svg.includes(text),text);
 assert.ok(output.svg.includes('地图 &lt;test&gt; &amp; 名称'));assert.ok(output.svg.includes('玩家 &lt;&amp;&gt;'));
 assert.doesNotMatch(output.svg,/NaN|Infinity|foreignObject|var\(--/);
 assert.match(output.svg,/2026\/10\/21 08:00/);
});
test('radar export rejects empty samples and handles all zero and long names',()=>{
 assert.throws(()=>exporter.svg([],shift));assert.match(exporter.controls([]),/disabled/);
 const output=exporter.svg([job([0,0,0,0])],shift,'玩家'.repeat(40));
 assert.match(output.svg,/textLength="820"/);assert.doesNotMatch(output.svg,/NaN|Infinity/);
});

vm.runInContext(readFileSync(new URL('../dist/radar-view.js',import.meta.url),'utf8'),ctx);
const rangeView=ctx.window.SalmonRadarView;
test('selected range is inclusive and export uses only selected matches with original numbering',()=>{
 const jobs=[job([90,10,10,10]),job([2,2,2,2]),job([4,4,4,4]),job([80,1,1,1])].map((j,i)=>({...j,id:'j'+i,index:21+i}));
 const selected=rangeView.select(jobs,1,2);
 assert.equal(selected.jobs.length,2);assert.equal(model(selected.jobs).rows[0].personal,3);
 const output=exporter.svg(selected.jobs,shift,'玩家');
 assert.match(output.svg,/本期第 22—23 场 · 已选 2 场 · 统计 2 场/);
 assert.equal(ctx.window.SalmonRadar.rangeLabel(jobs.slice(2,3)),'本期第 23 场（单场）');
 assert.match(exporter.svg(jobs.slice(2,3),shift,'玩家',{single:true}).svg,/单场五维图/);
 assert.match(render(jobs.slice(2,3),{single:true}),/本场个人/);
});
test('range clamps invalid boundaries and handles interrupted-only selection honestly',()=>{
 const jobs=[{...job([0,0,0,0]),interrupted:true,index:30}, {...job([10,10,10,10]),index:31}];
 assert.equal(rangeView.select(jobs,-10,100).jobs.length,2);
 assert.equal(rangeView.select(jobs,1,0).jobs.length,1);
 assert.equal(rangeView.select([],0,3).jobs.length,0);
 const selected=rangeView.select(jobs,0,0).jobs;
 assert.equal(model(selected).count,0);assert.match(exporter.controls(selected),/disabled/);assert.throws(()=>exporter.svg(selected,shift));
 assert.match(render(selected),/暂无完整/);
});
test('range including interruption preserves selected boundaries but excludes interruption from means',()=>{
 const jobs=[{...job([10,10,10,10]),index:5},{...job([0,0,0,0]),index:6,interrupted:true},{...job([30,30,30,30]),index:7}];
 assert.equal(model(jobs).rows[0].personal,20);
 assert.match(exporter.svg(jobs,shift).svg,/本期第 5—7 场 · 已选 3 场 · 统计 2 场 · 1 场未计入/);
});
