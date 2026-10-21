'use strict';
window.SalmonRadarExport=(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:1});
  const date=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  let downloadUrl;
  function svg(jobs,shift,player='',options={}){const result=sourceSvg(jobs,shift,player,options);if(window.SalmonI18n)result.svg=window.SalmonI18n.svg(result.svg,{rasterize:options.rasterize===true});return result;}
  function sourceSvg(jobs,shift,player='',{single=false}={}){
    const m=window.SalmonRadar.model(jobs);
    if(!m.count)throw new Error('本期暂无完整的四人结算数据。');
    const width=900,height=1100;
    // Reuse the on-screen plot so normalization, reversal and scale stay identical.
    const plot=window.SalmonRadar.render(jobs,{single,interactive:false}).match(/<svg\b[\s\S]*?<\/svg>/)[0];
    const style=`text{font-family:"Microsoft YaHei","Noto Sans CJK SC","Segoe UI",sans-serif;fill:#eff3ed;font-size:15px}.muted{fill:#a8b0b4}.radar-grid{fill:none;stroke:#394044;stroke-width:1}.radar-baseline{fill:none;stroke:#a8b0b4;stroke-width:2;stroke-dasharray:6 5}.radar-personal{fill:#d5ef68;fill-opacity:.15;stroke:#d5ef68;stroke-width:2.5}.radar-node{fill:#d5ef68;stroke:#202528;stroke-width:1.5}.radar-label{font-size:14px}.radar-percent{fill:#d5ef68;font-size:13px;font-weight:600}.radar-tick{fill:#a8b0b4;font-size:11px;paint-order:stroke;stroke:#202528;stroke-width:3px}`;
    const rowY=i=>754+i*40;
    const rows=m.rows.map((d,i)=>`<line x1="40" x2="860" y1="${rowY(i)+14}" y2="${rowY(i)+14}" stroke="#394044"/><text x="52" y="${rowY(i)}">${d.label} · ${d.unit}</text><text x="400" y="${rowY(i)}" text-anchor="end">${fmt(d.personal)}</text><text x="635" y="${rowY(i)}" text-anchor="end">${fmt(d.baseline)}</text><text x="848" y="${rowY(i)}" text-anchor="end" style="fill:#d5ef68">${fmt(d.index)}%${d.capped?'（封顶）':''}</text>`).join('');
    return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style><rect width="100%" height="100%" fill="#202528"/><text x="40" y="42" style="font-size:25px;font-weight:700">SALMON REVIEW · ${single?'单场':'本期'}五维图</text><text x="40" y="76" style="font-size:18px">${esc(shift.stage.name)}</text><text x="40" y="104" class="muted">排班：${esc(date(shift.start))} — ${esc(date(shift.end))}（UTC+8）</text><text translate="no" x="40" y="132" class="muted" ${player.length>36?'textLength="820" lengthAdjust="spacingAndGlyphs"':''}>${esc(player)}</text>${plot.replace('<svg ', '<svg x="150" y="150" width="600" height="492" ')}<line x1="190" x2="222" y1="666" y2="666" stroke="#d5ef68" stroke-width="3"/><text x="232" y="672">个人图示指数</text><line x1="440" x2="472" y1="666" y2="666" stroke="#a8b0b4" stroke-width="2" stroke-dasharray="6 5"/><text x="482" y="672">全队 25% · 100% 基准</text><rect x="40" y="695" width="820" height="34" fill="#292f33"/><text x="52" y="718" class="muted">项目</text><text x="400" y="718" text-anchor="end" class="muted">${single?'本场个人':'个人场均'}</text><text x="635" y="718" text-anchor="end" class="muted">${single?'本场全队 25%':'全队 25% 场均'}</text><text x="848" y="718" text-anchor="end" class="muted">图示指数</text>${rows}<text x="40" y="960" class="muted">${esc(window.SalmonRadar.rangeLabel(jobs))} · 统计 ${m.count} 场 · ${m.excluded} 场未计入</text><text x="40" y="988" class="muted">基准 = 全队场均总量 ÷ 4；前四项 = 个人场均 ÷ 基准 × 100%，全队为零时显示 0%。</text><text x="40" y="1014" class="muted">生存指数 = 被救援基准 ÷ 个人被救援场均 × 100%，最高 200%；被救援越少，指数越高。</text><text x="40" y="1040" class="muted">个人为零且全队非零：200%；全队为零：100%。实际场均不受封顶影响。</text><text x="40" y="1074" class="muted">击杀指巨大鲑鱼，搬蛋不含协助。生存不是存活率；图形面积不代表综合评分。来源：SplatNet 3。</text></svg>`};
  }
  function controls(jobs){
    const available=window.SalmonRadar.model(jobs).count>0;
    return `<div class="radar-export-toolbar"><details class="score-export-menu" id="radar-export-menu"><summary>导出图片</summary><div class="score-export-options"><button class="button" data-export-radar="png" ${available?'':'disabled'}>导出 PNG（推荐）</button><button class="button" data-export-radar="svg" ${available?'':'disabled'}>导出 SVG</button><span class="inkling-png-note">鱿鱼语仅支持 PNG，避免导出字体文件。</span></div></details><div id="radar-export-status" class="score-export-status" role="status" aria-live="polite"></div></div>`;
  }
  function bind(jobs,shift,player,options={}){
    if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null}
    const status=document.querySelector('#radar-export-status'),buttons=[...document.querySelectorAll('[data-export-radar]')];
    let busy=false;
    for(const button of buttons)button.onclick=async()=>{
      if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);status.textContent='正在生成五维图片…';
      const format=button.dataset.exportRadar;
      try{
        await window.SalmonI18n?.prepareExport(format);
        const output=svg(jobs,shift,player,{...options,rasterize:format==='png'});
        let blob=new Blob([output.svg],{type:'image/svg+xml;charset=utf-8'});
        if(format==='png'){
          await document.fonts?.ready;
          const picture=new Image();
          await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=()=>reject(new Error('render'));picture.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(output.svg)});
          const canvas=document.createElement('canvas');canvas.width=output.width*2;canvas.height=output.height*2;
          const context=canvas.getContext('2d');if(!context)throw new Error('canvas');
          context.drawImage(picture,0,0,canvas.width,canvas.height);
          blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('encode');
        }
        // A shift change or navigation must not download an obsolete chart.
        if(!status.isConnected)return;
        window.SalmonI18n?.assertExport(format);
        if(downloadUrl)URL.revokeObjectURL(downloadUrl);
        downloadUrl=URL.createObjectURL(blob);
        const link=document.createElement('a');link.href=downloadUrl;link.download=`salmon-radar-${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(shift.start))}-matches-${jobs[0].index??1}-${jobs.at(-1).index??jobs.length}.${format}`;link.textContent=`下载刚生成的 ${format.toUpperCase()}`;
        status.replaceChildren(document.createTextNode('已生成五维图片（含图例和场均数据表）。'),link);link.click();
        document.querySelector('#radar-export-menu').open=false;
      }catch{if(status.isConnected)status.textContent=window.SalmonI18n?.get()==='inkling'?'图片生成失败，请重试。':'图片生成失败，请重试或改用 SVG 格式。'}
      finally{busy=false;buttons.forEach(b=>b.disabled=false)}
    };
  }
  return {svg,controls,bind};
})();
