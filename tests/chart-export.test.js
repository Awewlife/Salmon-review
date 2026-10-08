import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function setup(){
  const ctx={window:{},esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt:String,date:s=>s};
  vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../dist/metrics.js',import.meta.url),'utf8'),ctx);ctx.SalmonStats=ctx.window.SalmonStats;
  vm.runInContext(readFileSync(new URL('../dist/chart-dialog.js',import.meta.url),'utf8'),ctx);
  ctx.jobs=Array.from({length:6},(_,i)=>({id:'test-'+i,index:i+1,time:'2026-09-26T12:00:00Z',continuousWithPrevious:i!==3,clear:i%2===0,players:[{key:'me',name:'玩家<&',eggs:i===0?900:10+i,kills:i+5,deaths:i%3}]}));
  ctx.people=[{key:'me',name:'玩家<&',self:true,color:'#d5ef68'}];return ctx;
}

test('range exports retain original indices and gap markers, rescale using only selected records and escape names',()=>{
  const c=setup();vm.runInContext('trendState={jobs,from:2,to:4}; chosen=trendRangeJobs(); output=trendExportSvg(chosen,people,["eggs","kills","deaths"],true,"场地<&")',c);
  assert.deepEqual(Array.from(c.chosen,j=>j.index),[3,4,5]);
  const svg=c.output.svg;
  assert.match(svg,/本期第 3—5 场/);assert.doesNotMatch(svg,/test-0|test-1|test-5|>900</);
  assert.match(svg,/场地&lt;&amp;/);assert.match(svg,/玩家&lt;&amp;/);
  assert.equal((svg.match(/class="chart-line"/g)??[]).length,6);
  assert.equal((svg.match(/node-cleared/g)??[]).length,7);assert.equal((svg.match(/node-failed/g)??[]).length,3);
  assert.doesNotMatch(svg,/chart-hit|tabindex|var\(--|<script|<image/);
  assert.match(svg,/width="1160"/);assert.match(svg,/被救援次数 · 次/);
});

test('single-match single-metric export centers the point and respects hidden name labels',()=>{
  const c=setup();vm.runInContext('output=trendExportSvg(jobs.slice(4,5),people,["deaths"],false,"场地")',c);
  assert.match(c.output.svg,/cx="491"/);assert.doesNotMatch(c.output.svg,/<g class="trend-line-label"/);
  assert.match(c.output.svg,/玩家&lt;&amp;/);assert.match(c.output.svg,/第 5—5 场 · 共 1 场/);
  assert.equal((c.output.svg.match(/class="chart-line"/g)??[]).length,1);
  assert.equal(c.jobs.length,6);
});

test('performance exports show an interruption hollow grey marker at zero without normal outcome markers on interruptions',()=>{
  const c=setup();
  vm.runInContext(`jobs=jobs.slice(1,4); jobs[1].interrupted=true; jobs[1].index=3; jobs[1].players[0].eggs=0; jobs[2].continuousWithPrevious=true; output=trendExportSvg(jobs,people,['eggs'],true,'场地');`,c);
  assert.match(c.output.svg,/2 场结算 · 1 次中断/);
  assert.equal((c.output.svg.match(/class="interruption-marker"/g)||[]).length,1);
  assert.match(c.output.svg,/<circle class="interruption-marker"[^>]*cy="226"[^>]*fill="#202528"[^>]*stroke="#a8b0b4"/);
  assert.doesNotMatch(c.output.svg,/<text[^>]*>中断<\/text>/);
  assert.equal((c.output.svg.match(/data-point-job=/g)||[]).length,2);
  assert.doesNotMatch(c.output.svg,/data-point-job="test-2"/);
  assert.equal((c.output.svg.match(/class="chart-line"/g)||[]).length,1);
});


test('solid chart segments include interruption positions but never bridge absent players or unconfirmed adjacency',()=>{
  const c=setup(),stats=c.SalmonStats;
  const job=(eggs,interrupted=false)=>({continuousWithPrevious:true,interrupted,players:[{key:'me',eggs}]});
  const jobs=[job(20),job(null,true),job(null,true),job(30)];
  const segments=rows=>JSON.parse(JSON.stringify(stats.segments(rows,'me','eggs')));
  assert.deepEqual(segments(jobs),[[{index:0,value:20},{index:1,value:0},{index:2,value:0},{index:3,value:30}]]);
  for(let index=1;index<jobs.length;index++){
    const gap=structuredClone(jobs);gap[index].continuousWithPrevious=false;
    assert.equal(segments(gap).length,2);
  }
  const absent=structuredClone(jobs);absent[1].players=[];
  assert.deepEqual(segments(absent).map(s=>s.map(p=>p.index)),[[0],[2,3]]);
  assert.deepEqual(segments([job(20),job(null),job(30)]).map(s=>s.map(p=>p.index)),[[0],[2]]);
  assert.deepEqual(segments(jobs.slice(1)).map(s=>s.map(p=>p.value)),[[0,0,30]]);
  assert.deepEqual(segments(jobs.slice(0,-1)).map(s=>s.map(p=>p.value)),[[20,0,0]]);
  assert.equal(jobs[1].players[0].eggs,null);
});

test('all three exported charts use solid player-colored lines through zero interruption nodes',()=>{
  const c=setup();
  vm.runInContext(`jobs=jobs.slice(1,4); jobs[1].interrupted=true; jobs[2].continuousWithPrevious=true; output=trendExportSvg(jobs,people,['eggs','kills','deaths'],false,'场地');`,c);
  const lines=[...c.output.svg.matchAll(/<polyline class="chart-line"[^>]+/g)].map(m=>m[0]);
  assert.equal(lines.length,3);
  assert.doesNotMatch(c.output.svg,/interruption-bridge|灰色虚线/);
  for(const [i,line] of lines.entries()){
    assert.match(line,/stroke="#d5ef68"/);assert.doesNotMatch(line,/stroke-dasharray/);
    const points=line.match(/points="([^"]+)"/)[1].split(' ').map(p=>p.split(',').map(Number));
    const [start,end,max]=[[11,13,20],[6,8,10],[1,0,5]][i];
    assert.deepEqual(points,[[42,226-start/max*208],[491,226],[940,226-end/max*208]]);
  }
  assert.equal((c.output.svg.match(/class="interruption-marker"[^>]*cy="226"/g)||[]).length,3);
  assert.doesNotMatch(c.output.svg,/data-point-job="test-2"/);
});
