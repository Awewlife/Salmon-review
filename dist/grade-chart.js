'use strict';
// Keep recorded scores intact. Mixed ranks use an internal ordered coordinate;
// ticks, annotations and tooltips always show real rank scores, not that offset.
window.SalmonGradeChart=(()=>{
  const esc=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // CoopGrade-0..8, in SplatNet order. The ID is independent of display language.
  const ranks=['新手','半吊子','独当一面','熟练','达人','达人+1','达人+2','达人+3','传说'];
  const rankNames=[ranks,['新手','半吊子','獨當一面','熟練','達人','達人+1','達人+2','達人+3','傳說'],['Apprentice','Part-Timer','Go-Getter','Overachiever','Profreshional','Profreshional +1','Profreshional +2','Profreshional +3','Eggsecutive VP'],['かけだし','はんにんまえ','いちにんまえ','じゅくれん','たつじん','たつじん+1','たつじん+2','たつじん+3','でんせつ']];
  const normalizeName=name=>String(name??'').normalize('NFKC').replace(/\s/g,'');
  function rankOf(job){
    if(Number.isInteger(job.gradeId)&&job.gradeId>=0&&job.gradeId<ranks.length)return job.gradeId;
    // Older display caches and imported fixtures may only contain a name.
    const name=normalizeName(job.grade);
    for(const names of rankNames){const rank=names.findIndex(value=>normalizeName(value)===name);if(rank>=0)return rank}
    return null;
  }
  function rawScale(values){
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
    return {lower,upper,ticks,tickLabels:ticks.map(String),bands:[],rangeLabel:`${lower}–${upper} 分`};
  }
  function rankScale(points){
    const valid=points.filter(p=>p.coordinate!==null);
    if(!valid.length)return rawScale([]);
    const first=Math.min(...valid.map(p=>p.rank)),last=Math.max(...valid.map(p=>p.rank));
    const lower=first*100,max=Math.max(...valid.map(p=>p.coordinate));
    const upper=last===8?800+Math.min(999,Math.ceil((max-800+10)/100)*100):(last+1)*100;
    const ticks=[],tickLabels=[],bands=[];
    for(let rank=first;rank<=last;rank++){
      const start=rank*100,end=rank===last?upper:start+100;
      bands.push({lower:start,upper:end,rank});
      ticks.push(start);tickLabels.push(`${ranks[rank]} 0`);
    }
    if(last===8){
      const step=upper-800>600?200:100;
      for(let value=800+step;value<upper;value+=step){
        if(upper-value>=step*.45){ticks.push(value);tickLabels.push(`传说 ${value-800}`)}
      }
    }
    ticks.push(upper);tickLabels.push(last===8?`传说 ${upper-800}`:`${ranks[last+1]} 0`);
    return {lower,upper,ticks,tickLabels,bands,rangeLabel:`${tickLabels[0]} — ${tickLabels.at(-1)}`};
  }
  function model(jobs){
    const points=jobs.map((job,position)=>({job,position,rank:rankOf(job),value:Number.isFinite(job.gradePoint)&&job.gradePoint>=0?job.gradePoint:null}));
    const scored=points.filter(p=>p.value!==null),knownRanks=new Set(scored.filter(p=>p.rank!==null).map(p=>p.rank));
    const mixed=knownRanks.size>1;
    const unrecognizedSingleRank=knownRanks.size===0&&new Set(scored.map(p=>p.job.grade)).size===1;
    for(const point of points){
      const usable=point.value!==null&&(point.rank!==null?point.value<=(point.rank===8?999:100):unrecognizedSingleRank);
      point.coordinate=usable?(mixed?point.rank*100+point.value:point.value):null;
    }
    const scale=mixed?rankScale(points):rawScale(points.filter(p=>p.coordinate!==null).map(p=>p.value));
    const segments=[];let current=[];
    for(const point of points){
      if(point.coordinate===null||(point.position>0&&point.job.continuousWithPrevious!==true)){
        if(current.length)segments.push(current);current=[];
      }
      if(point.coordinate!==null)current.push(point);
    }
    if(current.length)segments.push(current);
    const labels=[],bands=new Set();
    for(const point of points){
      if(point.coordinate===null)continue;
      const previous=points[point.position-1],reasons=[];
      const segmentStart=!previous||previous.coordinate===null||point.job.continuousWithPrevious!==true;
      const rankChanged=previous?.coordinate!==null&&previous&&(previous.rank??previous.job.grade)!==(point.rank??point.job.grade);
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
      const fullRank=mixed&&(segmentStart||rankChanged||reasons.includes('end'));
      if(reasons.length)labels.push({...point,reasons,text:fullRank?`${ranks[point.rank]} ${point.value}`:String(point.value)});
    }
    return {points,segments,labels,...scale,mixed,count:points.filter(p=>p.coordinate!==null).length};
  }
  const insets=(mixed,width)=>({left:mixed?(width<500?76:90):44,right:mixed?(width<500?16:72):45});
  const plotInsets=(jobs,width=760)=>insets(model(jobs).mixed,width);
  function render(jobs,{width=760}={}){
    const m=model(jobs);
    if(!m.count)return '<div class="score-empty" role="status">本期暂无可用的结束分数，仍可切回表现趋势。</div>';
    const {left:L,right:R}=insets(m.mixed,width);
    const W=width,H=m.mixed?Math.min(460,Math.max(340,Math.ceil((m.upper-m.lower)/100)*28+70)):280,T=m.mixed?30:24,B=32;
    const x=i=>jobs.length===1?(L+W-R)/2:L+i*(W-L-R)/(jobs.length-1);
    const y=value=>H-B-(value-m.lower)/(m.upper-m.lower)*(H-B-T);
    const n=value=>Number(value.toFixed(2));
    const labelEvery=Math.max(1,Math.ceil(jobs.length/(W<500?5:10)));
    const occupied=[];
    const labels=m.labels.map(p=>{
      const px=x(p.position),py=y(p.coordinate),w=Array.from(p.text).reduce((sum,c)=>sum+(/[^\x00-\x7f]/.test(c)?12:7),6);
      const end=p.position===jobs.length-1;
      const lx=end?Math.min(W-w/2-3,px+10+w/2):Math.max(L+w/2,Math.min(W-w/2-3,px));
      const choices=(end&&W>=500?[0,-18,18,-36,36,-54,54,-72,72,-90,90]:[-16,20,-34,38,-52,56,-70,74,-88,92,-106,110]).map(d=>py+d);
      const boxes=choices.map(v=>({x:lx-w/2,y:Math.max(8,Math.min(H-B-8,v))-7,w,h:14}));
      const box=boxes.find(b=>!occupied.some(o=>b.x<o.x+o.w+4&&b.x+b.w+4>o.x&&b.y<o.y+o.h+3&&b.y+b.h+3>o.y))??boxes[0];
      occupied.push(box);
      const ly=box.y+7;
      return `<g class="score-annotation${p.job.interrupted?' interrupted':''}" data-score-label-index="${esc(p.job.index)}" data-score-label-reasons="${p.reasons.join(' ')}"><line class="score-label-leader" x1="${n(px)}" y1="${n(py)}" x2="${n(lx)}" y2="${n(ly)}"/><text class="score-value-label" x="${n(lx)}" y="${n(ly+4)}" text-anchor="middle">${esc(p.text)}</text></g>`;
    }).join('');
    return `<svg class="score-chart${m.mixed?' score-chart-ranked':''}" viewBox="0 0 ${W} ${H}" style="height:${H}px" role="img" aria-label="打工分数变化：每场结束时的段位分数，分数范围 ${esc(m.rangeLabel)}"><title>打工分数变化 · 每场结束段位分数</title>
      ${m.bands.map(b=>`<rect class="score-rank-band${b.rank%2?' alternate':''}" x="${L-8}" y="${n(y(b.upper))}" width="${W-L-R+16}" height="${n(y(b.lower)-y(b.upper))}"/>`).join('')}
      <text class="chart-text score-axis-title" x="${L-10}" y="13" text-anchor="end">分数</text>
      ${m.ticks.map((value,i)=>`<line x1="${L}" x2="${W-R}" y1="${n(y(value))}" y2="${n(y(value))}" class="chart-grid"/><text class="chart-text" x="${L-10}" y="${n(y(value)+4)}" text-anchor="end">${esc(m.tickLabels[i])}</text>`).join('')}
      ${m.segments.filter(s=>s.length>1).map(s=>`<polyline class="chart-line score-line" points="${s.map(p=>`${n(x(p.position))},${n(y(p.coordinate))}`).join(' ')}"/>`).join('')}
      ${m.points.filter(p=>p.coordinate!==null).map(p=>`<circle class="chart-point score-point ${p.job.interrupted?'node-interrupted':p.job.clear?'node-cleared':'node-failed'}" cx="${n(x(p.position))}" cy="${n(y(p.coordinate))}" r="3.8"/>`).join('')}
      ${m.points.filter(p=>p.job.interrupted&&p.value===null).map(p=>`<circle class="interruption-marker" cx="${n(x(p.position))}" cy="${H-B}" r="4" fill="#202528" stroke="#a8b0b4" stroke-width="1.8"><title>对局中断，未提供结束分数</title></circle>`).join('')}
      ${labels}
      ${m.points.map(p=>`${p.value!==null||p.job.interrupted?`<rect class="chart-hit score-hit" data-score-job="${esc(p.job.id)}" x="${n(x(p.position)-Math.min(32,(W-L-R)/Math.max(1,jobs.length-1))/2)}" y="${T-8}" width="${n(Math.min(32,(W-L-R)/Math.max(1,jobs.length-1)))}" height="${H-B-T+22}" tabindex="0" role="link" aria-label="${p.job.interrupted?'对局中断':'第 '+esc(p.job.index)+' 场'}，${esc(p.job.grade)} ${p.value??'未提供'} 分，查看详情"/>`:''}${p.position===0||p.position===jobs.length-1||(p.position+1)%labelEvery===0?`<text class="chart-text" x="${n(x(p.position))}" y="${H-9}" text-anchor="middle">${esc(p.job.index)}</text>`:''}`).join('')}
    </svg>`;
  }
  function tooltip(jobs,index){
    const job=jobs[index],previous=jobs[index-1];
    let comparison='';
    if(Number.isFinite(job.gradePoint)&&previous&&job.continuousWithPrevious===true&&Number.isFinite(previous.gradePoint)){
      if((rankOf(previous)??previous.grade)!==(rankOf(job)??job.grade))comparison=`段位变化：${esc(previous.grade)} ${previous.gradePoint} → ${esc(job.grade)} ${job.gradePoint}`;
      else{const delta=job.gradePoint-previous.gradePoint;comparison=delta===0?'较上一场：持平':`较上一场：${delta>0?'+':''}${delta} 分`}
    }else if(previous)comparison='前一场记录不连续或缺少分数';
    return `<strong>${job.interrupted?'对局中断':'第 '+esc(job.index)+' 场 · '+(job.clear?'通过':'未通过')}</strong><br>结束分数：<b>${esc(job.grade)} ${job.gradePoint??'未提供'}</b>${comparison?`<br>${comparison}`:''}${job.interrupted?'<br>本场无有效波次结算，不计入表现统计。':''}<br><small>点击查看该场详情</small>`;
  }
  return {model,render,tooltip,plotInsets,rankOf};
})();
