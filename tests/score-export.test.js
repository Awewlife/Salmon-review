import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const c=vm.createContext({window:{}});
for(const file of ['grade-chart.js','score-export.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
const api=c.window.SalmonScoreExport;
const shift={stage:{name:'场地 <&"'},start:'2026-10-07T08:00:00Z',end:'2026-10-09T00:00:00Z'};
const jobs=[620,540,60,80,40].map((gradePoint,i)=>({id:'job-'+i,index:i+1,gradeId:i<2?8:i<4?4:5,grade:i<2?'传说':i<4?'达人':'达人+1',gradePoint,interrupted:i===1,clear:i!==1&&i!==3,continuousWithPrevious:i>0}));
test('score export includes shift dates, saved scope and self-contained outcome legend with mixed rank ticks',()=>{
  const output=api.svg(jobs,shift),svg=output.svg;
  assert.equal(output.width,1160);assert.ok(output.height>460);
  for(const text of ['SALMON REVIEW · 分数变化','2026/10/07 16:00','2026/10/09 08:00','UTC+8','本期已保存场次','4 场有效结算','1 次掉线','传说 0','达人 0','通过','未通过','掉线'])assert.ok(svg.includes(text),text);
  assert.match(svg,/场地 &lt;&amp;&quot;/);
  assert.match(svg,/<circle class="score-point node-failed"/);assert.match(svg,/\.score-point.node-failed\{fill:#202528\}/);
  assert.match(svg,/<circle class="score-point node-interrupted"/);assert.match(svg,/stroke:#a8b0b4/);
  assert.doesNotMatch(svg,/var\(--|chart-hit|tabindex=|data-score-job|<script|<image|NaN|Infinity/);
});
test('score export reuses plot coordinates, preserves gaps and actual interrupted scores without mutating data',()=>{
  const data=structuredClone(jobs);data[3].gradePoint=null;data[4].continuousWithPrevious=false;
  const before=JSON.stringify(data),output=api.svg(data,shift).svg;
  const chart=c.window.SalmonGradeChart.render(data,{width:1100,interactive:false});
  const lines=svg=>[...svg.matchAll(/<polyline[^>]*points="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(lines(output),lines(chart));assert.equal(lines(output).length,1);
  assert.match(output,/>540<\/text>/);assert.equal(JSON.stringify(data),before);
});
test('pure legend single-point export stays auto-scaled, empty or unscored charts cannot export',()=>{
  const output=api.svg([{...jobs[0],gradePoint:550}],shift);
  assert.match(output.svg,/500–600 分/);assert.doesNotMatch(output.svg,/<rect class="score-rank-band/);
  assert.match(output.svg,/1 场有效结算/);
  for(const data of [[],[{...jobs[0],gradePoint:null}]]){
    assert.throws(()=>api.svg(data,shift),/暂无可导出/);
    assert.match(api.controls(data),/data-export-score="png" disabled/);
  }
});
