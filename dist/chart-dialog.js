'use strict';
let trendState;
const TREND_METRICS={eggs:{label:'搬蛋',short:'搬蛋',unit:'颗'},kills:{label:'巨大鲑鱼击杀',short:'击杀',unit:'只'},deaths:{label:'被救援次数',short:'被救援次数',unit:'次'}};
function trendRangeJobs(){return trendState.jobs.slice(trendState.from,trendState.to+1)}
function trendMarker(x,y,color,clear=true,attributes=''){
  return `<circle class="chart-point ${clear?'node-cleared':'node-failed'}" ${attributes} cx="${x}" cy="${y}" r="4" fill="${clear?color:'#202528'}" stroke="${color}" stroke-width="1.8"/>`;
}
function trendSymbol(person){return `<svg class="trend-symbol" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">${trendMarker(8,8,person.color,true)}</svg>`}

// Reuse the preview's data and geometry, with self-contained SVG styling.
function trendExportSvg(jobs,people,metrics,showNames,stage){
  const width=1160,legendRows=Math.ceil(people.length/3),top=144+legendRows*28,height=top+metrics.length*310+68;
  const style=`text{font-family:"Microsoft YaHei","Noto Sans CJK SC","Segoe UI",sans-serif;font-size:14px}.muted,.chart-text{fill:#a9b4bc}.chart-grid{stroke:#465057;stroke-dasharray:3 5;stroke-width:.7}.chart-line{fill:none;stroke-linejoin:round;stroke-linecap:round}.trend-line-label rect{fill:#202528;stroke:#465057;stroke-width:.5}.trend-line-label text{font-size:13px;font-weight:600}`;
  const legend=people.map((p,i)=>{const x=30+i%3*370,y=132+Math.floor(i/3)*28;return `${trendMarker(x+5,y-5,p.color,true)}<text x="${x+18}" y="${y}">${esc(p.name+(p.self?' · 我':''))}</text>`}).join('');
  const plots=metrics.map((metric,i)=>{
    const y=top+i*310,m=TREND_METRICS[metric];
    return `<text x="30" y="${y}" style="font-size:18px;font-weight:700">${m.label} · ${m.unit}</text>`+largeChart(jobs,people,metric,{interactive:false,showNames}).replace('<svg viewBox=',`<svg x="30" y="${y+12}" width="1100" height="260" viewBox=`);
  }).join('');
  return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" fill="#eff3ed" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style><rect width="100%" height="100%" fill="#202528"/><text x="30" y="38" style="font-size:23px;font-weight:700">SALMON REVIEW · ${esc(stage)}</text><text x="30" y="66">本期第 ${jobs[0].index}—${jobs.at(-1).index} 场 · 共 ${jobs.length} 场 · ${esc(date(jobs[0].time,true))} — ${esc(date(jobs.at(-1).time,true))}（UTC+8）</text><text x="30" y="94" class="muted">实心节点：常规三波通过　空心节点：未通过　同色：同一玩家</text>${legend}${plots}<text x="30" y="${height-42}" class="muted">搬蛋不计协助；被救援不等同全部倒地。队友缺席、缺场或无法确认相邻的位置断线。</text><text x="30" y="${height-18}" class="muted">场次编号沿用本期本地记录顺序；仅导出所选范围和玩家。数据来源：SplatNet 3 结算记录。</text></svg>`};
}
async function exportTrend(format){
  const status=document.querySelector('#trend-export-status'),buttons=[...document.querySelectorAll('[data-export-trend]')];
  const jobs=trendRangeJobs(),people=trendPeople().filter(p=>(p.self||(trendState.include&&trendState.selected.has(p.key)))&&jobs.some(j=>j.players.some(v=>v.key===p.key)));
  const metric=document.querySelector('#trend-export-metric').value,metrics=metric==='all'?Object.keys(TREND_METRICS):[metric];
  const output=trendExportSvg(jobs,people,metrics,trendState.showNames,shift().stage.name);
  const filename=`salmon-${jobs[0].time.slice(0,10)}-${jobs[0].index}-${jobs.at(-1).index}-${metric}.${format}`;
  buttons.forEach(b=>b.disabled=true);status.textContent='正在生成图片…';
  try{
    let blob=new Blob([output.svg],{type:'image/svg+xml;charset=utf-8'});
    if(format==='png'){
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('image_render'));image.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(output.svg)});
      const canvas=document.createElement('canvas');canvas.width=output.width*2;canvas.height=output.height*2;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas_unavailable');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('image_encode');
    }
    if(trendState.exportUrl)URL.revokeObjectURL(trendState.exportUrl);
    const url=URL.createObjectURL(blob);trendState.exportUrl=url;
    status.innerHTML=`已生成第 ${jobs[0].index}—${jobs.at(-1).index} 场图片。<a href="${url}" download="${filename}">下载刚生成的 ${format.toUpperCase()}</a>`;
    status.querySelector('a').click();
    const preview=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
    const details=document.createElement('details');details.innerHTML='<summary>预览导出图片</summary>';
    const picture=document.createElement('img');picture.src=preview;picture.alt=`第 ${jobs[0].index}—${jobs.at(-1).index} 场导出预览`;picture.style.cssText='display:block;max-width:100%;height:auto;margin-top:12px';details.append(picture);status.append(details);
  }catch{status.textContent='图片生成失败，请重试或改用 SVG 格式。'}
  finally{buttons.forEach(b=>b.disabled=false)}
}
function openTrend(){
  if(trendState?.exportUrl)URL.revokeObjectURL(trendState.exportUrl);
  const jobs=matches(),teammates=SalmonStats.suspectedTeammates(jobs);
  trendState={jobs,teammates,selected:new Set(),include:false,showNames:true,from:0,to:jobs.length-1};
  const dialog=document.querySelector('#trend-dialog');
  dialog.innerHTML=`<header class="trend-header"><div><div class="eyebrow">SHIFT COMPARISON</div><h2 id="trend-title">本期表现大图</h2><p class="subtext">${esc(shift().stage.name)} · 本期已保存 ${shift().saved??jobs.length} / ${shift().total} 场 · 从早到晚</p></div><button class="close-chat" id="close-trend" aria-label="关闭大图">×</button></header><div class="trend-body"><div class="trend-toolbar"><button class="button" id="include-teammates" aria-pressed="false" ${teammates.length?'':'disabled'}>加入疑似组队队友（${teammates.length}）</button><p>已确认连续的记录内同队 ≥ 3 场，仅作疑似识别</p></div><div id="trend-people"></div><details class="trend-range" aria-label="选择连续场次与导出"><summary><span>场次筛选与导出</span><span id="trend-range-summary"></span></summary><div class="trend-range-fields"><label>起始场次<select id="trend-from">${jobs.map((j,i)=>`<option value="${i}">第 ${j.index} 场 · ${date(j.time,true)}</option>`).join('')}</select></label><label>结束场次<select id="trend-to">${jobs.map((j,i)=>`<option value="${i}" ${i===jobs.length-1?'selected':''}>第 ${j.index} 场 · ${date(j.time,true)}</option>`).join('')}</select></label><button class="button" id="trend-reset">恢复全部</button></div><div class="trend-export-controls"><label>导出内容<select id="trend-export-metric"><option value="all">全部三张图（长图）</option>${Object.entries(TREND_METRICS).map(([key,m])=>`<option value="${key}">${m.label}</option>`).join('')}</select></label><button class="button primary" data-export-trend="png">导出 PNG</button><button class="button" data-export-trend="svg">导出 SVG</button></div><p id="trend-range-note"></p><div id="trend-export-status" role="status" aria-live="polite"></div></details><div id="trend-plots"></div><p class="trend-footnote">同色为同一玩家，从上到下依次为搬蛋、巨大鲑鱼击杀、被救援次数。队友缺席场次留空；缺场或无法确认相邻的位置断开计数和折线。点击任一场查看详情。${shift().loaded<shift().total?'本期仅保存部分场次，识别与对比覆盖已保存的连续片段。':''}</p></div>`;
  document.querySelector('#close-trend').onclick=()=>dialog.close();
  document.querySelector('#include-teammates').onclick=()=>{
    trendState.include=!trendState.include;
    trendState.selected=new Set(trendState.include?teammates.map(p=>p.key):[]);
    renderTrend();
  };
  for(const end of ['from','to'])document.querySelector('#trend-'+end).onchange=e=>{
    trendState[end]=Number(e.target.value);
    if(trendState.from>trendState.to)trendState[end==='from'?'to':'from']=trendState[end];
    document.querySelector('#trend-from').value=trendState.from;document.querySelector('#trend-to').value=trendState.to;
    document.querySelector('#trend-export-status').textContent='';renderTrend();
  };
  document.querySelector('#trend-reset').onclick=()=>{trendState.from=0;trendState.to=jobs.length-1;document.querySelector('#trend-from').value=0;document.querySelector('#trend-to').value=jobs.length-1;renderTrend()};
  document.querySelectorAll('[data-export-trend]').forEach(button=>button.onclick=()=>exportTrend(button.dataset.exportTrend));
  dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
  renderTrend();
  if(!dialog.open)dialog.showModal();
}
function trendPeople(){
  const palette=['#81cbd9','#ff997d','#bc9cff','#f0c36d','#ec91be','#78d5ac','#91acf8'];
  return [{...trendState.jobs[0].players.find(p=>p.me),color:'#d5ef68',self:true},...trendState.teammates.map((p,i)=>({...p,color:palette[i%palette.length],self:false}))];
}
function renderTrend(){
  const {include,selected,teammates}=trendState,people=trendPeople(),jobs=trendRangeJobs();
  const scrollLeft=document.querySelector('.trend-chart-scroll')?.scrollLeft||0;
  const toggle=document.querySelector('#include-teammates');
  toggle.textContent=include?'移除队友对比':`加入疑似组队队友（${teammates.length}）`;
  toggle.setAttribute('aria-pressed',String(include));
  toggle.classList.toggle('primary',include);
  document.querySelector('#trend-people').innerHTML=`<span class="trend-person self">${trendSymbol(people[0])}${esc(people[0].name)} <small>我 · 本期 ${trendState.jobs.length} 场</small></span>${include?people.slice(1).map(p=>`<label class="trend-person"><input type="checkbox" data-trend-player="${p.key}" ${selected.has(p.key)?'checked':''}>${trendSymbol(p)}${esc(p.name)}<small>${p.count} 场 · 最长连续 ${p.longest} 场</small></label>`).join(''):''}${!teammates.length?'<span class="subtext">已确认连续的记录内，未识别到同队至少 3 场的队友。</span>':''}`;
  const shown=people.filter(p=>p.self||(include&&selected.has(p.key)));
  document.querySelector('#trend-range-summary').textContent=jobs.length===trendState.jobs.length?`全部 ${jobs.length} 场`:`第 ${jobs[0].index}—${jobs.at(-1).index} 场 · ${jobs.length} 场`;
  document.querySelector('#trend-range-note').textContent=`当前显示第 ${jobs[0].index}—${jobs.at(-1).index} 场，共 ${jobs.length} 场。导出沿用当前队友选择与人名开关；缺口仍会断线。`;
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
function largeChart(jobs,people,metric,{interactive=true,showNames=true}={}){
  const W=1100,H=260,L=42,R=160,T=18,B=34;
  const lines=people.map(p=>({...p,metric}));
  const peak=Math.max(0,...jobs.flatMap(j=>lines.map(who=>j.players.find(p=>p.key===who.key)?.[who.metric]??0)));
  const max=metric==='deaths'?Math.max(5,Math.ceil(peak/5)*5):Math.max(10,Math.ceil(peak/10)*10);
  const x=i=>jobs.length===1?(L+W-R)/2:L+i*(W-L-R)/(jobs.length-1),y=v=>H-B-v/max*(H-B-T),step=(W-L-R)/Math.max(1,jobs.length-1);
  const placed=[];
  const labels=(showNames?lines:[]).map(p=>{
    const end=SalmonStats.segments(jobs,p.key,p.metric).at(-1)?.at(-1);if(!end)return '';
    const name=p.name+(p.self?' · 我':''),shortName=[...name].slice(0,18).join('')+([...name].length>18?'…':'');
    const width=Math.min(148,[...shortName].reduce((n,c)=>n+(c.charCodeAt(0)>255?13:7.5),0)+12),left=Math.min(W-width-4,x(end.index)+13);
    const candidates=[-19,9,-43,33,-67,57,-91,81].map(offset=>Math.max(2,Math.min(H-B-23,y(end.value)+offset)));
    const top=candidates.find(top=>placed.every(b=>left+width<b.left-4||left>b.left+b.width+4||top+22<b.top-3||top>b.top+25))??candidates[0];
    placed.push({left,top,width});
    return `<g class="trend-line-label" data-line-label="${p.key}"><title>${esc(name)}</title><path d="M${x(end.index)+5},${y(end.value)} L${left},${top+11}" stroke="${p.color}" stroke-width="1" opacity=".65"/><rect x="${left}" y="${top}" width="${width}" height="22" rx="4"/><text x="${left+6}" y="${top+15}" fill="${p.color}">${esc(shortName)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${TREND_METRICS[metric].short}逐场对比"><text x="${L}" y="${H-3}" class="chart-text">场次</text>${Array.from({length:6},(_,i)=>{const v=max*i/5;return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-text" x="${L-12}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`}).join('')}${lines.map(p=>SalmonStats.segments(jobs,p.key,p.metric).map(segment=>`<polyline class="chart-line" data-player-line="${p.key}" stroke="${p.color}" style="stroke-width:${p.self?3:2}" points="${segment.map(v=>`${x(v.index)},${y(v.value)}`).join(' ')}"/>${segment.map(v=>trendMarker(x(v.index),y(v.value),p.color,jobs[v.index].clear,`data-point-job="${jobs[v.index].id}"`)).join('')}`).join('')).join('')}${labels}${jobs.map((j,i)=>`${interactive?`<rect class="chart-hit" data-trend-job="${j.id}" data-metric="${metric}" x="${x(i)-step/2}" y="${T}" width="${step}" height="${H-T-B}" tabindex="0" role="link" aria-label="查看第 ${j.index} 场${j.clear?'通过':'未通过'}的${TREND_METRICS[metric].short}数据与详情"/>`:""}${jobs.length<36||i%2===0||i===jobs.length-1?`<text class="chart-text" x="${x(i)}" y="${H-15}" text-anchor="middle">${j.index}</text>`:''}`).join('')}</svg>`;
}
