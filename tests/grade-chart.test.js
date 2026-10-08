import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={window:{}};vm.createContext(context);
vm.runInContext(readFileSync(new URL('../dist/grade-chart.js',import.meta.url),'utf8'),context);
const chart=context.window.SalmonGradeChart;
const jobs=values=>values.map((gradePoint,i)=>({id:'job-'+i,index:i+1,grade:'传说',gradePoint,jobPoint:9999,clear:i%2===0,continuousWithPrevious:i>0}));

test('score scales cover 0/40/999, keep flat series readable, with automatic scaling',()=>{
  for(const values of [[40,60,40],[550,570,550],[999],[0],[40,200,600,999]]){
    const m=chart.model(jobs(values));
    assert.ok(m.lower<=Math.min(...values)&&m.upper>=Math.max(...values));
    assert.ok(m.upper>m.lower);assert.ok(m.ticks.length>=2&&m.ticks.length<=9);
    const svg=chart.render(jobs(values));assert.doesNotMatch(svg,/NaN|Infinity|9999/);
  }
  const focused=chart.model(jobs([550,570,550]));assert.ok(focused.lower>0&&focused.upper-focused.lower<=200);

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


test('score labels mark hundred bands once, the endpoint and recorded destinations of jumps',()=>{
  const m=chart.model(jobs([430,450,470,490,510,510,530,550,570,590,610,610]));
  assert.deepEqual(Array.from(m.labels,p=>p.value),[430,510,610,610]);
  assert.equal(m.labels.filter(p=>p.value===510).length,1);
  const changed=jobs([90,40,60,400,420,200,220]);changed[0].grade='熟练';
  const labels=chart.model(changed).labels;
  for(const i of [1,3,5])assert.ok(labels.some(p=>p.position===i&&p.reasons.includes('jump')));
  const normal=chart.model(jobs([550,570,560,540,540]));
  assert.deepEqual(Array.from(normal.labels,p=>p.position),[0,4]);
  const gap=jobs([550,570,null,570,590]);gap[4].continuousWithPrevious=false;
  assert.ok(chart.model(gap).labels.some(p=>p.position===3));
  const svg=chart.render(changed,{width:310});assert.doesNotMatch(svg,/NaN|Infinity/);
  assert.match(svg,/data-score-label-index="2"[^>]*jump/);
  assert.equal((svg.match(/class="score-annotation"/g)||[]).length,labels.length);
});

test('known interrupted score is grey and connected, but missing score or adjacency remains a gap',()=>{
  const data=jobs([560,540,560]);data[1].interrupted=true;data[1].index=2;
  assert.equal(chart.model(data).segments.length,1);
  assert.match(chart.render(data),/score-point node-interrupted/);
  assert.doesNotMatch(chart.render(data),/<text[^>]*>中断<\/text>/);
  assert.match(chart.render(data),/score-annotation interrupted/);
  assert.match(chart.tooltip(data,1),/对局中断/);
  assert.doesNotMatch(chart.tooltip(data,1),/未通过/);
  assert.match(chart.tooltip(data,1),/540/);
  data[1].gradePoint=null;
  assert.deepEqual(Array.from(chart.model(data).segments,p=>p.length),[1,1]);
  assert.match(chart.render(data),/interruption-marker/);
  assert.match(chart.tooltip(data,1),/未提供/);
  data[1].gradePoint=540;data[2].continuousWithPrevious=false;
  assert.deepEqual(Array.from(chart.model(data).segments,p=>p.length),[2,1]);
});
