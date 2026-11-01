'use strict';
window.SalmonRadarCompare=(()=>{
  const radar=()=>window.SalmonRadar;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:1});
  const note='全部历史包含最近场次；差值反映队内分担变化，不代表能力提升或下降。';
  const sameNote='近期样本与全部历史相同，不能据此判断表现是否稳定。';
  const capNote='生存指数最高 200%；达到上限时，请结合实际被救援场均判断。';
  const previousNote='两组有效场次互不重叠；差值反映队内分担变化，不代表能力提升或下降。';
  const previousEmpty='尚无更早的有效场次，暂时无法与前 100 场对比。';
  function model(jobs,{period='history'}={}){
    const valid=radar().validJobs(jobs).slice().sort((a,b)=>(Date.parse(a.time)||0)-(Date.parse(b.time)||0)||String(a.id??'').localeCompare(String(b.id??'')));
    period=period==='previous'?'previous':'history';
    const recentJobs=valid.slice(-100),allJobs=period==='previous'?valid.slice(Math.max(0,valid.length-200),Math.max(0,valid.length-100)):valid;
    // `all` is the comparison baseline: either all history or the preceding block.
    const all=radar().model(period==='previous'?allJobs:jobs),recent=radar().model(recentJobs);
    const rows=recent.rows.map((r,i)=>({recent:r,all:all.rows[i],delta:Math.round((r.index-all.rows[i].index)*10)/10,bothAtCap:r.key==='deaths'&&r.index===200&&all.rows[i].index===200}));
    return {all,recent,recentJobs,allJobs,period,rows,max:Math.max(all.max,recent.max),same:period==='history'&&valid.length<=100,ready:all.count>0&&recent.count>0};
  }
  const recentLabel=c=>`最近 ${c.recent.count} 场`;
  const baselineLabel=c=>c.period==='previous'?`前 ${c.all.count} 场`:'全部历史';
  const comparisonNote=c=>c.period==='previous'?previousNote:note;
  const partialNote=c=>c.period==='previous'&&c.all.count<100?`前段仅有 ${c.all.count} 场有效结算，按实际场数比较。`:'';
  function delta(row){return row.bothAtCap?'均已封顶':`${row.delta>0?'↑ ':row.delta<0?'↓ ':''}${fmt(Math.abs(row.delta))} 个百分点`;}
  function range(jobs){return radar().historyRange(jobs).replace(/^本地记录 · /,'');}
  function coverage(c){return [
    `${recentLabel(c)} · ${range(c.recentJobs)}`,
    `${baselineLabel(c)} · ${c.all.count} 场有效结算 · ${range(c.allJobs)}`,
  ];}
  function legend(c){return `<div class="radar-legend"><span><i class="radar-key personal"></i>${recentLabel(c)}</span><span><i class="radar-key historical"></i>${baselineLabel(c)}</span><span><i class="radar-key reference"></i>100% 均分基准</span></div>`;}
  function plot(c){
    const point=(i,value)=>{const a=-Math.PI/2+i*Math.PI*2/5;return [250+Math.cos(a)*140*value/c.max,208+Math.sin(a)*140*value/c.max]};
    const polygon=values=>c.rows.map((row,i)=>point(i,typeof values==='number'?values:values[i].index).join(',')).join(' ');
    const rings=Array.from({length:c.max/50},(_,i)=>(i+1)*50);
    return `<svg class="radar-chart radar-comparison-chart" viewBox="0 0 500 410" role="img" aria-label="${c.period==='previous'?'最近场次与前段场次五维对比':'最近场次与全部历史五维对比'}"><title>两组数据共用刻度；绿色实线为近期，紫色虚线为对照。</title>${rings.map(v=>`<polygon points="${polygon(v)}" class="radar-grid${v===100?' radar-reference':''}"/>`).join('')}${c.rows.map((_,i)=>`<line x1="250" y1="208" x2="${point(i,c.max)[0]}" y2="${point(i,c.max)[1]}" class="radar-grid"/>`).join('')}<polygon points="${polygon(c.recent.rows)}" class="radar-personal"/><polygon points="${polygon(c.all.rows)}" class="radar-historical"/>${rings.map(v=>`<text x="256" y="${208-140*v/c.max-4}" class="radar-tick">${v}%</text>`).join('')}${c.rows.map((row,i)=>`<circle cx="${point(i,row.all.index)[0]}" cy="${point(i,row.all.index)[1]}" r="3" class="radar-history-node"/><circle cx="${point(i,row.recent.index)[0]}" cy="${point(i,row.recent.index)[1]}" r="4" class="radar-node"/>`).join('')}${c.rows.map((row,i)=>{const a=-Math.PI/2+i*Math.PI*2/5,x=250+Math.cos(a)*184,y=208+Math.sin(a)*184;return `<text x="${x}" y="${y}" text-anchor="middle" class="radar-label">${row.recent.key==='deaths'?'生存':row.recent.label}</text>`}).join('')}</svg>`;
  }
  function table(c,type){
    const averages=type==='averages';
    const columns=averages?`<tr><th rowspan="2">项目</th><th colspan="2">${recentLabel(c)}</th><th colspan="2">${baselineLabel(c)}</th></tr><tr><th>个人场均</th><th>全队 25% 场均</th><th>个人场均</th><th>全队 25% 场均</th></tr>`:`<tr><th>项目</th><th>${recentLabel(c)}</th><th>${baselineLabel(c)}</th><th>差值</th></tr>`;
    return `<div class="radar-table-scroll"><table class="radar-comparison-table"><caption class="sr-only">${averages?'两组场均对比':'两组指数对比'}</caption><thead>${columns}</thead><tbody>${c.rows.map(row=>`<tr><th scope="row">${!averages&&row.recent.key==='deaths'?'生存':row.recent.label}${averages?`<small>${row.recent.unit}</small>`:''}</th>${averages?`<td>${fmt(row.recent.personal)}</td><td>${fmt(row.recent.baseline)}</td><td>${fmt(row.all.personal)}</td><td>${fmt(row.all.baseline)}</td>`:`<td>${fmt(row.recent.index)}%${row.recent.capped?'（封顶）':''}</td><td>${fmt(row.all.index)}%${row.all.capped?'（封顶）':''}</td><td>${delta(row)}</td>`}</tr>`).join('')}</tbody></table></div>`;
  }
  function render(jobs,{table:tableType='index',period='history'}={}){
    const c=model(jobs,{period});if(!c.recent.count)return '<div class="radar-empty">暂无完整的四人结算数据，无法绘制五维图。</div>';
    if(!c.ready)return `<div class="radar-comparison-coverage"><p>${esc(coverage(c)[0])}</p></div><div class="radar-empty">${previousEmpty}</div>`;
    return `<div class="radar-comparison-coverage">${coverage(c).map(t=>`<p>${esc(t)}</p>`).join('')}<p>${esc(radar().historySummary(jobs))}</p>${c.same?`<p>${sameNote}</p>`:''}${partialNote(c)?`<p>${partialNote(c)}</p>`:''}</div><div class="radar-layout radar-comparison"><div class="radar-plot">${plot(c)}</div><div class="radar-data">${legend(c)}<div class="radar-table-mode" role="group" aria-label="对比表显示方式"><button class="button" data-compare-table="index" aria-pressed="${tableType==='index'}">指数</button><button class="button" data-compare-table="averages" aria-pressed="${tableType==='averages'}">场均数据</button></div>${table(c,tableType)}<p class="radar-note">${capNote}</p><details class="radar-method"><summary>计算说明</summary><p class="radar-note">最近 100 场指最近的有效结算，包含通过和失败；掉线及数据不完整的场次不计入。</p>${c.period==='previous'?'<p class="radar-note">前 100 场指紧邻最近 100 场之前的有效结算，最多取 100 场，不足时使用实际场数。</p>':''}<p class="radar-note">100% 基准为全队场均总量 ÷ 4。前四项：个人场均 ÷ 基准；全队该项为 0 时显示 0%。击杀指巨大鲑鱼，搬蛋不含协助。</p><p class="radar-note">生存指数由被救援次数反向计算，次数越低越好：指数 = 基准 ÷ 个人场均，最高 200%；个人为 0 且全队非零时显示 200%，全队为 0 时显示 100%。图形面积不代表综合评分。</p></details></div></div><p class="radar-note">${comparisonNote(c)}</p>`;
  }
  function sourceSvg(jobs,player='',{table:tableType='index',period='history'}={}){
    const c=model(jobs,{period});if(!c.ready)throw new Error('暂无完整的四人结算数据，无法绘制五维图。');
    const averages=tableType==='averages',width=1000,height=1230;
    const text=(x,y,value,extra='')=>`<text x="${x}" y="${y}" ${extra}>${esc(value)}</text>`;
    const cells=averages?[440,600,780,950]:[480,710,950];
    const rowValues=row=>averages?[fmt(row.recent.personal),fmt(row.recent.baseline),fmt(row.all.personal),fmt(row.all.baseline)]:[fmt(row.recent.index)+'%'+(row.recent.capped?'（封顶）':''),fmt(row.all.index)+'%'+(row.all.capped?'（封顶）':''),delta(row)];
    const header=averages?text(520,748,recentLabel(c),'text-anchor="middle"')+text(865,748,baselineLabel(c),'text-anchor="middle"')+["个人场均","全队 25% 场均","个人场均","全队 25% 场均"].map((h,i)=>text(cells[i],778,h,'text-anchor="end"')).join(''):[recentLabel(c),baselineLabel(c),'差值'].map((h,i)=>text(cells[i],770,h,'text-anchor="end"')).join('');
    const style='text{font-family:"Microsoft YaHei","Noto Sans CJK SC","Segoe UI",sans-serif;fill:#eff3ed;font-size:15px}.muted{fill:#a8b0b4}.radar-grid{fill:none;stroke:#394044;stroke-width:1}.radar-reference{stroke:#7a8388}.radar-personal{fill:#d5ef68;fill-opacity:.15;stroke:#d5ef68;stroke-width:2.5}.radar-historical{fill:none;stroke:#b99aff;stroke-width:2;stroke-dasharray:6 5}.radar-node{fill:#d5ef68;stroke:#202528;stroke-width:1.5}.radar-history-node{fill:#202528;stroke:#b99aff;stroke-width:1.5}.radar-label{font-size:14px}.radar-tick{fill:#a8b0b4;font-size:11px;paint-order:stroke;stroke:#202528;stroke-width:3px}';
    return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style><rect width="100%" height="100%" fill="#202528"/>${text(40,42,'SALMON REVIEW · 近期对比','style="font-size:25px;font-weight:700"')}${text(40,75,player,'translate="no"'+(player.length>50?' textLength="900" lengthAdjust="spacingAndGlyphs"':''))}${coverage(c).map((t,i)=>text(40,108+i*28,t,'class="muted"')).join('')}${text(40,164,'本地记录 · '+radar().historySummary(jobs),'class="muted"')}${plot(c).replace('<svg ','<svg x="200" y="180" width="600" height="492" ')}<line x1="120" x2="150" y1="701" y2="701" stroke="#d5ef68" stroke-width="3"/>${text(160,706,recentLabel(c))}<line x1="410" x2="440" y1="701" y2="701" stroke="#b99aff" stroke-width="2" stroke-dasharray="6 5"/>${text(450,706,baselineLabel(c))}<line x1="680" x2="710" y1="701" y2="701" stroke="#7a8388"/>${text(720,706,'100% 均分基准')}<rect x="40" y="730" width="920" height="60" fill="#292f33"/>${text(52,770,'项目')}${header}${c.rows.map((row,i)=>{const y=825+i*40;return `<line x1="40" x2="960" y1="${y+14}" y2="${y+14}" stroke="#394044"/>`+text(52,y,!averages&&row.recent.key==='deaths'?'生存':row.recent.label+(averages?' · '+row.recent.unit:''))+rowValues(row).map((v,n)=>text(cells[n],y,v,'text-anchor="end"')).join('')}).join('')}${text(40,1032,c.same?sameNote:comparisonNote(c),'class="muted"')}${text(40,1065,capNote,'class="muted"')}${text(40,1098,partialNote(c)||'根据本地保存的战绩统计，不代表官方完整生涯。','class="muted"')}${text(40,1131,'基准 = 全队场均总量 ÷ 4；前四项 = 个人场均 ÷ 基准 × 100%，全队为零时显示 0%。','class="muted"')}${text(40,1164,'生存指数 = 被救援基准 ÷ 个人被救援场均 × 100%，最高 200%；被救援越少，指数越高。','class="muted"')}${text(40,1197,'个人为零且全队非零：200%；全队为零：100%。实际场均不受封顶影响。','class="muted"')}</svg>`};
  }
  function mount(root,jobs,player,{table:initial='index',period:initialPeriod='history',onTableChange=()=>{},onPeriodChange=()=>{}}={}){
    let tableType=initial,period=initialPeriod;
    function update(){
      root.innerHTML=`<div class="comparison-period" role="group" aria-label="对照范围"><button class="button" data-compare-period="history" aria-pressed="${period==='history'}">对比全部历史</button><button class="button" data-compare-period="previous" aria-pressed="${period==='previous'}">对比前 100 场</button></div>`+render(jobs,{table:tableType,period})+window.SalmonRadarExport.controls(jobs,{id:'career-radar',available:model(jobs,{period}).ready});
      window.SalmonRadarExport.bind(jobs,null,player,{history:true,comparison:true,table:tableType,period,root});
      root.querySelectorAll('[data-compare-period]').forEach(button=>button.onclick=()=>{
        period=button.dataset.comparePeriod;onPeriodChange(period);update();root.querySelector(`[data-compare-period="${period}"]`).focus();
      });
      root.querySelectorAll('[data-compare-table]').forEach(button=>button.onclick=()=>{
        tableType=button.dataset.compareTable;onTableChange(tableType);update();root.querySelector(`[data-compare-table="${tableType}"]`).focus();
      });
    }
    update();
  }
  return {model,render,sourceSvg,mount,delta};
})();
