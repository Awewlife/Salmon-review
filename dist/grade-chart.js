'use strict';
// Use the recorded end-of-match rank score, never reward points or an invented
// cumulative score across promotions. Missing records/scores break the line.
window.SalmonGradeChart=(()=>{
  const esc=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function model(jobs,fullRange=false){
    const points=jobs.map((job,position)=>({job,position,value:Number.isFinite(job.gradePoint)&&job.gradePoint>=0?job.gradePoint:null}));
    const values=points.filter(p=>p.value!==null).map(p=>p.value);
    const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):100;
    let lower=0,upper=Math.max(999,max),step=200;
    if(!fullRange){
      const span=Math.max(100,max-min),middle=(max+min)/2;
      const low=Math.min(min-10,middle-span/2),high=Math.max(max+10,middle+span/2);
      step=[20,50,100,200,500,1000].find(n=>n>=(high-low)/5)??Math.ceil((high-low)/5);
      lower=Math.max(0,Math.floor(low/step)*step);
      upper=Math.ceil(high/step)*step;
      if(max<=999)upper=Math.min(999,upper);
    }
    const ticks=[lower];
    for(let value=(Math.floor(lower/step)+1)*step;value<upper;value+=step){if(upper-value>=step*.45)ticks.push(value)}
    ticks.push(upper);
    const segments=[];let current=[];
    for(const point of points){
      if(point.value===null||(point.position>0&&point.job.continuousWithPrevious!==true)){
        if(current.length)segments.push(current);current=[];
      }
      if(point.value!==null)current.push(point);
    }
    if(current.length)segments.push(current);
    return {points,segments,lower,upper,ticks,count:values.length};
  }
  function render(jobs,{fullRange=false,width=760}={}){
    const m=model(jobs,fullRange);
    if(!m.count)return '<div class="score-empty" role="status">本期暂无可用的结束分数，仍可切回表现趋势。</div>';
    const W=width,H=280,L=44,R=45,T=24,B=32;
    const x=i=>jobs.length===1?(L+W-R)/2:L+i*(W-L-R)/(jobs.length-1);
    const y=value=>H-B-(value-m.lower)/(m.upper-m.lower)*(H-B-T);
    const n=value=>Number(value.toFixed(2));
    const labelEvery=Math.max(1,Math.ceil(jobs.length/(W<500?5:10)));
    const last=m.points.at(-1);
    return `<svg class="score-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="打工分数变化：每场结束时的段位分数，纵轴 ${m.lower} 至 ${m.upper} 分"><title>打工分数变化 · 每场结束段位分数</title>
      ${m.ticks.map(value=>`<line x1="${L}" x2="${W-R}" y1="${n(y(value))}" y2="${n(y(value))}" class="chart-grid"/><text class="chart-text" x="${L-10}" y="${n(y(value)+4)}" text-anchor="end">${value}</text>`).join('')}
      ${m.segments.filter(s=>s.length>1).map(s=>`<polyline class="chart-line score-line" points="${s.map(p=>`${n(x(p.position))},${n(y(p.value))}`).join(' ')}"/>`).join('')}
      ${m.points.filter(p=>p.value!==null).map(p=>`<circle class="chart-point score-point ${p.job.clear?'node-cleared':'node-failed'}" cx="${n(x(p.position))}" cy="${n(y(p.value))}" r="3.8"/>`).join('')}
      ${last?.value!==null?`<text class="score-last-label" x="${n(x(last.position)+10)}" y="${n(y(last.value)+4)}">${last.value}</text>`:''}
      ${m.points.map(p=>`${p.value!==null?`<rect class="chart-hit score-hit" data-score-job="${esc(p.job.id)}" x="${n(x(p.position)-Math.min(32,(W-L-R)/Math.max(1,jobs.length-1))/2)}" y="${T-8}" width="${n(Math.min(32,(W-L-R)/Math.max(1,jobs.length-1)))}" height="${H-B-T+16}" tabindex="0" role="link" aria-label="第 ${esc(p.job.index)} 场，${esc(p.job.grade)} ${p.value} 分，${p.job.clear?'通过':'未通过'}，查看详情"/>`:''}${p.position===0||p.position===jobs.length-1||(p.position+1)%labelEvery===0?`<text class="chart-text" x="${n(x(p.position))}" y="${H-9}" text-anchor="middle">${esc(p.job.index)}</text>`:''}`).join('')}
    </svg>`;
  }
  function tooltip(jobs,index){
    const job=jobs[index],previous=jobs[index-1];
    let comparison='';
    if(previous&&job.continuousWithPrevious===true&&Number.isFinite(previous.gradePoint)){
      if(previous.grade!==job.grade)comparison=`段位变化：${esc(previous.grade)} ${previous.gradePoint} → ${esc(job.grade)} ${job.gradePoint}`;
      else{const delta=job.gradePoint-previous.gradePoint;comparison=delta===0?'较上一场：持平':`较上一场：${delta>0?'+':''}${delta} 分`}
    }else if(previous)comparison='前一场记录不连续或缺少分数';
    return `<strong>第 ${esc(job.index)} 场 · ${job.clear?'通过':'未通过'}</strong><br>结束分数：<b>${esc(job.grade)} ${job.gradePoint}</b>${comparison?`<br>${comparison}`:''}<br><small>点击查看该场详情</small>`;
  }
  return {model,render,tooltip};
})();
