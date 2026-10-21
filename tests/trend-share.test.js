import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
  const c={window:{},esc:s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),fmt:v=>Number.isFinite(v)?String(Math.round(v*10)/10):'—',date:s=>s};
  vm.createContext(c);
  vm.runInContext(readFileSync(new URL('../dist/metrics.js',import.meta.url),'utf8'),c);c.SalmonStats=c.window.SalmonStats;
  vm.runInContext(readFileSync(new URL('../dist/chart-dialog.js',import.meta.url),'utf8'),c);
  return c;
}
const row=(values,i=0)=>({id:'match-'+i,index:i+1,time:'2026-10-12T00:00:00Z',continuousWithPrevious:i>0,clear:true,
  eggs:999,kills:999,players:values.map((v,i)=>({key:'p'+i,name:i?'队友'+i:'我<&',me:i===0,eggs:v,kills:v,deaths:v,power:v,assist:99}))});
const people=[{key:'p0',name:'我<&',self:true,color:'#d5ef68'},{key:'p1',name:'队友1',color:'#81cbd9'}];
const plain=v=>JSON.parse(JSON.stringify(v));

test('chart labels and exported legends separate protected nicknames from the translated self marker',()=>{
  const c=setup(),jobs=[row([10,20,30,40])];
  const chart=c.largeChart(jobs,people,'eggs');
  assert.match(chart,/<tspan translate="no">我&lt;&amp;<\/tspan><tspan data-translate-ui="true"> · 我<\/tspan>/);
  const exported=c.trendExportSvg(jobs,people,['eggs'],true,'场地').svg;
  assert.match(exported,/<tspan translate="no">我&lt;&amp;<\/tspan><tspan> · 我<\/tspan>/);
  const long=c.largeChart(jobs,[{...people[0],name:'A very long nickname'}],'eggs');
  assert.match(long,/…<\/tspan><tspan data-translate-ui="true"> · 我<\/tspan>/);
});

test('pointer moves within the same job/player do not rebuild tooltips or synchronized charts',()=>{
  const c=setup(),jobs=[row([10,20,30,40],0),row([10,20,30,40],1)];
  let rebuilds=0,syncs=0,pointScans=0;
  const tip={style:{},offsetWidth:340,offsetHeight:240,contains:()=>false,set innerHTML(value){rebuilds++}};
  const rect={left:0,right:800,top:0,bottom:600,width:800,height:600};
  const plot={querySelector:()=>tip,getBoundingClientRect:()=>rect,closest:()=>({getBoundingClientRect:()=>rect})};
  const svg={viewBox:{baseVal:{height:260,width:1100}},getBoundingClientRect:()=>({...rect,height:260}),querySelectorAll(){pointScans++;return []}};
  c.window.innerHeight=700;
  const hits=jobs.map(job=>({dataset:{trendJob:job.id,metric:'eggs',jobX:'550'},closest:selector=>selector==='svg'?svg:plot,getBoundingClientRect:()=>({left:390,width:20,bottom:260})}));
  const plots={querySelectorAll:selector=>selector==='[data-trend-job]'?hits:[]};
  c.syncTrendFocus=()=>syncs++;vm.runInContext('trendState={showQuarter:true}',c);
  c.bindTrendInteractions(plots,jobs,people);
  hits[0].onpointerenter({clientY:0});
  for(let i=0;i<100;i++)hits[0].onpointermove({clientY:i});
  assert.equal(rebuilds,1);assert.equal(syncs,1);assert.equal(pointScans,2);
  hits[1].onpointerenter({clientY:0});assert.equal(rebuilds,2);assert.equal(syncs,2);
  hits[1].onpointerleave();assert.equal(tip.style.display,'none');assert.equal(syncs,3);
});

test('tooltip placement avoids the selected nodes on both edges and narrow charts',()=>{
  const c=setup();
  for(const [width,x,top,bottom,height] of [[900,30,100,230,600],[900,850,100,230,600],[430,215,100,230,650],[430,215,300,430,500],[320,160,70,240,310]]){
    const bounds={left:4,right:width-4,top:8,bottom:height-8},anchor={x,top,bottom};
    const p=c.trendTooltipPlacement(anchor,bounds,{width:340,height:250});
    const shownHeight=Math.min(250,p.maxHeight);
    assert.ok(p.left>=bounds.left&&p.left+p.width<=bounds.right);
    assert.ok(p.top>=bounds.top&&p.top+shownHeight<=bounds.bottom);
    assert.ok(p.left>=x+14||p.left+p.width<=x-14||p.top>=bottom+14||p.top+shownHeight<=top-14,JSON.stringify(p));
  }
});

test('all metrics use all four personal settlements, never official team fields, assists or visible players',()=>{
  const c=setup(),j=row([10,20,30,40]),before=JSON.stringify(j);
  for(const metric of ['eggs','kills','deaths','power']){
    assert.equal(c.SalmonStats.teamTotal(j,metric),100);
    assert.equal(c.SalmonStats.share(j,'p0',metric),10);
    assert.equal(j.players.reduce((sum,p)=>sum+c.SalmonStats.share(j,p.key,metric),0),100);
    const one=c.largeChart([j],people.slice(0,1),metric,{mode:'share'});
    const two=c.largeChart([j],people,metric,{mode:'share'});
    const point=svg=>svg.match(/data-player-line="p0"[^>]+points="([^"]+)"/)[1];
    assert.equal(point(one),point(two));assert.match(one,/>40%<\/text>/);
  }
  assert.equal(JSON.stringify(j),before);
});

test('valid all-zero results are connected 0 percent points, distinct from an individual zero',()=>{
  const c=setup(),jobs=[row([2,2,0,0],0),row([0,0,0,0],1),row([1,1,1,1],2)];
  for(const metric of ['eggs','kills','deaths','power']){
    const s=c.SalmonStats.trendSegments(jobs,'p0',metric,'share');
    assert.deepEqual(plain(s),[[{index:0,value:50},{index:1,value:0},{index:2,value:25}]]);
    assert.equal(c.SalmonStats.share(jobs[0],'p2',metric),0);
    assert.equal(c.SalmonStats.share(jobs[1],'absent',metric),null);
    const svg=c.largeChart(jobs,people.slice(0,1),metric,{mode:'share'});
    assert.match(svg,/data-point-job="match-1"[^>]+cy="226"/);assert.doesNotMatch(svg,/NaN|Infinity/);
  }
  const zeros=c.largeChart([jobs[1]],people,'deaths',{mode:'share'});
  assert.equal((zeros.match(/cy="226"/g)||[]).length,2);
  assert.doesNotMatch(zeros,/interruption-marker/);
});

test('incomplete or interrupted records are not valid zero totals or shares',()=>{
  const c=setup(),valid=row([0,0,0,0]);
  const variants=[{...valid,interrupted:true},{...valid,players:valid.players.slice(0,3)},{...valid,players:undefined}];
  for(const value of [null,-1,NaN]){const j=structuredClone(valid);j.players[1].kills=value;variants.push(j)}
  const duplicate=structuredClone(valid);duplicate.players[1].key='p0';variants.push(duplicate);
  for(const j of variants){assert.equal(c.SalmonStats.teamTotal(j,'kills'),null);assert.equal(c.SalmonStats.share(j,'p0','kills'),null)}
  const jobs=[row([1,1,1,1],0),{...row([0,0,0,0],1),interrupted:true},row([2,1,1,0],2)];
  assert.deepEqual(plain(c.SalmonStats.trendSegments(jobs,'p0','kills','share')).map(s=>s.map(p=>p.index)),[[0,1,2]]);
  assert.deepEqual(plain(c.SalmonStats.trendSegments(jobs,'p0','kills','quantity')).map(s=>s.map(p=>p.index)),[[0,1,2]]);
  const svg=c.largeChart(jobs,people,'kills',{mode:'share'});
  assert.match(svg,/class="interruption-marker"/);assert.doesNotMatch(svg,/data-point-job="match-1"/);
  assert.doesNotMatch(c.trendTooltip(jobs[1],people,'kills'),/0%/);
});

test('missing adjacency and absent teammates still break share lines',()=>{
  const c=setup(),jobs=[row([1,1,1,1],0),row([2,1,1,0],1),row([1,1,1,1],2)];
  jobs[1].players[0].key='replacement';
  assert.deepEqual(plain(c.SalmonStats.trendSegments(jobs,'p0','eggs','share')).map(s=>s.map(p=>p.index)),[[0],[2]]);
  jobs[1].players[0].key='p0';jobs[2].continuousWithPrevious=false;
  assert.deepEqual(plain(c.SalmonStats.trendSegments(jobs,'p0','eggs','share')).map(s=>s.length),[2,1]);
});

test('optional quantity total is dashed, includes hidden players and never bridges interrupted settlements',()=>{
  const c=setup(),jobs=[row([10,20,30,40],0),{...row([0,0,0,0],1),interrupted:true},row([10,20,30,40],2)];
  const svg=c.largeChart(jobs,people.slice(0,1),'eggs',{showTotal:true});
  const totals=[...svg.matchAll(/<polyline class="chart-line team-total-line"[^>]+/g)].map(m=>m[0]);
  assert.equal(totals.length,2);
  for(const line of totals){assert.match(line,/stroke-dasharray="7 5"/);assert.match(line,/,18"/)}
  assert.match(svg,/>100<\/text>/);assert.match(svg,/团队合计/);
  assert.doesNotMatch(c.largeChart(jobs,people,'eggs'),/team-total-line/);
  assert.doesNotMatch(c.largeChart(jobs,people,'eggs',{mode:'share',showTotal:true}),/team-total-line/);
});

test('tooltips show raw numbers, four-person total and rounded shares with explicit zero convention',()=>{
  const c=setup(),j=row([1,1,1,0]);
  const html=c.trendTooltip(j,people,'eggs');
  assert.match(html,/四人合计：<b>3 颗/);assert.match(html,/1 颗.*占比 33.3%/);
  assert.match(html,/协助 99 颗（不计入占比）/);assert.match(html,/我&lt;&amp;/);
  const zero=c.trendTooltip(row([0,0,0,0]),people,'deaths');
  assert.match(zero,/本场全队无人被救援，占比按 0% 展示/);
  assert.equal((zero.match(/占比 0%/g)||[]).length,2);
  const incomplete=row([1,2,3]);assert.match(c.trendTooltip(incomplete,people,'kills'),/占比不可用/);
});

test('exports use current mode and total option for all three plots and retain selected range and names',()=>{
  const c=setup(),jobs=[row([10,20,30,40],0),row([0,0,0,0],1),row([5,5,5,5],2)];
  const metrics=['eggs','kills','deaths'];
  const share=c.trendExportSvg(jobs.slice(1),people,metrics,false,'场地',{mode:'share',showTotal:true,shareScale:'fixed'}).svg;
  assert.equal((share.match(/>100%<\/text>/g)||[]).length,3);assert.match(share,/第 2—3 场/);
  assert.doesNotMatch(share,/team-total-line|data-line-label|chart-hit|NaN|Infinity|match-0/);
  assert.match(share,/全队为 0 时按 0% 展示/);
  const quantity=c.trendExportSvg(jobs,people,metrics,true,'场地',{showTotal:true}).svg;
  assert.equal((quantity.match(/data-team-total="true"/g)||[]).length,3);
  assert.match(quantity,/团队合计（四人）/);assert.match(quantity,/被救援次数 · 次/);
  assert.doesNotMatch(quantity,/>100%<\/text>/);
});

test('share auto scale starts at zero, adds headroom and follows visible players and selected range',()=>{
  const c=setup(),axis=svg=>Number(svg.match(/data-axis-max="(\d+)"/)[1]);
  const draw=(jobs,shown=people.slice(0,1),options={})=>c.largeChart(jobs,shown,'eggs',{mode:'share',...options});
  for(const [value,expected] of [[0,40],[25,40],[36,60],[50,60],[70,80],[85,100],[100,100]]){
    const svg=draw([row([value,100-value,0,0])]);
    assert.equal(axis(svg),expected);assert.match(svg,/>0%<\/text>/);assert.doesNotMatch(svg,/NaN|Infinity/);
  }
  const jobs=[row([20,60,10,10],0),row([80,10,5,5],1)];
  assert.equal(axis(draw(jobs)),100);
  assert.equal(axis(draw(jobs.slice(0,1))),40);
  assert.equal(axis(draw(jobs.slice(0,1),people)),80);
  assert.equal(axis(draw(jobs.slice(0,1),people,{shareScale:'fixed'})),100);
  assert.equal(c.SalmonStats.share(jobs[0],'p0','eggs'),20);
});

test('share exports use independent auto domains or the chosen fixed domain for all metrics',()=>{
  const c=setup(),j=row([20,40,20,20]);
  j.players.forEach((p,i)=>{p.kills=[50,20,20,10][i];p.deaths=[0,0,0,0][i]});
  const metrics=['eggs','kills','deaths'];
  const axes=svg=>[...svg.matchAll(/data-axis-max="(\d+)"/g)].map(m=>Number(m[1]));
  const auto=c.trendExportSvg([j],people.slice(0,1),metrics,false,'场地',{mode:'share'}).svg;
  assert.deepEqual(axes(auto),[40,60,40]);
  for(const metric of metrics){
    const preview=c.largeChart([j],people.slice(0,1),metric,{mode:'share',interactive:false,showNames:false});
    assert.ok(auto.includes(preview.slice(preview.indexOf('viewBox='))));
  }
  const fixed=c.trendExportSvg([j],people,metrics,false,'场地',{mode:'share',shareScale:'fixed'}).svg;
  assert.deepEqual(axes(fixed),[100,100,100]);
});

test('share quarter reference is opt-in, uses the current axis and survives export',()=>{
  const c=setup(),jobs=[row([20,30,30,20])];
  for(const shareScale of ['auto','fixed']){
    const svg=c.largeChart(jobs,people,'eggs',{mode:'share',shareScale,showQuarter:true});
    const max=Number(svg.match(/data-axis-max="(\d+)"/)[1]);
    const reference=svg.match(/<g class="trend-quarter"[\s\S]*?<\/g>/)[0];
    const y=226-25/max*208;
    assert.ok(reference.includes(`y1="${y}"`));assert.match(reference,/不代表及格线/);
    const exported=c.trendExportSvg(jobs,people,['eggs','kills','deaths'],true,'场地',{mode:'share',shareScale,showQuarter:true}).svg;
    assert.equal((exported.match(/class="trend-quarter"/g)||[]).length,3);
    assert.doesNotMatch(exported,/class="trend-sync"|tabindex=/);
  }
  assert.doesNotMatch(c.largeChart(jobs,people,'eggs',{mode:'share'}),/class="trend-quarter"/);
  assert.doesNotMatch(c.largeChart(jobs,people,'eggs'),/class="trend-quarter"/);
});

test('labels stay near each batch endpoint, avoid curves and other labels, and suppress crowded names',()=>{
  const c=setup(),entry=(key,px,py,self=false)=>({p:{key,self},px,py,width:100});
  const bounds={left:42,right:1096,top:18,bottom:226};
  const entries=[entry('me',940,100,true),entry('early',180,100),entry('middle',450,100),...Array.from({length:18},(_,i)=>entry('crowd'+i,940,100))];
  const layout=c.trendLabelLayout(entries,bounds,[]),shown=layout.filter(e=>!e.crowded);
  assert.ok(layout.some(e=>e.crowded));assert.ok(!layout.find(e=>e.p.self).crowded);
  for(const e of layout){
    const dx=Math.max(e.left-e.px,0,e.px-e.left-e.width),dy=Math.max(e.top-e.py,0,e.py-e.top-22);
    assert.ok(Math.hypot(dx,dy)<70);assert.ok(e.left>=42&&e.left+e.width<=1096);assert.ok(e.top>=18&&e.top+22<=226);
  }
  for(let i=0;i<shown.length;i++)for(let k=i+1;k<shown.length;k++){
    const a=shown[i],b=shown[k];assert.ok(a.left+a.width<=b.left||b.left+b.width<=a.left||a.top+22<=b.top||b.top+22<=a.top);
  }
  const box={left:100,top:100,width:100};
  assert.equal(c.trendSegmentHitsBox({x:0,y:110},{x:300,y:110},box),true);
  assert.equal(c.trendSegmentHitsBox({x:0,y:50},{x:300,y:50},box),false);
  const blocked=c.trendLabelLayout([entry('blocked',500,100)],bounds,[[{x:300,y:100},{x:700,y:100}]]);
  assert.ok(blocked[0].crowded||!c.trendSegmentHitsBox({x:300,y:100},{x:700,y:100},blocked[0]));
});

test('many teammate batches do not inflate chart height and exports retain local labels',()=>{
  const c=setup(),group=Array.from({length:16},(_,i)=>({key:'p'+i,name:'队友'+i,color:'#81cbd9',self:i===0}));
  const jobs=Array.from({length:12},(_,i)=>({...row([10,10,10,10],i),players:group.slice(Math.floor(i/3)*4,Math.floor(i/3)*4+4).map(p=>({...p,eggs:10,kills:10,deaths:0}))}));
  const svg=c.largeChart(jobs,group,'eggs');
  assert.match(svg,/viewBox="0 0 1100 260"/);assert.match(svg,/label-crowded/);
  const early=svg.match(/data-line-label="p1"[\s\S]*?<rect x="([\d.]+)"/);
  assert.ok(Number(early[1])<400);
  const exported=c.trendExportSvg(jobs,group,['eggs','kills','deaths'],true,'场地');
  assert.equal((exported.svg.match(/height="260" viewBox=/g)||[]).length,3);
  assert.match(exported.svg,/\.label-crowded\{display:none\}/);assert.doesNotMatch(exported.svg,/tabindex=/);
});


test('quantity quarter reference uses all four players and scales with visible reference values',()=>{
  const c=setup(),jobs=[row([1,9,10,20],0),row([2,18,20,40],1),row([0,0,0,0],2)];
  const draw=shown=>c.largeChart(jobs,shown,'eggs',{showQuarter:true});
  const one=draw(people.slice(0,1)),two=draw(people),points=svg=>svg.match(/class="chart-line quarter-line"[^>]+points="([^"]+)"/)[1];
  assert.match(one,/data-axis-max="20"/);assert.equal(points(one),points(two));
  assert.deepEqual(points(one).split(' ').map(p=>Number(p.split(',')[1])),[122,18,226]);
  const exportSvg=c.trendExportSvg(jobs,people,['eggs','kills','deaths'],false,'场地',{showQuarter:true}).svg;
  assert.equal((exportSvg.match(/class="chart-line quarter-line"/g)||[]).length,3);
  assert.match(c.trendTooltip(jobs[1],people,'eggs',{showQuarter:true}),/25% 均分参考：20 颗/);
  assert.doesNotMatch(one,/>25% 均分参考<\/text>/);
});

test('quantity quarter reference connects interruption anchors but preserves missing settlements',()=>{
  const c=setup(),jobs=[row([1,1,1,1],0),{...row([0,0,0,0],1),interrupted:true},row([2,2,2,2],2),row([2,2,2],3),row([3,3,3,3],4)];
  const svg=c.largeChart(jobs,people,'deaths',{showQuarter:true});
  const reference=svg.match(/<g class="trend-quarter"[\s\S]*?<\/g>/)[0];
  assert.equal((reference.match(/quarter-line/g)||[]).length,2);
  assert.equal((reference.match(/<circle/g)||[]).length,1);
  assert.doesNotMatch(reference,/NaN|Infinity/);
  assert.doesNotMatch(c.trendTooltip(jobs[1],people,'deaths',{showQuarter:true}),/均分参考：/);
});


test('share lines and quantity reference pass through consecutive interruption anchors in preview and export',()=>{
  const c=setup(),jobs=[row([1,1,1,1],0),{...row([0,0,0,0],1),interrupted:true},{...row([0,0,0,0],2),interrupted:true},row([2,2,2,2],3)];
  for(const metric of ['eggs','kills','deaths','power']){
    assert.deepEqual(plain(c.SalmonStats.trendSegments(jobs,'p0',metric,'share')),[[{index:0,value:25},{index:1,value:0},{index:2,value:0},{index:3,value:25}]]);
    assert.equal(c.SalmonStats.share(jobs[1],'p0',metric),null);
    for(const mode of ['share','quantity']){
      const svg=c.largeChart(jobs,people.slice(0,1),metric,{mode,showQuarter:true});
      const line=mode==='share'?svg.match(/data-player-line="p0"[^>]+points="([^"]+)"/)[1]:svg.match(/class="chart-line quarter-line"[^>]+points="([^"]+)"/)[1];
      const points=line.split(' ');assert.equal(points.length,4);
      assert.equal(points[1].split(',')[1],'226');assert.equal(points[2].split(',')[1],'226');
      const exported=c.trendExportSvg(jobs,people.slice(0,1),[metric],false,'场地',{mode,showQuarter:true}).svg;
      assert.ok(exported.includes(`points="${line}"`));
      assert.equal((exported.match(/class="interruption-marker"/g)||[]).length,2);
    }
  }
  jobs[2].continuousWithPrevious=false;
  assert.deepEqual(plain(c.SalmonStats.trendSegments(jobs,'p0','eggs','share')).map(s=>s.map(p=>p.index)),[[0,1],[2,3]]);
  jobs[2].continuousWithPrevious=true;jobs[1].players=[];
  assert.deepEqual(plain(c.SalmonStats.trendSegments(jobs,'p0','eggs','share')).map(s=>s.map(p=>p.index)),[[0],[2,3]]);
});


test('optional charts default to the original three and power exports support both modes',()=>{
  const c=setup();
  assert.deepEqual(plain(c.trendVisibleMetrics({})),['eggs','kills','deaths']);
  assert.deepEqual(plain(c.trendVisibleMetrics({showPower:true})),['eggs','kills','deaths','power']);
  const jobs=[row([500,1000,1500,2000])];
  const quantity=c.trendExportSvg(jobs,people,c.trendVisibleMetrics({showPower:true}),true,'场地',{showTotal:true,showQuarter:true});
  const base=c.trendExportSvg(jobs,people,c.trendVisibleMetrics({}),true,'场地');
  assert.equal(quantity.height-base.height,310);
  assert.match(quantity.svg,/红蛋 · 颗/);assert.doesNotMatch(base.svg,/红蛋 · 颗/);
  const single=c.trendExportSvg(jobs,people,['power'],true,'场地',{mode:'share',showQuarter:true});
  assert.match(single.svg,/红蛋 · 占比（%）/);assert.match(single.svg,/25% 均分参考/);
  assert.equal(c.SalmonStats.share(jobs[0],'p0','power'),10);
  assert.match(c.trendTooltip(jobs[0],people,'power'),/5,?000|5000/);
  assert.doesNotMatch(single.svg,/NaN|Infinity/);
});
