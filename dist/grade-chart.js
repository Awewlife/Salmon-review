'use strict';
// Use the recorded end-of-match rank score, never reward points or an invented
// cumulative score across promotions. Missing records/scores break the line.
window.SalmonGradeChart=(()=>{
  const esc=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function model(jobs){
    const points=jobs.map((job,position)=>({job,position,value:Number.isFinite(job.gradePoint)&&job.gradePoint>=0?job.gradePoint:null}));
    const values=points.filter(p=>p.value!==null).map(p=>p.value);
    const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):100;
    const span=Math.max(100,max-min),middle=(max+min)/2;
    const low=Math.min(min-10,middle-span/2),high=Math.max(max+10,middle+span/2);
    const step=[20,50,100,200,500,1000].find(n=>n>=(high-low)/5)??Math.ceil((high-low)/5);
    const lower=Math.max(0,Math.floor(low/step)*step);
    let upper=Math.ceil(high/step)*step;
    if(max<=999)upper=Math.min(999,upper);
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
    const labels=[],bands=new Set();
    for(const point of points){
      if(point.value===null)continue;
      const previous=points[point.position-1],reasons=[];
      const segmentStart=!previous||previous.value===null||point.job.continuousWithPrevious!==true;
      const rankChanged=previous?.value!==null&&previous&&previous.job.grade!==point.job.grade;
      // Ordinary +20/-10/-20 results stay uncluttered. A rank change or a
      // larger jump always labels the recorded destination, without guessing why.
      const jump=previous&&previous.value!==null&&(rankChanged||Math.abs(point.value-previous.value)>20);
      if(segmentStart||rankChanged)bands.clear();
      const band=Math.floor(point.value/100);
      if(segmentStart)reasons.push('start');
      if(!bands.has(band))reasons.push('milestone');
      if(jump)reasons.push('jump');
      if(point.job.interrupted)reasons.push('interrupted');
      if(point===points.at(-1))reasons.push('end');
      bands.add(band);
      if(reasons.length)labels.push({...point,reasons});
    }
    return {points,segments,labels,lower,upper,ticks,count:values.length};
  }
  function render(jobs,{width=760}={}){
    const m=model(jobs);
    if(!m.count)return '<div class="score-empty" role="status">本期暂无可用的结束分数，仍可切回表现趋势。</div>';
    const W=width,H=280,L=44,R=45,T=24,B=32;
    const x=i=>jobs.length===1?(L+W-R)/2:L+i*(W-L-R)/(jobs.length-1);
    const y=value=>H-B-(value-m.lower)/(m.upper-m.lower)*(H-B-T);
    const n=value=>Number(value.toFixed(2));
    const labelEvery=Math.max(1,Math.ceil(jobs.length/(W<500?5:10)));
    const occupied=[];
    const labels=m.labels.map(p=>{
      const px=x(p.position),py=y(p.value),w=String(p.value).length*7+6;
      const end=p.position===jobs.length-1;
      const lx=end?Math.min(W-w/2-3,px+10+w/2):Math.max(L+w/2,Math.min(W-w/2-3,px));
      const choices=end?[py,py-18,py+18]:[-16,20,-34,38,-52,56,-70,74].map(d=>py+d);
      const boxes=choices.map(v=>({x:lx-w/2,y:Math.max(8,Math.min(H-B-8,v))-7,w,h:14}));
      const box=boxes.find(b=>!occupied.some(o=>b.x<o.x+o.w+4&&b.x+b.w+4>o.x&&b.y<o.y+o.h+3&&b.y+b.h+3>o.y))??boxes[0];
      occupied.push(box);
      const ly=box.y+7;
      return `<g class="score-annotation${p.job.interrupted?' interrupted':''}" data-score-label-index="${esc(p.job.index)}" data-score-label-reasons="${p.reasons.join(' ')}"><line class="score-label-leader" x1="${n(px)}" y1="${n(py)}" x2="${n(lx)}" y2="${n(ly)}"/><text class="score-value-label" x="${n(lx)}" y="${n(ly+4)}" text-anchor="middle">${p.value}</text></g>`;
    }).join('');
    return `<svg class="score-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="打工分数变化：每场结束时的段位分数，纵轴 ${m.lower} 至 ${m.upper} 分"><title>打工分数变化 · 每场结束段位分数</title>
      ${m.ticks.map(value=>`<line x1="${L}" x2="${W-R}" y1="${n(y(value))}" y2="${n(y(value))}" class="chart-grid"/><text class="chart-text" x="${L-10}" y="${n(y(value)+4)}" text-anchor="end">${value}</text>`).join('')}
      ${m.segments.filter(s=>s.length>1).map(s=>`<polyline class="chart-line score-line" points="${s.map(p=>`${n(x(p.position))},${n(y(p.value))}`).join(' ')}"/>`).join('')}
      ${m.points.filter(p=>p.value!==null).map(p=>`<circle class="chart-point score-point ${p.job.interrupted?'node-interrupted':p.job.clear?'node-cleared':'node-failed'}" cx="${n(x(p.position))}" cy="${n(y(p.value))}" r="3.8"/>`).join('')}
      ${m.points.filter(p=>p.job.interrupted&&p.value===null).map(p=>`<circle class="interruption-marker" cx="${n(x(p.position))}" cy="${H-B}" r="4" fill="#202528" stroke="#a8b0b4" stroke-width="1.8"><title>对局中断，未提供结束分数</title></circle>`).join('')}
      ${labels}
      ${m.points.map(p=>`${p.value!==null||p.job.interrupted?`<rect class="chart-hit score-hit" data-score-job="${esc(p.job.id)}" x="${n(x(p.position)-Math.min(32,(W-L-R)/Math.max(1,jobs.length-1))/2)}" y="${T-8}" width="${n(Math.min(32,(W-L-R)/Math.max(1,jobs.length-1)))}" height="${H-B-T+22}" tabindex="0" role="link" aria-label="${p.job.interrupted?'对局中断':'第 '+esc(p.job.index)+' 场'}，${esc(p.job.grade)} ${p.value??'未提供'} 分，查看详情"/>`:''}${p.position===0||p.position===jobs.length-1||(p.position+1)%labelEvery===0?`<text class="chart-text" x="${n(x(p.position))}" y="${H-9}" text-anchor="middle">${esc(p.job.index)}</text>`:''}`).join('')}
    </svg>`;
  }
  function tooltip(jobs,index){
    const job=jobs[index],previous=jobs[index-1];
    let comparison='';
    if(Number.isFinite(job.gradePoint)&&previous&&job.continuousWithPrevious===true&&Number.isFinite(previous.gradePoint)){
      if(previous.grade!==job.grade)comparison=`段位变化：${esc(previous.grade)} ${previous.gradePoint} → ${esc(job.grade)} ${job.gradePoint}`;
      else{const delta=job.gradePoint-previous.gradePoint;comparison=delta===0?'较上一场：持平':`较上一场：${delta>0?'+':''}${delta} 分`}
    }else if(previous)comparison='前一场记录不连续或缺少分数';
    return `<strong>${job.interrupted?'对局中断':'第 '+esc(job.index)+' 场 · '+(job.clear?'通过':'未通过')}</strong><br>结束分数：<b>${esc(job.grade)} ${job.gradePoint??'未提供'}</b>${comparison?`<br>${comparison}`:''}${job.interrupted?'<br>本场无有效波次结算，不计入表现统计。':''}<br><small>点击查看该场详情</small>`;
  }
  return {model,render,tooltip};
})();
