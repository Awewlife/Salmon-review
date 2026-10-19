'use strict';
let trendState;
const TREND_METRICS={eggs:{label:'搬蛋',short:'搬蛋',unit:'颗'},kills:{label:'巨大鲑鱼击杀',short:'击杀',unit:'只'},deaths:{label:'被救援次数',short:'被救援次数',unit:'次'},power:{label:'红蛋',short:'红蛋',unit:'颗',preference:'showPower'}};
function trendVisibleMetrics(preferences=trendState){return Object.keys(TREND_METRICS).filter(key=>!TREND_METRICS[key].preference||preferences[TREND_METRICS[key].preference]===true)}
function trendExportOptions(preferences){const metrics=trendVisibleMetrics(preferences);return `<option value="all">当前显示的全部图表（${metrics.length} 张长图）</option>`+metrics.map(key=>`<option value="${key}">${TREND_METRICS[key].label}</option>`).join('')}
function trendRangeJobs(){return trendState.jobs.slice(trendState.from,trendState.to+1)}
function trendMarker(x,y,color,clear=true,attributes=''){
  return `<circle class="chart-point ${clear?'node-cleared':'node-failed'}" ${attributes} cx="${x}" cy="${y}" r="4" fill="${clear?color:'#202528'}" stroke="${color}" stroke-width="1.8"/>`;
}
function trendSymbol(person){return `<svg class="trend-symbol" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">${trendMarker(8,8,person.color,true)}</svg>`}

// Reuse the preview's data and geometry, with self-contained SVG styling.
function trendExportSvg(jobs,people,metrics,showNames,stage,{mode='quantity',showTotal=false,shareScale='auto',showQuarter=false}={}){
  const totalVisible=mode==='quantity'&&showTotal;
  const rangeLabel=jobs.some(j=>j.interrupted)?`${jobs.filter(j=>!j.interrupted).length} 场结算 · ${jobs.filter(j=>j.interrupted).length} 次中断`:`本期第 ${jobs[0].index}—${jobs.at(-1).index} 场 · 共 ${jobs.length} 场`;
  const plotHeight=260;
  const width=1160,legendRows=Math.ceil((people.length+(totalVisible?1:0))/3),top=144+legendRows*28,height=top+metrics.length*(plotHeight+50)+92;
  const style=`text{font-family:"Microsoft YaHei","Noto Sans CJK SC","Segoe UI",sans-serif;font-size:14px}.muted,.chart-text{fill:#a9b4bc}.chart-grid{stroke:#465057;stroke-dasharray:3 5;stroke-width:.7}.chart-line{fill:none;stroke-linejoin:round;stroke-linecap:round}.label-crowded{display:none}.trend-line-label rect{fill:#202528;stroke:#465057;stroke-width:.5}.trend-line-label text{font-size:13px;font-weight:600}`;
  const legend=[...people,...(totalVisible?[{name:'团队合计（四人）',total:true}]:[])].map((p,i)=>{const x=30+i%3*370,y=132+Math.floor(i/3)*28;return `${p.total?`<line x1="${x}" x2="${x+13}" y1="${y-5}" y2="${y-5}" stroke="#a8b0b4" stroke-width="2" stroke-dasharray="5 4"/>`:trendMarker(x+5,y-5,p.color,true)}<text x="${x+18}" y="${y}">${esc(p.name+(p.self?' · 我':''))}</text>`}).join('');
  const plots=metrics.map((metric,i)=>{
    const y=top+i*(plotHeight+50),m=TREND_METRICS[metric];
    return `<text x="30" y="${y}" style="font-size:18px;font-weight:700">${m.label} · ${mode==='share'?'占比（%）':m.unit}</text>`+largeChart(jobs,people,metric,{interactive:false,showNames,mode,showTotal,shareScale,showQuarter}).replace('<svg viewBox=',`<svg x="30" y="${y+12}" width="1100" height="${plotHeight}" viewBox=`);
  }).join('');
  return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" fill="#eff3ed" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style><rect width="100%" height="100%" fill="#202528"/><text x="30" y="38" style="font-size:23px;font-weight:700">SALMON REVIEW · ${esc(stage)}</text><text x="30" y="66">${rangeLabel} · ${esc(date(jobs[0].time,true))} — ${esc(date(jobs.at(-1).time,true))}（UTC+8）</text><text x="30" y="94" class="muted">实心：通过　空心：未通过　灰色空心圆：掉线　同色：同一玩家</text>${legend}${plots}<text x="30" y="${height-66}" class="muted">${mode==='share'?'占比':'数量'} · 四人合计按当场四人的个人结算求和，不随显示玩家变化；搬蛋不含协助，被救援不等同全部倒地。</text><text x="30" y="${height-42}" class="muted">${mode==='share'?'全队为 0 时按 0% 展示；掉线按零刻度标记连接，不计算占比；缺场或队友缺席仍断线。':'掉线标在 0，个人曲线与均分参考线经过此处，不计入统计；团队合计不包含掉线；缺场仍断线。'}</text><text x="30" y="${height-18}" class="muted">场次编号沿用本期本地记录顺序；仅导出所选范围和玩家。数据来源：SplatNet 3 结算记录。</text></svg>`};
}
async function exportTrend(format){
  const status=document.querySelector('#trend-export-status'),buttons=[...document.querySelectorAll('[data-export-trend]')];
  const jobs=trendRangeJobs(),people=trendPeople().filter(p=>(p.self||(trendState.include&&trendState.selected.has(p.key)))&&jobs.some(j=>j.players.some(v=>v.key===p.key)));
  const metric=document.querySelector('#trend-export-metric').value,metrics=metric==='all'?trendVisibleMetrics():[metric];
  const state=trendState,revision=state.revision;
  const output=trendExportSvg(jobs,people,metrics,state.showNames,shift().stage.name,state);
  const filename=`salmon-${jobs[0].time.slice(0,10)}-${jobs[0].index}-${jobs.at(-1).index}-${metric}-${trendState.mode}.${format}`;
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
    if(trendState!==state||state.revision!==revision||!status.isConnected||!document.querySelector('#trend-dialog').open)return;
    if(trendState.exportUrl)URL.revokeObjectURL(trendState.exportUrl);
    const url=URL.createObjectURL(blob);trendState.exportUrl=url;
    status.innerHTML=`已生成所选 ${jobs.length} 条记录的图片。<a href="${url}" download="${filename}">下载刚生成的 ${format.toUpperCase()}</a>`;
    status.querySelector('a').click();
    const preview=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
    if(trendState!==state||state.revision!==revision||!status.isConnected||!document.querySelector('#trend-dialog').open)return;
    const details=document.createElement('details');details.innerHTML='<summary>预览导出图片</summary>';
    const picture=document.createElement('img');picture.src=preview;picture.alt=`所选 ${jobs.length} 条记录导出预览`;picture.style.cssText='display:block;max-width:100%;height:auto;margin-top:12px';details.append(picture);status.append(details);
  }catch{status.textContent='图片生成失败，请重试或改用 SVG 格式。'}
  finally{buttons.forEach(b=>b.disabled=false)}
}
function openTrend(){
  if(trendState?.exportUrl)URL.revokeObjectURL(trendState.exportUrl);
  const jobs=chartMatches(),teammates=SalmonStats.suspectedTeammates(jobs);
  trendState={jobs,teammates,selected:new Set(),include:false,...window.SalmonPreferences.get(),from:0,to:jobs.length-1};
  const dialog=document.querySelector('#trend-dialog');
  dialog.innerHTML=`<header class="trend-header"><div><div class="eyebrow">SHIFT COMPARISON</div><h2 id="trend-title">本期趋势详情</h2><p class="subtext">分项趋势 · 队友对比 · 图表导出</p><p class="subtext">${esc(shift().stage.name)} · 本期已保存 ${shift().saved??jobs.length} / ${shift().total} 场 · 从早到晚</p></div><button class="close-chat" id="close-trend" aria-label="关闭趋势详情">×</button></header><div class="trend-body"><div class="trend-toolbar"><button class="button" id="include-teammates" aria-pressed="false" ${teammates.length?'':'disabled'}>加入疑似组队队友（${teammates.length}）</button><p>已确认连续的记录内同队 ≥ 3 场；掉线不打断，也不计场数，仅作疑似识别</p></div><div id="trend-people"></div><div class="trend-display-controls"><div class="chart-mode-switch" role="group" aria-label="趋势数值类型"><button data-trend-mode="quantity" aria-pressed="true">数量</button><button data-trend-mode="share" aria-pressed="false">占比</button></div><label class="trend-total-toggle" id="trend-total-control"><input type="checkbox" id="show-trend-total"><span class="team-total-swatch" aria-hidden="true"></span>团队合计（四人）</label><div class="chart-mode-switch" id="trend-share-scale" role="group" aria-label="占比纵轴范围" hidden><button data-share-scale="auto" aria-pressed="true">自动缩放</button><button data-share-scale="fixed" aria-pressed="false">0–100%</button></div><label class="trend-total-toggle" id="trend-quarter-control" title="四人均分参考，不代表及格线"><input type="checkbox" id="show-trend-quarter">25% 参考线</label><details class="trend-more-charts"><summary>更多图表</summary><div class="trend-more-options">${Object.entries(TREND_METRICS).filter(([,metric])=>metric.preference).map(([key,metric])=>`<label><input type="checkbox" data-extra-chart="${key}" ${trendState[metric.preference]?'checked':''}>${metric.label}</label>`).join('')}</div></details><span class="trend-measure-note" id="trend-measure-note"></span></div><details class="trend-range" aria-label="选择连续场次与导出"><summary><span>场次筛选与导出</span><span id="trend-range-summary"></span></summary><div class="trend-range-fields"><label>起始场次<select id="trend-from">${jobs.map((j,i)=>`<option value="${i}">${j.interrupted?'对局中断':'第 '+j.index+' 场'} · ${date(j.time,true)}</option>`).join('')}</select></label><label>结束场次<select id="trend-to">${jobs.map((j,i)=>`<option value="${i}" ${i===jobs.length-1?'selected':''}>${j.interrupted?'对局中断':'第 '+j.index+' 场'} · ${date(j.time,true)}</option>`).join('')}</select></label><button class="button" id="trend-reset">恢复全部</button></div><div class="trend-export-controls"><label>导出内容<select id="trend-export-metric">${trendExportOptions(trendState)}</select></label><button class="button primary" data-export-trend="png">导出 PNG</button><button class="button" data-export-trend="svg">导出 SVG</button></div><p id="trend-range-note"></p><div id="trend-export-status" role="status" aria-live="polite"></div></details><div id="trend-plots"></div><p class="trend-footnote" id="trend-footnote"></p></div>`;
  document.querySelector('#close-trend').onclick=()=>dialog.close();
  document.querySelectorAll('[data-trend-mode]').forEach(button=>button.onclick=()=>{trendState.mode=button.dataset.trendMode;window.SalmonPreferences.save({mode:trendState.mode});document.querySelector('#trend-export-status').textContent='';renderTrend()});
  document.querySelectorAll('[data-share-scale]').forEach(button=>button.onclick=()=>{trendState.shareScale=button.dataset.shareScale;window.SalmonPreferences.save({shareScale:trendState.shareScale});document.querySelector('#trend-export-status').textContent='';renderTrend()});
  document.querySelector('#show-trend-quarter').onchange=e=>{trendState.showQuarter=e.target.checked;window.SalmonPreferences.save({showQuarter:trendState.showQuarter});document.querySelector('#trend-export-status').textContent='';renderTrend()};
  document.querySelector('#show-trend-total').onchange=e=>{trendState.showTotal=e.target.checked;window.SalmonPreferences.save({showTotal:trendState.showTotal});document.querySelector('#trend-export-status').textContent='';renderTrend()};
  document.querySelectorAll('[data-extra-chart]').forEach(input=>input.onchange=()=>{const preference=TREND_METRICS[input.dataset.extraChart].preference;trendState[preference]=input.checked;window.SalmonPreferences.save({[preference]:input.checked});renderTrend()});
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
  const {include,selected,teammates,mode,showTotal,shareScale,showQuarter}=trendState,people=trendPeople(),jobs=trendRangeJobs();
  trendState.revision=(trendState.revision??0)+1;
  document.querySelector('#trend-export-status').replaceChildren();
  if(trendState.exportUrl){URL.revokeObjectURL(trendState.exportUrl);trendState.exportUrl=null}
  const exportSelect=document.querySelector('#trend-export-metric'),previousMetric=exportSelect.value;
  exportSelect.innerHTML=trendExportOptions(trendState);exportSelect.value=trendVisibleMetrics().includes(previousMetric)?previousMetric:'all';
  const scrollLeft=document.querySelector('.trend-chart-scroll')?.scrollLeft||0;
  document.querySelectorAll('[data-trend-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.trendMode===mode)));
  document.querySelector('#trend-quarter-control').title=mode==='share'?'四人均分参考，不代表及格线':'每场四人合计 ÷ 4，不代表及格线';
  document.querySelector('#show-trend-quarter').checked=showQuarter;
  document.querySelector('#trend-share-scale').hidden=mode!=='share';
  document.querySelectorAll('[data-share-scale]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.shareScale===shareScale)));
  document.querySelector('#trend-total-control').hidden=mode==='share';
  document.querySelector('#show-trend-total').checked=showTotal;
  document.querySelector('#trend-measure-note').textContent=mode==='share'?'占当场四人合计 · 全队为 0 时显示 0%':'团队合计按当场四人的个人结算求和';
  document.querySelector('#trend-footnote').textContent=`同色为同一玩家；搬蛋不含协助；红蛋来自个人结算；被救援不等同全部倒地。${mode==='share'?'占比以当场四人合计为分母，不随显示玩家变化；全队为 0 时按 0% 展示并连接。灰色空心圆表示掉线，曲线经过零刻度标记，不计算占比。':'灰色空心圆表示掉线，个人曲线与均分参考线按场次经过零刻度的掉线标记，不计入统计；团队合计不包含掉线。'}缺场、结算缺失或队友缺席处断线。点击场次查看详情。${shift().loaded<shift().total?'本期仅保存部分场次，识别与对比覆盖已保存的连续片段。':''}`;
  const toggle=document.querySelector('#include-teammates');
  toggle.textContent=include?'移除队友对比':`加入疑似组队队友（${teammates.length}）`;
  toggle.setAttribute('aria-pressed',String(include));
  toggle.classList.toggle('primary',include);
  document.querySelector('#trend-people').innerHTML=`<span class="trend-person self">${trendSymbol(people[0])}${esc(people[0].name)} <small>我 · 本期 ${trendState.jobs.filter(j=>!j.interrupted).length} 场</small></span>${include?people.slice(1).map(p=>`<label class="trend-person"><input type="checkbox" data-trend-player="${p.key}" ${selected.has(p.key)?'checked':''}>${trendSymbol(p)}${esc(p.name)}<small>${p.count} 场 · 最长连续 ${p.longest} 场</small></label>`).join(''):''}${!teammates.length?'<span class="subtext">已确认连续的记录内，未识别到同队至少 3 场的队友。</span>':''}`;
  const shown=people.filter(p=>p.self||(include&&selected.has(p.key)));
  document.querySelector('#trend-range-summary').textContent=jobs.length===trendState.jobs.length?`全部 ${jobs.length} 条记录`:`${jobs.length} 条记录（含 ${jobs.filter(j=>j.interrupted).length} 次中断）`;
  document.querySelector('#trend-range-note').textContent=`当前显示 ${jobs.filter(j=>!j.interrupted).length} 场结算、${jobs.filter(j=>j.interrupted).length} 次中断。导出沿用当前显示的图表、数量 / 占比模式、纵轴范围、25% 参考线、团队合计、队友选择与人名开关。`;
  document.querySelector('#trend-plots').innerHTML=`<div class="trend-outcome-legend"><span><i class="node-solid"></i>常规三波通过</span><span><i class="node-hollow"></i>未通过</span><span>○ 灰色空心圆：掉线</span>${mode==='quantity'&&showTotal?'<span><b class="team-total-swatch" aria-hidden="true"></b>团队合计（四人）</span>':''}<span>↔ 各图同步定位场次</span></div>`+trendVisibleMetrics().map(metric=>`<section class="trend-plot" data-plot-metric="${metric}"><div class="trend-plot-heading"><h3>${TREND_METRICS[metric].label}<span>${mode==='share'?'占比 · %':TREND_METRICS[metric].unit}</span></h3>${metric==='eggs'?`<label class="name-switch" title="人名靠近各自折线末端；拥挤时悬停曲线查看"><span>显示人名</span><input type="checkbox" role="switch" id="show-trend-names" ${trendState.showNames?'checked':''}><i aria-hidden="true"></i></label>`:''}</div><p class="trend-current" aria-live="polite"></p><div class="trend-chart-scroll" tabindex="0" role="region" aria-label="${TREND_METRICS[metric].short}图表横向滚动区域"><div class="trend-chart-inner">${largeChart(jobs,shown,metric,{mode,showTotal,shareScale,showQuarter})}</div></div><div class="tooltip trend-tooltip"></div></section>`).join('');
  const plots=document.querySelector('#trend-plots'),nameSwitch=document.querySelector('#show-trend-names');
  plots.classList.toggle('names-hidden',!trendState.showNames);
  nameSwitch.onchange=()=>{trendState.revision++;document.querySelector('#trend-export-status').replaceChildren();trendState.showNames=nameSwitch.checked;window.SalmonPreferences.save({showNames:trendState.showNames});plots.classList.toggle('names-hidden',!trendState.showNames)};
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
  bindTrendInteractions(plots,jobs,shown);
}
function bindTrendInteractions(plots,jobs,people){
  let pointerTarget=null,focusTarget=null,pointerPlayer=null,focusPlayer=null;
  const nearestPlayer=(el,event)=>{
    const svg=el.closest('svg'),box=svg.getBoundingClientRect(),scale=box.height/svg.viewBox.baseVal.height;
    const points=[...svg.querySelectorAll('[data-point-job]')].filter(p=>p.dataset.pointJob===el.dataset.trendJob);
    const nearest=points.map(p=>({key:p.dataset.seriesKey,distance:Math.abs(box.top+Number(p.getAttribute('cy'))*scale-event.clientY)})).sort((a,b)=>a.distance-b.distance)[0];
    return nearest?.distance<=14?nearest.key:null;
  };
  const update=()=>{
    const target=pointerTarget||focusTarget,key=pointerPlayer||focusPlayer,job=jobs.find(j=>j.id===target?.dataset.trendJob);
    syncTrendFocus(plots,job,key,people);
    plots.querySelectorAll('.trend-tooltip').forEach(t=>t.style.display='none');
    if(!target||!job)return;
    const plot=target.closest('.trend-plot'),tip=plot.querySelector('.tooltip');
    tip.innerHTML=trendTooltip(job,people,target.dataset.metric,{showQuarter:trendState.showQuarter});tip.style.display='block';
    const a=target.getBoundingClientRect(),b=plot.getBoundingClientRect();
    tip.style.left=Math.max(4,Math.min(a.x-b.x+15,b.width-tip.offsetWidth-4))+'px';tip.style.top='60px';
  };
  plots.querySelectorAll('[data-trend-job]').forEach(el=>{
    el.onpointerenter=el.onpointermove=e=>{pointerTarget=el;pointerPlayer=nearestPlayer(el,e);update()};
    el.onpointerleave=()=>{pointerTarget=null;pointerPlayer=null;update()};
    el.onfocus=()=>{focusTarget=el;focusPlayer=null;update()};
    el.onblur=()=>{focusTarget=null;update()};
    const go=()=>{document.querySelector('#trend-dialog').close();location.hash=el.dataset.trendJob};
    el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}};
  });
  plots.querySelectorAll('[data-line-label]').forEach(el=>{
    el.onpointerenter=()=>{pointerPlayer=el.dataset.lineLabel;update()};
    el.onpointerleave=()=>{pointerPlayer=null;update()};
    el.onfocus=()=>{focusPlayer=el.dataset.lineLabel;update()};
    el.onblur=()=>{focusPlayer=null;update()};
  });
}
function syncTrendFocus(plots,job,key,people){
  plots.querySelectorAll('[data-series-key]').forEach(el=>el.classList.toggle('series-muted',Boolean(key&&el.dataset.seriesKey!==key)));
  plots.querySelectorAll('[data-line-label]').forEach(el=>el.classList.toggle('series-active',el.dataset.lineLabel===key));
  plots.querySelectorAll('.trend-plot').forEach(plot=>{
    const svg=plot.querySelector('svg'),overlay=svg.querySelector('.trend-sync'),note=plot.querySelector('.trend-current');
    overlay.replaceChildren();note.textContent='';
    if(!job)return;
    const hit=[...svg.querySelectorAll('[data-trend-job]')].find(el=>el.dataset.trendJob===job.id);
    if(!hit)return;
    const ns='http://www.w3.org/2000/svg',line=document.createElementNS(ns,'line'),x=hit.dataset.jobX;
    for(const [attr,value] of Object.entries({x1:x,x2:x,y1:18,y2:svg.viewBox.baseVal.height-34,stroke:'#c9d1d5','stroke-width':1,'stroke-dasharray':'4 4'}))line.setAttribute(attr,value);
    overlay.append(line);
    [...svg.querySelectorAll('[data-point-job]')].filter(el=>el.dataset.pointJob===job.id).forEach(point=>{
      const ring=document.createElementNS(ns,'circle');
      for(const attr of ['cx','cy','stroke'])ring.setAttribute(attr,point.getAttribute(attr));
      ring.setAttribute('r','7');ring.setAttribute('fill','none');ring.setAttribute('stroke-width','2');
      if(key&&point.dataset.seriesKey!==key)ring.setAttribute('opacity','.25');overlay.append(ring);
    });
    const metric=plot.dataset.plotMetric,who=people.find(p=>p.key===key)||people.find(p=>p.self),player=job.players.find(p=>p.key===who?.key);
    const value=svg.dataset.trendMode==='share'?SalmonStats.share(job,who?.key,metric):player?.[metric];
    note.textContent=`第 ${job.index} 场 · ${job.interrupted?'掉线，无有效结算':`${who?.name||''} ${fmt(value)}${svg.dataset.trendMode==='share'?(value===null?'':'%'):TREND_METRICS[metric].unit}`}`;
  });
}
// Keep names near their own final point. Crowded names are revealed on focus.
function trendSegmentHitsBox(a,b,box){
  let lo=0,hi=1;
  for(const [start,delta,min,max] of [[a.x,b.x-a.x,box.left-5,box.left+box.width+5],[a.y,b.y-a.y,box.top-5,box.top+27]]){
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;continue}
    const first=(min-start)/delta,last=(max-start)/delta;
    lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));
    if(lo>hi)return false;
  }
  return true;
}
function trendLabelLayout(entries,bounds,segments=[]){
  const placed=[];
  return [...entries].sort((a,b)=>Number(b.p.self)-Number(a.p.self)||b.px-a.px).map(entry=>{
    const {px,py,width}=entry,candidates=[];
    for(const dy of [-11,-37,15,-63,41])for(const dx of [12,-width-12,-width/2]){
      const box={left:Math.max(bounds.left,Math.min(bounds.right-width,px+dx)),top:Math.max(bounds.top,Math.min(bounds.bottom-22,py+dy)),width};
      candidates.push(box);
    }
    const overlaps=box=>placed.some(b=>box.left<b.left+b.width+5&&box.left+width+5>b.left&&box.top<b.top+27&&box.top+27>b.top);
    const box=candidates.find(box=>!overlaps(box)&&!segments.some(([a,b])=>trendSegmentHitsBox(a,b,box)));
    if(box)placed.push(box);
    return {...entry,...(box||candidates[0]),crowded:!box};
  });
}

function largeChart(jobs,people,metric,{interactive=true,showNames=true,mode='quantity',showTotal=false,shareScale='auto',showQuarter=false}={}){
  const W=1100,H=260,L=mode==='share'?56:metric==='power'?64:42,R=160,T=18,B=34;
  const lines=people.map(p=>({...p,metric,segments:SalmonStats.trendSegments(jobs,p.key,metric,mode)}));
  if(mode==='quantity'&&showTotal)lines.push({key:'team-total',name:'团队合计',color:'#a8b0b4',total:true,segments:SalmonStats.valueSegments(jobs,j=>SalmonStats.teamTotal(j,metric))});
  const quarterSegments=showQuarter&&mode==='quantity'?SalmonStats.valueSegments(jobs,j=>{if(j.interrupted)return 0;const total=SalmonStats.teamTotal(j,metric);return total===null?null:total/4}):[];
  const peak=Math.max(0,...lines.flatMap(line=>line.segments.flat().map(p=>p.value)),...quarterSegments.flat().map(p=>p.value));
  const max=mode==='share'?(shareScale==='fixed'?100:([40,60,80,100].find(limit=>limit>=peak+Math.max(5,peak*.1))??100)):metric==='power'?Math.max(500,Math.ceil(peak/500)*500):metric==='deaths'?Math.max(5,Math.ceil(peak/5)*5):Math.max(10,Math.ceil(peak/10)*10);
  const tickStep=mode==='share'?(max<=60?10:20):max/5,tickCount=Math.round(max/tickStep)+1;
  const x=i=>jobs.length===1?(L+W-R)/2:L+i*(W-L-R)/(jobs.length-1),y=v=>H-B-v/max*(H-B-T),step=(W-L-R)/Math.max(1,jobs.length-1);
  const labelEntries=(showNames?lines:[]).flatMap(p=>{
    const end=p.segments.flat().filter(v=>!jobs[v.index].interrupted).at(-1);if(!end)return [];
    const name=p.name+(p.self?' · 我':'');let shortName='',used=0;
    for(const char of name){const size=char.charCodeAt(0)>255?13:7.5;if(used+size>110){shortName+='…';used+=13;break}shortName+=char;used+=size}
    return [{p,end,name,shortName,width:Math.min(136,used+12),px:x(end.index),py:y(end.value)}];
  });
  const obstacles=lines.flatMap(p=>p.segments.flatMap(segment=>segment.map((v,i)=>[{x:x(v.index),y:y(v.value)},{x:x(segment[Math.max(0,i-1)].index),y:y(segment[Math.max(0,i-1)].value)}])));
  const labels=trendLabelLayout(labelEntries,{left:L,right:W-4,top:T,bottom:H-B},obstacles).map(({p,px,py,name,shortName,width,left,top,crowded})=>{
    const anchorX=Math.max(left,Math.min(left+width,px)),anchorY=Math.max(top,Math.min(top+22,py));
    return `<g class="trend-line-label${crowded?' label-crowded':''}" data-line-label="${esc(p.key)}" data-series-key="${esc(p.key)}" ${interactive?`tabindex="0" role="img" aria-label="突出显示 ${esc(name)}"`:''}><title>${esc(name)}</title><path d="M${px},${py} L${anchorX},${anchorY}" stroke="${p.color}" stroke-width="1" opacity=".5"/><rect x="${left}" y="${top}" width="${width}" height="22" rx="4"/><text x="${left+6}" y="${top+15}" fill="${p.color}">${esc(shortName)}</text></g>`;
  }).join('');
  let reference=mode==='share'&&showQuarter?`<g class="trend-quarter" pointer-events="none"><title>25%：四人均分参考，不代表及格线</title><line x1="${L}" x2="${W-R}" y1="${y(25)}" y2="${y(25)}" stroke="#b9c2c8" stroke-width="1.2" stroke-dasharray="8 5"/><text x="${L+6}" y="${y(25)-6}" fill="#c5cdd1" style="font-size:12px;paint-order:stroke;stroke:#202528;stroke-width:3px">25% 均分参考</text></g>`:'';
  if(mode==='quantity'&&showQuarter)reference=`<g class="trend-quarter" pointer-events="none"><title>25%：每场四人合计 ÷ 4，不代表及格线</title>${quarterSegments.map(segment=>`<polyline class="chart-line quarter-line" fill="none" stroke="#b9c2c8" style="stroke-width:1.5" stroke-dasharray="3 4" points="${segment.map(v=>`${x(v.index)},${y(v.value)}`).join(' ')}"/>${segment.length===1?`<circle cx="${x(segment[0].index)}" cy="${y(segment[0].value)}" r="3" fill="#b9c2c8"/>`:''}`).join('')}<text x="${L+6}" y="12" fill="#c5cdd1" style="font-size:12px">25% 均分参考 · 当场合计 ÷ 4</text></g>`;
  const curves=[...lines.filter(p=>p.total),...lines.filter(p=>!p.total)].map(p=>p.segments.map(segment=>`<polyline class="chart-line${p.total?' team-total-line':''}" ${p.total?'data-team-total="true"':`data-player-line="${p.key}" data-series-key="${esc(p.key)}"`} stroke="${p.color}" style="stroke-width:${p.self?3:2}" ${p.total?'stroke-dasharray="7 5"':''} points="${segment.map(v=>`${x(v.index)},${y(v.value)}`).join(' ')}"/>${p.total?(segment.length===1?`<circle class="team-total-point" cx="${x(segment[0].index)}" cy="${y(segment[0].value)}" r="3" fill="${p.color}"/>`:''):segment.filter(v=>!jobs[v.index].interrupted).map(v=>trendMarker(x(v.index),y(v.value),p.color,jobs[v.index].clear,`data-point-job="${jobs[v.index].id}" data-series-key="${esc(p.key)}"`)).join('')}`).join('')).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="group" data-trend-mode="${mode}" data-axis-max="${max}" aria-label="${TREND_METRICS[metric].short}逐场${mode==='share'?'占比':'对比'}"><text x="${L}" y="${H-3}" class="chart-text">场次</text>${Array.from({length:tickCount},(_,i)=>{const v=tickStep*i;return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-text" x="${L-12}" y="${y(v)+4}" text-anchor="end">${fmt(v)}${mode==='share'?'%':''}</text>`}).join('')}${reference}${curves}${jobs.map((j,i)=>`${j.interrupted?SalmonStats.interruptionMarker(x(i),y(0)):''}${interactive?`<rect class="chart-hit" data-trend-job="${j.id}" data-job-x="${x(i)}" data-metric="${metric}" x="${Math.max(L-6,x(i)-step/2)}" y="${T}" width="${Math.min(W-R+6,x(i)+step/2)-Math.max(L-6,x(i)-step/2)}" height="${H-T-B+14}" tabindex="0" role="link" aria-label="${j.interrupted?'查看中断记录，无有效结算数据':'查看第 '+j.index+' 场'+(j.clear?'通过':'未通过')+'的'+TREND_METRICS[metric].short+(mode==='share'?'占比':'数据')+'与详情'}"/>`:""}${jobs.length<36||i%2===0||i===jobs.length-1?`<text class="chart-text" x="${x(i)}" y="${H-15}" text-anchor="middle">${j.index}</text>`:''}`).join('')}${interactive?'<g class="trend-sync" pointer-events="none" aria-hidden="true"></g>':''}${labels}</svg>`;
}

function trendTooltip(job,people,metric,{showQuarter=false}={}){
  if(job.interrupted)return `<strong>对局中断 · ${esc(date(job.time,true))}</strong><p>本场无有效结算数据，不计算占比。</p><small>灰色空心圆表示掉线。点击查看中断记录。</small>`;
  const total=SalmonStats.teamTotal(job,metric),unit=TREND_METRICS[metric].unit;
  const present=people.flatMap(who=>{const player=job.players.find(p=>p.key===who.key);return player?[{...who,player}]:[]});
  const note=total===null?'四人结算数据不完整，占比不可用。':total===0?(metric==='deaths'?'本场全队无人被救援，占比按 0% 展示。':'全队为 0，占比按 0% 展示。'):'';
  return `<strong>第 ${esc(job.index)} 场 · ${job.clear?'通过':'未通过'} · ${esc(date(job.time,true))}</strong><div class="trend-team-summary">四人合计：<b>${fmt(total)} ${unit}</b>${showQuarter&&total!==null?`<small>25% 均分参考：${fmt(total/4)} ${unit}</small>`:''}</div>${present.map(who=>{const p=who.player,share=SalmonStats.share(job,p.key,metric);return `<div class="trend-tip-row"><span><i style="background:${who.color}"></i>${esc(who.name)}</span><b>${fmt(p[metric])} ${unit}<span class="trend-tip-share">占比 ${share===null?'—':fmt(share)+'%'}</span>${metric==='eggs'?`<span class="tip-assist">协助 ${fmt(p.assist)} 颗（不计入占比）</span>`:''}</b></div>`}).join('')}${note?`<small>${note}</small>`:''}<small>点击查看场次详情 ↗</small>`;
}
