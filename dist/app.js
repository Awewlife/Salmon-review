'use strict';
let hasData=!!window.SALMON_DATA;
let DATA=window.SALMON_DATA??{jobs:[],shifts:[],player:'正在读取战绩',generated:new Date().toISOString()};
window.SALMON_DATA=DATA;
let shiftId=DATA.shifts[0]?.id;
let series={eggs:true,kills:true,deaths:true};
const seriesColors={eggs:'#d5ef68',kills:'#ff7957',deaths:'#a8b0b4'};
let clearedKillsOnly=false;
let overviewMode=window.SalmonPreferences.get().overviewMode;
const app=document.querySelector('#app');
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:1}):'—';
const average=(xs,key)=>xs.reduce((s,j)=>s+(j.players[0][key]??0),0)/(xs.length||1);
const date=(s,full=false)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',month:'2-digit',day:'2-digit',...(full?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(new Date(s));
const time=s=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
const shift=()=>DATA.shifts.find(s=>s.id===shiftId);
const matches=()=>DATA.jobs.filter(j=>j.shift===shiftId);
const chartMatches=()=>(DATA.chartJobs??DATA.jobs).filter(j=>j.shift===shiftId);
const image=(o,cl='',size=32)=>o?.image?`<img class="${cl}" src="${esc(o.image)}" alt="${esc(o.name)}" title="${esc(o.name)}" width="${size}" height="${size}" loading="lazy">`:'';
const weapon=o=>`<span class="weapon-circle" title="${esc(o.name)}">${image(o)}</span>`;
const pill=j=>j.interrupted?'<span class="result disconnected">掉线</span>':`<span class="result-group"><span class="result ${j.clear?'':'fail'}">${j.clear?'通过':'WAVE '+j.failedWave+' 失败'}</span>${j.king?`<span class="result-divider">/</span><span class="king-label ${j.king.clear?'king-cleared':''}" title="${j.king.clear?'头目已击倒':'头目未击倒'}">${esc(j.king.name)}<span class="sr-only">（${j.king.clear?'已击倒':'未击倒'}）</span></span>`:''}</span>`;
const stat=(label,value,unit,note,cls='',icon='')=>`<article class="stat-card ${cls}"><div class="stat-label">${label}<span class="stat-icon">${icon}</span></div><div class="stat-value">${value}<em>${unit}</em></div><div class="stat-note">${note}</div></article>`;
function overview(){
  const s=shift(),js=matches(),timeline=chartMatches(),clears=js.filter(j=>j.clear).length,rate=clears/js.length*100;
  const avgE=average(js,'eggs'),avgK=average(js,'kills'),avgD=average(js,'deaths');
  const avgW=js.reduce((n,j)=>n+SalmonStats.passedWaves(j),0)/(js.length||1),killSample=SalmonStats.killAverage(js,clearedKillsOnly);
  document.querySelector('#breadcrumbs').innerHTML='工作台 <span>/</span> 排班总览';
  document.title='SALMON REVIEW';
  app.innerHTML=`<div class="page-heading"><div><div class="eyebrow">SHIFT REPORT</div><h1>本期打工复盘</h1><p class="subtext">${esc(DATA.player)} 的打工复盘</p></div><select id="shift-select" class="shift-select" aria-label="选择排班">${DATA.shifts.map(x=>`<option value="${x.id}" ${s.id===x.id?'selected':''}>${date(x.start)} — ${date(x.end)} · ${esc(x.stage.name)}</option>`).join('')}</select></div>
  <section class="shift-banner"><div class="shift-copy"><div class="shift-label">${s.id===DATA.shifts[0].id?'最新排班':'历史排班'} / REGULAR <span class="pill ${!s.complete?'warn':''}">本期已保存 ${s.saved??s.loaded} / ${s.total} 场</span>${s.interrupted?`<span class="shift-record-note">另有 ${s.interrupted} 条中断记录 · 不计入统计</span>`:""}${s.excluded?`<span class="shift-record-note">${s.excluded} 场结算字段不全 · 暂不统计</span>`:""}</div><div class="shift-title"><h2>${esc(s.stage.name)}</h2></div><div class="shift-meta"><span>${date(s.start,true)} — ${date(s.end,true)}</span><span>危险度 ${fmt(Math.min(...js.map(j=>j.hazard)))}–${fmt(Math.max(...js.map(j=>j.hazard)))}%</span></div><div class="shift-weapons" role="group" aria-label="本期配发武器">${s.weapons.map(weapon).join('')}</div></div>${image(s.stage,'shift-art',280)}</section>
  <section class="stat-grid">${stat('本期通过率',fmt(rate),'%',`${clears} 场通过 / ${js.length} 场已记录<br><span class="average-waves" title="常规波次：第 1/2/3 波失败分别通过 0/1/2 波，通过为 3 波；不含 EX-WAVE">平均通过 <strong>${fmt(avgW)}</strong> / 3 波</span>`,'','↗')}${stat('场均搬蛋（个人）',fmt(avgE),'颗',`本期合计 ${fmt(js.reduce((n,j)=>n+j.players[0].eggs,0))} 颗`,'lime','●')}${stat('场均击杀（个人）',fmt(killSample.value),'只',`<div class="kill-scope" role="group" aria-label="场均击杀统计范围"><button data-kill-scope="all" aria-pressed="${!clearedKillsOnly}">全部场次</button><button data-kill-scope="cleared" aria-pressed="${clearedKillsOnly}">仅成功场次</button></div><span class="kill-sample">${killSample.count?'巨大鲑鱼 · '+killSample.count+' 场'+(clearedKillsOnly?'通过':'已记录'):'暂无成功场次'}</span>`,'orange kill-stat','×')}${stat('场均被救援',fmt(avgD),'次',`个人救援合计 ${js.reduce((n,j)=>n+j.players[0].rescues,0)} 次`,'','✚')}</section>
  ${window.SalmonRecords.render(timeline)}
  <section class="analysis-grid"><div class="panel"><div class="panel-head overview-chart-head"><div><h2>个人表现趋势</h2><p class="subtext">${overviewMode==='score'?'每场结束时的段位分数':'按时间从早到晚 · 搬蛋、巨大鲑鱼击杀与被救援'}</p></div><div class="chart-mode-switch" role="group" aria-label="趋势图类型"><button data-overview-mode="performance" aria-pressed="${overviewMode==='performance'}">表现趋势</button><button data-overview-mode="score" aria-pressed="${overviewMode==='score'}">分数变化</button></div></div>
  <div class="overview-chart-toolbar">${overviewMode==='score'?`<span class="score-current">最近一场 <strong>${esc(timeline.at(-1)?.grade)} ${fmt(timeline.at(-1)?.gradePoint)}</strong></span><span class="score-auto-label">自动缩放</span>`:`<div class="chart-controls"><button class="legend-button ${series.eggs?'':'off'}" data-series="eggs"><i class="legend-swatch"></i>搬蛋</button><button class="legend-button ${series.kills?'':'off'}" data-series="kills"><i class="legend-swatch kills"></i>击杀</button><button class="legend-button ${series.deaths?'':'off'}" data-series="deaths"><i class="legend-swatch deaths"></i>被救援</button></div>`}</div>
  <div class="chart-wrap ${overviewMode==='score'?'score-wrap':''}" id="chart-wrap">${overviewMode==='score'?SalmonGradeChart.render(timeline,{width:window.innerWidth<720?Math.max(270,window.innerWidth-66):760}):chart(timeline)}<div class="tooltip" id="chart-tooltip"></div></div><div class="chart-axis-note"><span>${overviewMode==='score'?`横轴：本期第 x 场 · 分数：${esc(SalmonGradeChart.model(timeline).rangeLabel)}（自动缩放）`:'横轴：本期已记录第 x 场'}</span>${overviewMode==='score'?'<span>点击节点查看场次 →</span>':'<button id="expand-chart" class="expand-chart" aria-haspopup="dialog" aria-controls="trend-dialog">查看详细趋势 →</button>'}</div>${overviewMode==='score'?'<p class="score-footnote"><span class="score-key solid"></span>通过 <span class="score-key hollow"></span>未通过 <span class="score-key interrupted"></span>对局中断 · 缺场或缺少分数时断线；中断节点显示真实结束分数。</p>':timeline.some(j=>j.interrupted)?'<p class="score-footnote"><span class="score-key interrupted"></span>灰色空心圆：掉线</p>':''}</div>
  </section>
  <section><div class="section-heading"><h2>本期场次</h2><span class="count-badge">${timeline.length}</span><span class="subtext">团队数值 <span class="personal">（个人数值）</span> · 最新在前</span></div><div class="panel table-scroll"><table><thead><tr><th>场次 / 结束分数</th><th>结果</th><th>危险度</th><th>搬蛋 <span class="muted">（个人）</span></th><th>击杀 <span class="muted">（个人）</span></th><th>团队红蛋</th><th title="个人被救援次数，不包含未获救的倒地">被救援次数</th><th></th></tr></thead><tbody>${[...timeline].reverse().map(j=>j.interrupted?{...j,...j.recordedPerformance}:j).map(j=>`<tr class="match-row" data-job="${j.id}" tabindex="0" role="link" aria-label="查看第 ${j.index} 场详情"><td><span class="match-index">#${String(j.index).padStart(2,'0')}</span><span class="match-grade ${j.clear?'grade-cleared':''}" title="${date(j.time,true)} · 结束时的段位分数">${esc(j.grade)} ${fmt(j.gradePoint)}</span></td><td>${pill(j)}</td><td>${fmt(j.hazard)}%</td><td>${j.eggs}<span class="personal">（${j.players[0].eggs}）</span></td><td>${j.kills}<span class="personal kill-personal">（${j.players[0].kills}）</span></td><td>${fmt(j.power)}</td><td>${j.players[0].deaths}</td><td class="row-arrow">↗</td></tr>`).join('')}</tbody></table><div class="table-foot">掉线局按原始记录展示数值，不计入场均表现和通过率。被救援次数来自 NSO 个人结算，不等同完整倒地次数。击杀指巨大鲑鱼，团队击杀为敌人明细中的团队击倒合计。<br>搬蛋团队数来自各波交蛋合计，个人数来自个人结算；两者可能存在原始数据差异。</div></div>${!s.complete||s.excluded?`<div class="coverage">本期已保存 ${s.saved??s.loaded} / ${s.total} 场；其中 ${s.loaded} 场参与统计。队友识别按已确认连续的片段计算，不跨缺口；第 x 场为包含掉线局的本地记录顺序。</div>`:''}</section>`;
  document.querySelector('#shift-select').onchange=e=>{shiftId=e.target.value;overview()};
  document.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{const k=b.dataset.series;if(series[k]&&Object.values(series).filter(Boolean).length===1)return;series[k]=!series[k];overview()});
  document.querySelectorAll('[data-kill-scope]').forEach(b=>b.onclick=()=>{clearedKillsOnly=b.dataset.killScope==='cleared';overview()});
  document.querySelectorAll('[data-overview-mode]').forEach(b=>b.onclick=()=>{overviewMode=b.dataset.overviewMode;window.SalmonPreferences.save({overviewMode});overview()});
  wireCommon();
  fitOverviewChart(timeline);
  if(overviewMode==='score')wireScoreChart(timeline);
  else{
    document.querySelector('#expand-chart').onclick=openTrend;wireChart(timeline);
  }
}
function fitOverviewChart(jobs){
  const wrap=document.querySelector('#chart-wrap'),svg=wrap.querySelector('svg');
  if(!svg)return;
  const style=getComputedStyle(wrap),width=Math.max(240,Math.floor(wrap.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)));
  svg.outerHTML=overviewMode==='score'?SalmonGradeChart.render(jobs,{width}):chart(jobs,{width});
}
function chart(js,{width=window.innerWidth<720?Math.max(270,window.innerWidth-66):760}={}){
  const {left:L,right:R}=SalmonGradeChart.plotInsets(js,width);
  const W=width,H=280,T=20,B=31,max=Math.max(10,Math.ceil(Math.max(...js.flatMap(j=>[series.eggs?j.players[0].eggs:0,series.kills?j.players[0].kills:0,series.deaths?j.players[0].deaths:0]))/10)*10);
  const x=i=>js.length===1?(L+W-R)/2:L+i*(W-L-R)/Math.max(1,js.length-1),y=v=>H-B-v/max*(H-B-T);
  const parts=key=>SalmonStats.segments(js,js.find(j=>!j.interrupted)?.players[0]?.key,key);
  return `<svg viewBox="0 0 ${W} ${H}" style="height:${H}px" role="group" aria-label="个人表现趋势，点击场次查看详情"><title>点击场次查看详情</title><defs><linearGradient id="egg-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d5ef68" stop-opacity=".13"/><stop offset="100%" stop-color="#d5ef68" stop-opacity="0"/></linearGradient></defs>${Array.from({length:6},(_,i)=>{const v=max*i/5;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text class="chart-text" x="${L-11}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`}).join('')}${series.eggs?parts('eggs').filter(part=>part.length>1).map(part=>`<polygon points="${x(part[0].index)},${H-B} ${part.map(p=>`${x(p.index)},${y(p.value)}`).join(' ')} ${x(part.at(-1).index)},${H-B}" fill="url(#egg-fill)"/>`).join(''):''}${['eggs','kills','deaths'].filter(k=>series[k]).map(k=>parts(k).map(segment=>`<polyline class="chart-line" stroke="${seriesColors[k]}" points="${segment.map(p=>`${x(p.index)},${y(p.value)}`).join(' ')}"/>${segment.filter(p=>!js[p.index].interrupted).map(p=>`<circle class="chart-point ${js[p.index].clear?'node-cleared':'node-failed'}" cx="${x(p.index)}" cy="${y(p.value)}" r="3.5" fill="${js[p.index].clear?seriesColors[k]:'var(--panel)'}" stroke="${seriesColors[k]}" stroke-width="1.6"/>`).join('')}`).join('')).join('')}${js.map((j,i)=>`${j.interrupted?SalmonStats.interruptionMarker(x(i),y(0)):''}<rect class="chart-hit" role="link" tabindex="0" data-chart-job="${j.id}" x="${x(i)-Math.min(24,(W-L-R)/Math.max(1,js.length-1))/2}" y="${T}" width="${Math.min(24,(W-L-R)/Math.max(1,js.length-1))}" height="${H-B-T+14}" aria-label="${j.interrupted?`查看第 ${j.index} 场掉线记录`:`查看第 ${j.index} 场详情，搬蛋 ${j.players[0].eggs}，击杀 ${j.players[0].kills}，被救援 ${j.players[0].deaths}`}"/>${i===0||i===js.length-1||(i+1)%(W<500?5:3)===0?`<text class="chart-text" x="${x(i)}" y="${H-8}" text-anchor="middle">${j.index}</text>`:''}`).join('')}</svg>`;

}
function wireChart(js){const tt=document.querySelector('#chart-tooltip'),wrap=document.querySelector('#chart-wrap');document.querySelectorAll('[data-chart-job]').forEach(e=>{e.onpointermove=ev=>{const j=js.find(j=>j.id===e.dataset.chartJob),r=wrap.getBoundingClientRect();tt.innerHTML=j.interrupted?`<strong>对局中断 · ${date(j.time,true)}</strong><br>本场无有效结算数据，不计入表现统计。<br>结束分数：${esc(j.grade)} ${fmt(j.gradePoint)}<br><small>点击查看本场详情 →</small>`:`第 ${j.index} 场 · ${j.clear?'通过':'失败'}<br><span style="color:var(--lime)">搬蛋 ${j.players[0].eggs}<span class="tip-assist"> + ${fmt(j.players[0].assist)} 协助</span></span>　<span style="color:var(--orange)">击杀 ${j.players[0].kills}</span><br><span style="color:${seriesColors.deaths}">被救援 ${j.players[0].deaths} 次</span><br><small>点击查看本场详情 →</small>`;tt.style.display='block';tt.style.left=Math.max(5,Math.min(ev.clientX-r.left+12,r.width-tt.offsetWidth-6))+'px';tt.style.top='12px'};e.onpointerleave=()=>tt.style.display='none';e.onclick=()=>location.hash=e.dataset.chartJob;e.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();location.hash=e.dataset.chartJob}}})}
function wireScoreChart(jobs){
  const tt=document.querySelector('#chart-tooltip'),wrap=document.querySelector('#chart-wrap');
  document.querySelectorAll('[data-score-job]').forEach(element=>{
    const index=jobs.findIndex(j=>j.id===element.dataset.scoreJob);
    const show=clientX=>{const r=wrap.getBoundingClientRect();tt.innerHTML=SalmonGradeChart.tooltip(jobs,index);tt.style.display='block';tt.style.left=Math.max(4,Math.min(clientX-r.left+12,r.width-tt.offsetWidth-4))+'px';tt.style.top='8px'};
    element.onpointermove=e=>show(e.clientX);element.onpointerleave=()=>tt.style.display='none';
    element.onfocus=()=>{const r=element.getBoundingClientRect();show(r.left+r.width/2)};
    element.onblur=()=>tt.style.display='none';
    element.onclick=()=>location.hash=jobs[index].id;
    element.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();location.hash=jobs[index].id}};
  });
}
function wireCommon(){document.querySelectorAll('[data-job]').forEach(el=>{el.onclick=()=>location.hash=el.dataset.job;el.onkeydown=e=>{if(e.key==='Enter')location.hash=el.dataset.job}});}
function unusedSpecialTag(j,p){
  const usage=SalmonStats.unusedSpecials(j,p);
  return usage?`<span class="unused-special-tag" title="本场失败；常规波次已用 ${usage.used}/2 次大招，剩余 ${usage.remaining} 次">裤裆藏大</span>`:'';
}
function interruptedDetail(j){
  document.title='SALMON REVIEW';
  document.querySelector('#breadcrumbs').innerHTML='工作台 <span>/</span> 对局中断';
  app.innerHTML=`<div class="detail-toolbar"><a href="#" class="back-link">← 返回排班总览</a></div><section class="panel interrupted-detail"><div class="eyebrow">INTERRUPTED MATCH</div><h1>对局中断</h1><p>${esc(j.stage.name)} · ${date(j.time,true)}</p><p>结束分数：<strong>${esc(j.grade)} ${fmt(j.gradePoint)}</strong></p><p>本场没有有效波次结算，搬蛋、击杀、救援等数据不作为成绩展示，也不计入场均表现和通过率。</p><p class="subtext">记录未提供掉线玩家及具体原因。相邻关系与队友身份已确认时，掉线不打断连续组队判断，也不计入有效场数；缺场或队友离队仍会断开。</p></section>`;
}
function detail(j){
  const js=chartMatches(),pos=js.findIndex(x=>x.id===j.id),me=j.players[0],teamBosses=j.bosses.reduce((n,b)=>n+b.team,0),spawned=j.bosses.reduce((n,b)=>n+b.appeared,0);
  document.title='SALMON REVIEW';
  document.querySelector('#breadcrumbs').innerHTML=`工作台 <span>/</span> <a href="#">排班总览</a> <span>/</span> 第 ${j.index} 场`;
  app.innerHTML=`<div class="detail-toolbar"><a href="#" class="back-link">← 返回排班总览</a><div class="pager">${pos>0?`<a class="button" href="#${js[pos-1].id}">← 上一场</a>`:'<button class="button" disabled>← 上一场</button>'}<span>${pos+1} / ${js.length}</span>${pos<js.length-1?`<a class="button" href="#${js[pos+1].id}">下一场 →</a>`:'<button class="button" disabled>下一场 →</button>'}</div></div>
  <section class="job-banner panel"><div class="job-banner-copy"><div class="eyebrow">JOB REPORT / #${String(j.index).padStart(2,'0')}</div><div class="job-title"><h1>${esc(j.stage.name)}</h1>${pill(j)}</div><p class="subtext">${date(j.time,true)} · 危险度 <strong>${fmt(j.hazard)}%</strong> · ${esc(j.grade)} ${fmt(j.gradePoint)}</p></div>${image(j.stage,'job-art',250)}</section>
  <section class="stat-grid">${stat('搬蛋 · 团队 / 个人',`${j.eggs}<span class="small-personal">（${me.eggs}）</span>`,'颗','个人搬蛋不含协助搬运','lime')}${stat('击杀 · 团队 / 个人',`${j.kills}<span class="small-personal">（${me.kills}）</span>`,'只','巨大鲑鱼明细 · 团队击倒合计','orange')}${stat('红蛋 · 团队',fmt(j.power),'颗',`个人 ${fmt(me.power)} 颗`)}${stat('个人救援 / 被救援',`${me.rescues} <span class="slash">/</span> ${me.deaths}`,'次','被救援不等同完整倒地次数')}</section>
  <div class="detail-layout"><div class="detail-main"><section class="panel"><div class="panel-head"><h2>波次表现</h2><span class="subtext">潮位 / 事件 / 交蛋</span></div><div class="waves">${j.waves.map(w=>{const ex=w.number>3,passed=ex?j.king?.clear:(j.clear||w.number<j.failedWave);return `<article class="wave-card ${ex?'ex-wave':''}"><div class="wave-heading"><h3>${ex?'EX-WAVE':'WAVE '+w.number}</h3><span class="${passed?'wave-ok':'muted'}">${passed?'✓':'—'}</span></div><div class="wave-score">${ex?(j.king?.clear?'击倒！':'未击倒'):`${w.eggs}<small> / ${w.quota}</small>`}</div><div class="wave-meta"><span>${esc(w.tide)}</span><span>${esc(ex?j.king?.name:w.event)}</span></div><div class="wave-spawn">金蛋出现 ${w.appeared} 颗</div><div class="wave-specials">${w.specials.length?w.specials.map(s=>image(s,'',26)).join(''):'<span>未使用特殊武器</span>'}</div></article>`}).join('')}</div></section>
  <section><div class="section-heading"><h2>队员表现</h2><span class="subtext">武器按波次排列</span></div><div class="panel table-scroll"><table class="players-table"><thead><tr><th>队员 / 武器</th><th>巨大鲑鱼</th><th>搬蛋 <span class="muted">+ 协助</span></th><th>红蛋</th><th>救援 / 被救援</th></tr></thead><tbody>${j.players.map(p=>`<tr class="${p.me?'my-row':''}"><td><div class="player-name">${esc(p.name)} ${p.me?'<span class="you-tag">YOU</span>':''} ${unusedSpecialTag(j,p)}</div><div class="player-weapons">${p.weapons.map((w,i)=>`<span title="${i<3?'WAVE '+(i+1):'EX-WAVE'} · ${esc(w.name)}">${image(w,'',29)}</span>`).join('')}<i></i>${image(p.special,'',25)}</div></td><td class="kill-number">${p.kills}</td><td><strong class="egg-number">${p.eggs}</strong> <span class="assist">+ ${p.assist}</span></td><td>${fmt(p.power)}</td><td>${p.rescues} <span class="muted">/</span> ${p.deaths}</td></tr>`).join('')}</tbody></table></div>${j.eggReconciliationDelta?`<p class="page-footer-note">本场个人搬蛋之和与波次交蛋之和相差 ${j.eggReconciliationDelta} 颗，按原始字段分别展示。</p>`:''}</section>
  <section class="panel"><div class="panel-head"><div><h2>巨大鲑鱼明细</h2><p class="subtext">团队击倒 <span class="personal">（个人）</span> / 出现数量</p></div><span class="boss-total">${teamBosses}<small> / ${spawned}</small></span></div><div class="boss-grid">${j.bosses.map(b=>`<div class="boss-item">${image(b,'boss-icon',46)}<div class="boss-info"><div class="boss-line"><span>${esc(b.name)}</span><span>${b.team}<b>（${b.me}）</b><em> / ${b.appeared}</em></span></div><div class="boss-bar"><span style="width:${Math.min(100,b.team/Math.max(1,b.appeared)*100)}%"></span></div></div></div>`).join('')}</div><div class="table-foot">团队击倒 ${j.kills} 只；四名队员个人击杀合计 ${j.playerKills} 只。两种原始统计口径可能不同，总览采用此处团队击倒数。</div></section>
  ${j.king?`<section class="panel king-panel">${image(j.king,'king-image',105)}<div><div class="eyebrow">KING SALMONID</div><h2>${esc(j.king.name)} <span class="result ${j.king.clear?'':'fail'}">${j.king.clear?'成功击倒':'未击倒'}</span></h2><p class="subtext">${j.scales?`获得鳞片：<span class="gold">金 ${j.scales.gold}</span> · 银 ${j.scales.silver} · 铜 ${j.scales.bronze}`:'未记录鳞片奖励'}</p></div></section>`:''}
  </div><aside class="detail-aside">
  <section class="panel reward-panel"><div class="eyebrow">GRIZZCO POINTS</div><h2>获得点数</h2><div class="reward-value">${fmt(j.jobPoint)}<small>p</small></div><div class="reward-equation">${fmt(j.jobScore)} × ${esc(j.jobRate)} + ${fmt(j.jobBonus)}</div><div class="reward-labels"><span>打工分数</span><span>评价倍率</span><span>过关奖励</span></div></section><p class="page-footer-note">数据来自 NSO 结算记录<br>时间统一为 UTC+8</p></aside></div>`;
  wireCommon();
}
function route({preserveScroll=false}={}){if(!hasData){app.innerHTML='<section class="panel empty-state"><h1>正在读取本机战绩…</h1><p>读取完成后自动展示，无需重新登录或导入。</p></section>';return}if(!DATA.jobs.length){app.innerHTML=`<section class="panel empty-state"><div class="eyebrow">SALMON REVIEW</div><h1>开始你的打工复盘</h1><p>连接账号同步，或导入 nxapi 打工详情与排班汇总 JSON。</p><p>${DATA.archived?`已保存 ${DATA.archived} 场，暂未归类或未支持的记录可在数据管理中查看。`:'战绩保存在这个实例的数据卷中。'}</p><button class="button primary" id="get-started">导入记录 / 连接账号</button></section>`;document.querySelector('#get-started').onclick=()=>window.openManage();return}const id=location.hash.slice(1),j=(DATA.chartJobs??DATA.jobs).find(j=>j.id===id);document.querySelector('#nav-overview').classList.toggle('active',!j);document.querySelector('#nav-latest').classList.toggle('active',!!j);if(j){shiftId=j.shift;j.interrupted?interruptedDetail(j):detail(j)}else overview();if(!preserveScroll)window.scrollTo(0,0)}
document.querySelector('.sidebar-bottom>p').innerHTML=hasData?`${DATA.archived??DATA.jobs.length} 场记录 · ${DATA.shifts.length} 期排班<br>更新于 ${date(DATA.generated)}`:'正在读取本机战绩…';
document.querySelector('.profile>div:last-child').innerHTML=`${esc(DATA.player)}<small>我的打工记录</small>`;
document.querySelector('#nav-latest').onclick=()=>{const job=chartMatches().at(-1);if(job)location.hash=job.id};

window.addEventListener('hashchange',route);route();
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(DATA.jobs.length&&!(DATA.chartJobs??DATA.jobs).some(j=>'#'+j.id===location.hash))overview()},120)});

window.replaceData=data=>{
  if(!window.SalmonViewData.valid(data))throw new Error('战绩数据格式异常，已保留当前展示。');
  const changed=!hasData||window.SalmonViewData.signature(DATA)!==window.SalmonViewData.signature(data);
  DATA=data;window.SALMON_DATA=data;hasData=true;
  if(!DATA.shifts.some(s=>s.id===shiftId))shiftId=DATA.shifts[0]?.id;
  if(changed){
    const x=window.scrollX,y=window.scrollY;
    document.querySelector('.sidebar-bottom>p').innerHTML=`${DATA.archived??DATA.jobs.length} 场已保存 · ${DATA.shifts.length} 期可查看`;
    document.querySelector('.profile>div:last-child').innerHTML=`${esc(DATA.player)}<small>我的打工记录</small>`;
    route({preserveScroll:true});window.scrollTo(x,y);
  }
  window.SalmonViewData.save(data);
};
window.hasLoadedData=()=>hasData;
