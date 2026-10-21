'use strict';
window.SalmonRadar=(()=>{
  const dimensions=[{key:'eggs',label:'搬蛋',unit:'颗'},{key:'kills',label:'击杀',unit:'只'},{key:'power',label:'红蛋',unit:'颗'},{key:'rescues',label:'救援',unit:'次'},{key:'deaths',label:'被救援',unit:'次'}];
  const fmt=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:1});
  function model(jobs){
    // Use one complete sample for all axes; interruptions are not statistical zeros.
    const sample=jobs.filter(j=>!j.interrupted&&j.supported!==false&&j.players?.filter(p=>p.me).length===1&&dimensions.every(d=>window.SalmonStats.teamTotal(j,d.key)!==null));
    const rows=dimensions.map(d=>{
      const personalTotal=sample.reduce((sum,j)=>sum+j.players.find(p=>p.me)[d.key],0);
      const teamTotal=sample.reduce((sum,j)=>sum+window.SalmonStats.teamTotal(j,d.key),0);
      const personal=sample.length?personalTotal/sample.length:0,baseline=sample.length?teamTotal/sample.length/4:0;
      const percent=teamTotal?personalTotal/teamTotal*400:0;
      const index=d.key==='deaths'?(baseline===0?100:personal===0?200:Math.min(200,baseline/personal*100)):percent;
      return {...d,personal,baseline,percent,index,capped:d.key==='deaths'&&baseline>0&&(personal===0||baseline/personal*100>200)};
    });
    const max=Math.max(100,...rows.map(d=>d.index));
    return {rows,count:sample.length,excluded:jobs.length-sample.length,max:Math.ceil(max/50)*50};
  }
  function rangeLabel(jobs){
    if(!jobs.length)return '未选择场次';
    const first=Number.isInteger(jobs[0].index)?jobs[0].index:1,last=Number.isInteger(jobs.at(-1).index)?jobs.at(-1).index:jobs.length;
    return jobs.length===1?`本期第 ${first} 场（单场）`:`本期第 ${first}—${last} 场 · 已选 ${jobs.length} 场`;
  }
  function render(jobs,{single=false,compact=false,interactive=true}={}){
    const m=model(jobs);
    if(!m.count)return '<div class="radar-empty">暂无完整的四人结算数据，无法绘制五维图。</div>';
    const width=compact?360:500,height=compact?300:410,cx=width/2,cy=compact?151:208,r=compact?92:140,labelRadius=compact?130:184;
    const point=(i,value)=>{const a=-Math.PI/2+i*Math.PI*2/5;return [cx+Math.cos(a)*r*value/m.max,cy+Math.sin(a)*r*value/m.max]};
    const polygon=value=>m.rows.map((d,i)=>point(i,typeof value==='function'?value(d):value).join(',')).join(' ');
    const rings=Array.from({length:m.max/50},(_,i)=>(i+1)*50);
    const label=m.rows.map((d,i)=>{const a=-Math.PI/2+i*Math.PI*2/5,x=cx+Math.cos(a)*labelRadius,y=cy+Math.sin(a)*labelRadius;return `<text x="${x}" y="${y}" text-anchor="middle" class="radar-label">${d.key==='deaths'?'生存':d.label}<tspan x="${x}" dy="19" class="radar-percent">${fmt(d.index)}%</tspan></text>`}).join('');
    const helpX=cx+Math.cos(-Math.PI/2+4*Math.PI*2/5)*labelRadius+25,helpY=cy+Math.sin(-Math.PI/2+4*Math.PI*2/5)*labelRadius-11;
    const help=interactive?`<div class="radar-help" style="left:${helpX/width*100}%;top:${helpY/height*100}%"><button type="button" class="radar-help-button" aria-label="生存指数计算说明" aria-describedby="radar-survival-tip">?</button><div id="radar-survival-tip" class="radar-help-tip" role="tooltip"><strong>被救援越少，生存指数越高</strong><p>指数 =（全队被救援场均 ÷ 4）÷ 个人被救援场均 × 100%，最高 200%。</p><p>全队为 0：100%；否则个人为 0：200%。</p></div></div>`:'';
    return `<div class="radar-layout ${compact?'radar-compact':''}"><div class="radar-plot"><svg class="radar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="本期五维图：${m.rows.map(d=>(d.key==='deaths'?'生存':d.label)+' '+fmt(d.index)+'%').join('，')}"><title>个人场均相对全队四分之一基准；生存由被救援次数反向计算</title>${rings.map(v=>`<polygon points="${polygon(v)}" class="radar-grid"/>`).join('')}${m.rows.map((d,i)=>`<line x1="${cx}" y1="${cy}" x2="${point(i,m.max)[0]}" y2="${point(i,m.max)[1]}" class="radar-grid"/>`).join('')}<polygon points="${polygon(d=>d.index)}" class="radar-personal"/><polygon points="${polygon(100)}" class="radar-baseline"/>${rings.map(v=>`<text x="${cx+6}" y="${cy-r*v/m.max-4}" class="radar-tick">${v}%</text>`).join('')}${m.rows.map((d,i)=>`<circle cx="${point(i,d.index)[0]}" cy="${point(i,d.index)[1]}" r="4" class="radar-node"><title>${d.label}：个人场均 ${fmt(d.personal)} ${d.unit}，全队 25% 场均 ${fmt(d.baseline)} ${d.unit}</title></circle>`).join('')}${label}</svg>${help}</div><div class="radar-data"><div class="radar-legend"><span><i class="radar-key personal"></i>个人图示指数</span><span><i class="radar-key baseline"></i>全队 25% · 100% 基准</span></div>${compact?'<details class="radar-values"><summary>查看数值与口径</summary>':''}<div class="radar-table-scroll"><table><caption class="sr-only">本期五项场均与全队四分之一场均对比</caption><thead><tr><th>项目</th><th>${single?'本场个人':'个人场均'}</th><th>${single?'本场全队 25%':'全队 25% 场均'}</th><th>图示指数</th></tr></thead><tbody>${m.rows.map(d=>`<tr><th scope="row">${d.label}<small>${d.unit}</small></th><td>${fmt(d.personal)}</td><td>${fmt(d.baseline)}</td><td>${fmt(d.index)}%${d.capped?'（封顶）':''}</td></tr>`).join('')}</tbody></table></div><p class="radar-note">${rangeLabel(jobs)}；统计 ${m.count} 场有效结算${m.excluded?`；另有 ${m.excluded} 场未计入`:''}，包含通过与失败场次。</p><p class="radar-note">100% 基准为全队场均总量 ÷ 4。前四项：个人场均 ÷ 基准；全队该项为 0 时显示 0%。击杀指巨大鲑鱼，搬蛋不含协助。</p><p class="radar-note">生存指数由被救援次数反向计算，次数越低越好：指数 = 基准 ÷ 个人场均，最高 200%；个人为 0 且全队非零时显示 200%，全队为 0 时显示 100%。图形面积不代表综合评分。</p>${compact?'</details>':''}</div></div>`;
  }
  return {model,render,rangeLabel};
})();
