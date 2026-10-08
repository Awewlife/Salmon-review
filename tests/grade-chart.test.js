import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={window:{}};vm.createContext(context);
vm.runInContext(readFileSync(new URL('../dist/grade-chart.js',import.meta.url),'utf8'),context);
const chart=context.window.SalmonGradeChart;
const jobs=values=>values.map((gradePoint,i)=>({id:'job-'+i,index:i+1,grade:'传说',gradePoint,jobPoint:9999,clear:i%2===0,continuousWithPrevious:i>0}));

test('score scales cover 0/40/999, keep flat series readable, and offer the full raw range',()=>{
  for(const values of [[40,60,40],[550,570,550],[999],[0],[40,200,600,999]]){
    const m=chart.model(jobs(values));
    assert.ok(m.lower<=Math.min(...values)&&m.upper>=Math.max(...values));
    assert.ok(m.upper>m.lower);assert.ok(m.ticks.length>=2&&m.ticks.length<=9);
    const svg=chart.render(jobs(values));assert.doesNotMatch(svg,/NaN|Infinity|9999/);
  }
  const focused=chart.model(jobs([550,570,550]));assert.ok(focused.lower>0&&focused.upper-focused.lower<=200);
  const full=chart.model(jobs([550,570]),true);assert.equal(full.lower,0);assert.equal(full.upper,999);
  assert.equal(full.ticks.at(-1),999);
});

test('promotion retains the real score jump; unknown scores and continuity gaps break the line',()=>{
  const data=jobs([90,40,60,null,80,100]);data[0].grade='熟练';data[5].continuousWithPrevious=false;
  const m=chart.model(data);
  assert.deepEqual(JSON.parse(JSON.stringify(m.segments.map(s=>s.map(p=>p.value)))),[[90,40,60],[80],[100]]);
  assert.match(chart.tooltip(data,1),/段位变化：熟练 90 → 传说 40/);
  assert.doesNotMatch(chart.tooltip(data,1),/-50 分/);
  assert.match(chart.tooltip(data,2),/\+20 分/);
  assert.match(chart.tooltip(data,5),/记录不连续/);
});

test('score chart supports a single match, missing scores, exact accessible values and safe labels',()=>{
  assert.match(chart.render(jobs([null,null])),/暂无可用/);
  const data=jobs([999]);data[0].grade='<img onerror="attack">';data[0].id='bad"<id>';
  const svg=chart.render(data,{width:310});
  assert.match(svg,/999 分/);assert.match(svg,/role="link"/);assert.match(svg,/tabindex="0"/);
  assert.doesNotMatch(svg,/<img|bad"<id>/);assert.match(svg,/&lt;img/);
  assert.doesNotMatch(chart.tooltip(data,0),/<img/);
  assert.match(svg,/cx="154.5"/);
});
