'use strict';
let trendState;
const TREND_METRICS={eggs:{label:'搬蛋',short:'搬蛋',unit:'颗'},kills:{label:'巨大鲑鱼击杀',short:'击杀',unit:'只'},deaths:{label:'被救援次数',short:'被救援次数',unit:'次'}};
function openTrend(){
  const jobs=matches(),teammates=SalmonStats.suspectedTeammates(jobs);
  trendState={jobs,teammates,selected:new Set(),include:false,showNames:true};
  const dialog=document.querySelector('#trend-dialog');
  dialog.innerHTML=`<header class="trend-header"><div><div class="eyebrow">SHIFT COMPARISON</div><h2 id="trend-title">本期表现大图</h2><p class="subtext">${esc(shift().stage.name)} · ${jobs.length} 场已记录 · 从早到晚</p></div><button class="close-chat" id="close-trend" aria-label="关闭大图">×</button></header><div class="trend-body"><div class="trend-toolbar"><button class="button" id="include-teammates" aria-pressed="false" ${teammates.length?'':'disabled'}>加入疑似组队队友（${teammates.length}）</button><p>本期连续同队 ≥ 3 场，仅作疑似识别</p></div><div id="trend-people"></div><div id="trend-plots"></div><p class="trend-footnote">同色为同一玩家，从上到下依次为搬蛋、巨大鲑鱼击杀、被救援次数。队友缺席场次留空；点击任一场查看详情。${shift().loaded<shift().total?'本期记录不完整，识别与对比仅覆盖已保存场次。':''}</p></div>`;
  document.querySelector('#close-trend').onclick=()=>dialog.close();
  document.querySelector('#include-teammates').onclick=()=>{
    trendState.include=!trendState.include;
    trendState.selected=new Set(trendState.include?teammates.map(p=>p.key):[]);
    renderTrend();
  };
  dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
  renderTrend();
  if(!dialog.open)dialog.showModal();
}
function trendPeople(){
  const palette=['#81cbd9','#ff997d','#bc9cff','#f0c36d','#ec91be','#78d5ac','#91acf8'];
  return [{...trendState.jobs[0].players.find(p=>p.me),color:'#d5ef68',self:true},...trendState.teammates.map((p,i)=>({...p,color:palette[i%palette.length],self:false}))];
}
function renderTrend(){
  const {include,selected,teammates,jobs}=trendState,people=trendPeople();
  const scrollLeft=document.querySelector('.trend-chart-scroll')?.scrollLeft||0;
  const toggle=document.querySelector('#include-teammates');
  toggle.textContent=include?'移除队友对比':`加入疑似组队队友（${teammates.length}）`;
  toggle.setAttribute('aria-pressed',String(include));
  toggle.classList.toggle('primary',include);
  document.querySelector('#trend-people').innerHTML=`<span class="trend-person self"><i style="background:${people[0].color}"></i>${esc(people[0].name)} <small>我 · ${jobs.length} 场</small></span>${include?people.slice(1).map(p=>`<label class="trend-person"><input type="checkbox" data-trend-player="${p.key}" ${selected.has(p.key)?'checked':''}><i style="background:${p.color}"></i>${esc(p.name)}<small>${p.count} 场 · 最长连续 ${p.longest} 场</small></label>`).join(''):''}${!teammates.length?'<span class="subtext">本期未识别到连续同队至少 3 场的队友。</span>':''}`;
  const shown=people.filter(p=>p.self||(include&&selected.has(p.key)));
  document.querySelector('#trend-plots').innerHTML=`<div class="trend-outcome-legend"><span><i class="node-solid"></i>常规三波通过</span><span><i class="node-hollow"></i>未通过</span><span>↔ 三张图横向同步</span></div>`+Object.keys(TREND_METRICS).map(metric=>`<section class="trend-plot" data-plot-metric="${metric}"><div class="trend-plot-heading"><h3>${TREND_METRICS[metric].label}<span>${TREND_METRICS[metric].unit}</span></h3>${metric==='eggs'?`<label class="name-switch" title="控制三张图的线尾姓名标签"><span>显示人名</span><input type="checkbox" role="switch" id="show-trend-names" ${trendState.showNames?'checked':''}><i aria-hidden="true"></i></label>`:''}</div><div class="trend-chart-scroll" tabindex="0" role="region" aria-label="${TREND_METRICS[metric].short}图表横向滚动区域"><div class="trend-chart-inner">${largeChart(jobs,shown,metric)}<div class="tooltip trend-tooltip"></div></div></div></section>`).join('');
  const plots=document.querySelector('#trend-plots'),nameSwitch=document.querySelector('#show-trend-names');
  plots.classList.toggle('names-hidden',!trendState.showNames);
  nameSwitch.onchange=()=>{trendState.showNames=nameSwitch.checked;plots.classList.toggle('names-hidden',!trendState.showNames)};
  const scrollers=[...document.querySelectorAll('.trend-chart-scroll')];
  const mirroredPositions=new WeakMap();
  scrollers.forEach(scroller=>{
    scroller.scrollLeft=scrollLeft;
    scroller.onscroll=()=>{
      const mirrored=mirroredPositions.get(scroller);mirroredPositions.delete(scroller);
      if(mirrored!==undefined&&Math.abs(mirrored-scroller.scrollLeft)<1)return;
      scrollers.forEach(other=>{
        if(other!==scroller&&Math.abs(other.scrollLeft-scroller.scrollLeft)>.5){
          mirroredPositions.set(other,scroller.scrollLeft);other.scrollLeft=scroller.scrollLeft;
        }
      });
    };
  });
  document.querySelectorAll('[data-trend-player]').forEach(el=>el.onchange=()=>{el.checked?selected.add(el.dataset.trendPlayer):selected.delete(el.dataset.trendPlayer);renderTrend()});
  document.querySelectorAll('[data-trend-job]').forEach(el=>{
    const j=jobs.find(j=>j.id===el.dataset.trendJob),metric=el.dataset.metric,wrap=el.closest('.trend-chart-inner'),tip=wrap.querySelector('.tooltip');
    const show=()=>{
      const present=shown.flatMap(who=>{const player=j.players.find(p=>p.key===who.key);return player?[{...who,player}]:[]});
      tip.innerHTML=`<strong>第 ${j.index} 场 · ${j.clear?'通过':'未通过'} · ${date(j.time,true)}</strong>${metric==='eggs'?'<small>搬蛋 + 协助搬蛋 · 折线不计协助</small>':''}${present.map(who=>{const p=who.player;return `<div class="trend-tip-row"><span><i style="background:${who.color}"></i>${esc(who.name)}</span><b>${metric==='eggs'?`${fmt(p.eggs)}<span class="tip-assist"> + ${fmt(p.assist)}</span> 颗`:`${fmt(p[metric])} ${TREND_METRICS[metric].unit}`}</b></div>`}).join('')}<small>点击查看场次详情 ↗</small>`;
      tip.style.display='block';
      const a=el.getBoundingClientRect(),b=wrap.getBoundingClientRect();
      tip.style.left=Math.max(4,Math.min(a.x-b.x+15,b.width-tip.offsetWidth-4))+'px';tip.style.top='5px';
    };
    el.onpointerenter=show;el.onpointerleave=()=>tip.style.display='none';el.onfocus=show;el.onblur=()=>tip.style.display='none';
    const go=()=>{document.querySelector('#trend-dialog').close();location.hash=j.id};
    el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}};
  });
}
function largeChart(jobs,people,metric){
  const W=1100,H=260,L=42,R=160,T=18,B=34;
  const peak=Math.max(0,...jobs.flatMap(j=>people.map(who=>j.players.find(p=>p.key===who.key)?.[metric]??0)));
  const max=metric==='deaths'?Math.max(5,Math.ceil(peak/5)*5):Math.max(10,Math.ceil(peak/10)*10);
  const x=i=>L+i*(W-L-R)/Math.max(1,jobs.length-1),y=v=>H-B-v/max*(H-B-T),step=(W-L-R)/Math.max(1,jobs.length-1);
  const placed=[];
  const labels=people.map(p=>{
    const end=SalmonStats.segments(jobs,p.key,metric).at(-1)?.at(-1);if(!end)return '';
    const name=p.name+(p.self?' · 我':''),shortName=[...name].slice(0,18).join('')+([...name].length>18?'…':'');
    const width=Math.min(148,[...shortName].reduce((n,c)=>n+(c.charCodeAt(0)>255?13:7.5),0)+12),left=Math.min(W-width-4,x(end.index)+13);
    const candidates=[-19,9,-43,33,-67,57,-91,81].map(offset=>Math.max(2,Math.min(H-B-23,y(end.value)+offset)));
    const top=candidates.find(top=>placed.every(b=>left+width<b.left-4||left>b.left+b.width+4||top+22<b.top-3||top>b.top+25))??candidates[0];
    placed.push({left,top,width});
    return `<g class="trend-line-label" data-line-label="${p.key}"><title>${esc(name)}</title><path d="M${x(end.index)+5},${y(end.value)} L${left},${top+11}" stroke="${p.color}" stroke-width="1" opacity=".65"/><rect x="${left}" y="${top}" width="${width}" height="22" rx="4"/><text x="${left+6}" y="${top+15}" fill="${p.color}">${esc(shortName)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${TREND_METRICS[metric].short}逐场对比"><text x="${L}" y="${H-3}" class="chart-text">场次</text>${Array.from({length:6},(_,i)=>{const v=max*i/5;return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-text" x="${L-12}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`}).join('')}${people.map(p=>SalmonStats.segments(jobs,p.key,metric).map(segment=>`<polyline class="chart-line" data-player-line="${p.key}" stroke="${p.color}" style="stroke-width:${p.self?3:2}" points="${segment.map(v=>`${x(v.index)},${y(v.value)}`).join(' ')}"/>${segment.map(v=>`<circle class="chart-point ${jobs[v.index].clear?'node-cleared':'node-failed'}" data-point-job="${jobs[v.index].id}" cx="${x(v.index)}" cy="${y(v.value)}" r="4" fill="${jobs[v.index].clear?p.color:'var(--panel)'}" stroke="${p.color}" stroke-width="1.8"/>`).join('')}`).join('')).join('')}${labels}${jobs.map((j,i)=>`<rect class="chart-hit" data-trend-job="${j.id}" data-metric="${metric}" x="${x(i)-step/2}" y="${T}" width="${step}" height="${H-T-B}" tabindex="0" role="link" aria-label="查看第 ${j.index} 场${j.clear?'通过':'未通过'}的${TREND_METRICS[metric].short}数据与详情"/>${jobs.length<36||i%2===0?`<text class="chart-text" x="${x(i)}" y="${H-15}" text-anchor="middle">${j.index}</text>`:''}`).join('')}</svg>`;
}
