import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalize} from '../server/normalize.js';
import {fixture} from './fixtures.js';
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

test('promotion preserves raw values; unknown scores and continuity gaps break the line',()=>{
  const data=jobs([90,40,60,null,80,100]);data[0].grade='熟练';data[5].continuousWithPrevious=false;
  const m=chart.model(data);
  assert.deepEqual(JSON.parse(JSON.stringify(m.segments.map(s=>s.map(p=>p.value)))),[[90,40,60],[80],[100]]);
  assert.match(chart.tooltip(data,1),/段位变化：熟练 90 → 传说 40/);
  assert.doesNotMatch(chart.tooltip(data,1),/-50 分/);
  assert.match(chart.tooltip(data,2),/\+20 分/);
  assert.match(chart.tooltip(data,5),/记录不连续/);
});

test('mixed ranks climb through promotions without plotting the raw score reset as a fall',()=>{
  const data=jobs([60,80,40,80,40,80,40,80,40,200,400,999]);
  const ids=[4,4,5,5,6,6,7,7,8,8,8,8];
  data.forEach((job,i)=>{job.gradeId=ids[i];job.grade=['达人','达人+1','达人+2','达人+3','传说'][ids[i]-4]});
  const before=JSON.stringify(data),m=chart.model(data);
  assert.equal(m.mixed,true);assert.equal(m.segments.length,1);
  for(let i=1;i<m.points.length;i++)assert.ok(m.points[i].coordinate>m.points[i-1].coordinate);
  assert.equal(m.points.at(-1).coordinate,m.upper);assert.equal(m.upper,1799);
  assert.ok(m.tickLabels.includes('达人+3 0'));assert.ok(m.tickLabels.includes('传说 0'));
  assert.equal(m.tickLabels.at(-1),'传说 999');
  const svg=chart.render(data,{width:310});
  assert.match(svg,/>分数<\/text>/);assert.doesNotMatch(svg,/段位进度|>1799<|NaN|Infinity/);
  for(const label of ['达人+1 40','达人+2 40','达人+3 40','传说 40'])assert.ok(svg.includes('>'+label+'</text>'));
  assert.equal(JSON.stringify(data),before);
});

test('demotion and equal raw scores remain distinct across grades, with real values on nodes',()=>{
  const data=jobs([620,60,80,40,60,80,40,60]);
  data.forEach((job,i)=>{job.gradeId=[8,4,4,5,5,5,6,6][i];job.grade=['达人','达人+1','达人+2','达人+3','传说'][job.gradeId-4]});
  const m=chart.model(data),svg=chart.render(data);
  assert.ok(m.points[1].coordinate<m.points[0].coordinate);
  assert.ok(m.points[3].coordinate>m.points[2].coordinate);
  assert.ok(m.points[7].coordinate>m.points[4].coordinate&&m.points[4].coordinate>m.points[1].coordinate);
  assert.ok(m.lower<=Math.min(...m.points.map(p=>p.coordinate))&&m.upper>=Math.max(...m.points.map(p=>p.coordinate)));
  assert.match(svg,/>达人 60<\/text>/);assert.match(svg,/>达人\+2 60<\/text>/);
  assert.match(chart.tooltip(data,1),/传说 620 → 达人 60/);assert.doesNotMatch(chart.tooltip(data,1),/1420|460/);
});

test('pure legend retains the original numeric zoom, including at 0 and 999',()=>{
  const m=chart.model(jobs([550,570,550]));
  assert.equal(m.mixed,false);assert.equal(m.lower,500);assert.equal(m.upper,620);
  assert.deepEqual(Array.from(m.ticks),[500,520,540,560,580,600,620]);
  assert.deepEqual(Array.from(m.points,p=>p.coordinate),[550,570,550]);
  assert.equal(m.bands.length,0);assert.equal(m.rangeLabel,'500–620 分');
  const high=chart.model(jobs([979,999]));assert.equal(high.upper,999);assert.ok(high.lower>0);
  const low=chart.model(jobs([0,20,40]));assert.equal(low.lower,0);assert.ok(low.upper<=100);
  const missingRank=jobs([550,90,570]);missingRank[1].grade=null;
  const partial=chart.model(missingRank);
  assert.equal(partial.mixed,false);assert.equal(partial.lower,500);assert.equal(partial.upper,620);
  assert.equal(partial.points[1].coordinate,null);assert.deepEqual(Array.from(partial.segments,p=>p.length),[1,1]);
});

test('stable rank IDs survive normalization and language changes; unknown mixed ranks stay gaps',()=>{
  for(let id=0;id<=8;id++){
    const raw=fixture().record.result;
    raw.afterGrade={id:Buffer.from('CoopGrade-'+id).toString('base64'),name:'本地化名称'};
    const job=normalize(raw,{id:'shift',rule:'REGULAR'},()=> '');
    assert.equal(job.gradeId,id);assert.equal(job.gradePoint,raw.afterGradePoint);
  }
  for(const id of [null,'bad',Buffer.from('CoopGrade-9').toString('base64'),Buffer.from('Other-8').toString('base64')]){
    const raw=fixture().record.result;raw.afterGrade.id=id;
    assert.equal(normalize(raw,null,()=> '').gradeId,null);
  }
  const data=jobs([80,40,60]);data[0].grade='たつじん＋３';data[1].grade='Eggsecutive VP';data[2].grade='傳說';
  assert.deepEqual(Array.from(chart.model(data).points,p=>p.coordinate),[780,840,860]);
  assert.match(chart.tooltip(data,2),/\+20 分/);assert.doesNotMatch(chart.tooltip(data,2),/段位变化/);
  data[1].grade='未知段位';
  assert.equal(chart.model(data).points[1].coordinate,null);
  assert.deepEqual(Array.from(chart.model(data).segments,p=>p.length),[1,1]);
  data[1].gradeId=8;
  assert.equal(chart.model(data).points[1].coordinate,840);
});

test('invalid imported rank scores cannot escape the plot bounds',()=>{
  const data=jobs([60,80,1000]);data[0].gradeId=4;data[1].gradeId=5;
  const m=chart.model(data);
  assert.equal(m.points[2].coordinate,null);
  assert.equal(m.tickLabels.at(-1),'达人+2 0');
  for(const point of m.points.filter(p=>p.coordinate!==null))assert.ok(point.coordinate>=m.lower&&point.coordinate<=m.upper);
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


test('mixed-rank layout stays bounded from mobile to wide screens, even across the full rank range',()=>{
  const data=jobs([0,40,999]);data[0].gradeId=0;data[0].grade='见习';data[1].gradeId=4;data[1].grade='达人';data[2].gradeId=8;
  const heights=[];
  for(const width of [310,760,1450]){
    const svg=chart.render(data,{width});
    const box=svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
    assert.equal(Number(box[1]),width);const height=Number(box[2]);heights.push(height);
    assert(height>=340&&height<=460);assert(svg.includes(`style="height:${height}px"`));
    assert.doesNotMatch(svg,/NaN|Infinity/);
    const points=[...svg.matchAll(/class="chart-point[^>]* cx="([0-9.]+)" cy="([0-9.]+)"/g)];
    assert.equal(points.length,3);assert(points.every(p=>Number(p[1])>=0&&Number(p[1])<=width&&Number(p[2])>=0&&Number(p[2])<=height));
  }
  assert.equal(new Set(heights).size,1);
  assert.match(chart.render(jobs([550,570]),{width:1450}),/style="height:280px"/);
});
