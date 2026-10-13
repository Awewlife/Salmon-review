'use strict';
window.SalmonScoreExport=(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  let downloadUrl;
  function svg(jobs,shift){
    const model=window.SalmonGradeChart.model(jobs);
    if(!model.count)throw new Error('本期暂无可导出的分数。');
    const width=1160,plotWidth=1100,top=144;
    const plot=window.SalmonGradeChart.render(jobs,{width:plotWidth,interactive:false});
    const plotHeight=Number(plot.match(/viewBox="0 0 \d+ (\d+)"/)[1]),height=top+plotHeight+116;
    const interrupted=jobs.filter(j=>j.interrupted).length;
    const style=`text{font-family:"Microsoft YaHei","Noto Sans CJK SC","Segoe UI",sans-serif;fill:#eff3ed;font-size:14px}.muted,.chart-text{fill:#a8b0b4}.chart-text{font-size:12px}.chart-grid{stroke:#394044;stroke-dasharray:3 5}.chart-line{fill:none;stroke:#d5ef68;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.score-point{stroke:#d5ef68;stroke-width:1.7;fill:#d5ef68}.score-point.node-failed{fill:#202528}.score-point.node-interrupted{fill:#202528;stroke:#a8b0b4}.score-value-label{fill:#d5ef68;font-size:12px;font-weight:600;paint-order:stroke;stroke:#202528;stroke-width:4px;stroke-linejoin:round}.score-label-leader{stroke:#d5ef68;stroke-opacity:.5;stroke-width:1}.score-annotation.interrupted .score-value-label{fill:#b9c1c5}.score-annotation.interrupted .score-label-leader{stroke:#a8b0b4}.score-rank-band{fill:#d5ef68;fill-opacity:.024}.score-rank-band.alternate{fill-opacity:.051}`;
    const legend=[['node-cleared','通过'],['node-failed','未通过'],['node-interrupted','掉线']].map(([cls,label],i)=>`<circle class="score-point ${cls}" cx="${36+i*150}" cy="${height-76}" r="4"/><text x="${49+i*150}" y="${height-71}">${label}</text>`).join('');
    return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="分数变化图，含通过、未通过、掉线图例"><style>${style}</style><rect width="100%" height="100%" fill="#202528"/><text x="30" y="38" style="font-size:24px;font-weight:700">SALMON REVIEW · 分数变化</text><text x="30" y="68" style="font-size:18px;font-weight:600">${esc(shift.stage.name)}</text><text x="30" y="94" class="muted">排班：${esc(date(shift.start))} — ${esc(date(shift.end))}（UTC+8）</text><text x="30" y="120" class="muted">本期已保存场次 · ${jobs.length-interrupted} 场有效结算 · ${interrupted} 次掉线 · ${model.count} 条有分数记录</text>${plot.replace('<svg ',`<svg x="30" y="${top}" width="${plotWidth}" height="${plotHeight}" `)}${legend}<text x="30" y="${height-44}" class="muted">横轴：本期已记录第 x 场 · 分数：${esc(model.rangeLabel)}（自动缩放）</text><text x="30" y="${height-20}" class="muted">缺场或缺少分数时断线；掉线节点显示已记录的结束分数。数据来源：SplatNet 3。</text></svg>`};
  }
  function controls(jobs){
    const available=window.SalmonGradeChart.model(jobs).count>0;
    return `<div class="score-export-toolbar"><span>点击节点查看场次 →</span><details class="score-export-menu" id="score-export-menu"><summary>导出图片</summary><div class="score-export-options"><button class="button" data-export-score="png" ${available?'':'disabled'}>导出 PNG（推荐）</button><button class="button" data-export-score="svg" ${available?'':'disabled'}>导出 SVG</button>${available?'':'<span>暂无可导出的分数</span>'}</div></details></div><div id="score-export-status" class="score-export-status" role="status" aria-live="polite"></div>`;
  }
  function bind(jobs,shift){
    if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null}
    const status=document.querySelector('#score-export-status'),buttons=[...document.querySelectorAll('[data-export-score]')];
    let busy=false;
    for(const button of buttons)button.onclick=async()=>{
      if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);status.textContent='正在生成分数图片…';
      const format=button.dataset.exportScore;
      try{
        const output=svg(jobs,shift);
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
        if(downloadUrl)URL.revokeObjectURL(downloadUrl);
        downloadUrl=URL.createObjectURL(blob);
        const link=document.createElement('a');link.href=downloadUrl;link.download=`salmon-score-${new Date(shift.start).toISOString().slice(0,10)}.${format}`;link.textContent=`下载刚生成的 ${format.toUpperCase()}`;
        status.replaceChildren(document.createTextNode('已生成分数图片（含图例）。'),link);link.click();
        document.querySelector('#score-export-menu').open=false;
      }catch{if(status.isConnected)status.textContent='图片生成失败，请重试或改用 SVG 格式。'}
      finally{busy=false;buttons.forEach(b=>b.disabled=false)}
    };
  }
  return {svg,controls,bind};
})();
