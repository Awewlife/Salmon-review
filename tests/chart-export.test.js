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
