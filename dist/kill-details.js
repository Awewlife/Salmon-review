'use strict';
window.SalmonKillDetails=(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:1}):'—';
  const count=value=>Number.isSafeInteger(value)&&value>=0;
  const localImage=value=>typeof value==='string'&&/^\/assets\/[a-f0-9]{64}$/.test(value)?value:'';
  const ratio=(kills,appeared)=>appeared>0?kills/appeared*100:null;
  function calculate(jobs,from=0,to=jobs.length-1){
    const selected=jobs.slice(from,to+1),types=new Map();
    let kills=0,appeared=0,detailKills=0,included=0,interrupted=0,incomplete=0;
    for(const job of selected){
      if(job.interrupted){interrupted++;continue}
      const me=job.players?.find(p=>p.me),bosses=job.bosses;
      // Both totals must use the same complete match sample; missing counts are not zeros.
      if(job.supported===false||!count(me?.kills)||!Array.isArray(bosses)||!bosses.every(b=>count(b.me)&&count(b.appeared))||(!bosses.length&&me.kills!==0)){
        incomplete++;continue;
      }
      included++;kills+=me.kills;
      for(const boss of bosses){
        appeared+=boss.appeared;detailKills+=boss.me;
        const key=boss.name,row=types.get(key)??{name:boss.name,kills:0,appeared:0};
        if(!row.image&&localImage(boss.image))row.image=localImage(boss.image);
        row.kills+=boss.me;row.appeared+=boss.appeared;types.set(key,row);
      }
    }
    return {selected:selected.length,included,interrupted,incomplete,kills,appeared,detailKills,percent:ratio(kills,appeared),
      rows:[...types.values()].sort((a,b)=>b.appeared-a.appeared||String(a.name).localeCompare(String(b.name),'zh-CN')).map(row=>({...row,percent:ratio(row.kills,row.appeared)}))};
  }
  const percent=value=>value===null?'—':fmt(value)+'%';
  const date=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  async function loadImages(rows){
    const images=new Map();
    await Promise.all([...new Set(rows.map(row=>localImage(row.image)).filter(Boolean))].map(async source=>{
      try{
        const response=await fetch(source,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('image');
        const blob=await response.blob();
        if(!/^image\/(png|jpeg|webp)$/.test(blob.type)||blob.size>2*1024*1024)throw new Error('image_type');
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
        images.set(source,data);
      }catch{/* Keep the named row available when an image cannot be loaded. */}
    }));
    return images;
  }
  function svg(jobs,shift,from=0,to=jobs.length-1,images=new Map()){
    const result=calculate(jobs,from,to),selected=jobs.slice(from,to+1);
    if(!result.included)throw new Error('no_results');
    const width=960,tableTop=300,rowHeight=52,footer=tableTop+42+result.rows.length*rowHeight;
    const notes=[
      '占比 = 所选场次个人击杀合计 ÷ 同一批场次的出现总数。',
      '出现总数来自巨大鲑鱼明细（含金鲑鱼等特殊敌人），不含普通小怪和头目。',
      '出现总数为 0 时显示“—”；仅统计本地已保存记录。数据来源：SplatNet 3。',
      ...(result.kills!==result.detailKills?[`个人结算合计 ${fmt(result.kills)}，分类明细合计 ${fmt(result.detailKills)}；原始记录有差异，分别展示。`]:[])
    ];
    const height=footer+notes.length*26+52;
    const text=(x,y,value,extra='')=>`<text x="${x}" y="${y}" ${extra}>${esc(value)}</text>`;
    const rows=result.rows.map((row,i)=>{
      const y=tableTop+42+i*rowHeight;
      const data=images.get(row.image),icon=typeof data==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)?`<image href="${data}" x="44" y="${y+6}" width="40" height="40"/>`:'';
      return `<line x1="32" x2="928" y1="${y+rowHeight}" y2="${y+rowHeight}" stroke="#394044"/>${icon}${text(96,y+32,row.name)}${text(520,y+32,fmt(row.kills),'text-anchor="end" fill="#ff7957"')}${text(720,y+32,fmt(row.appeared),'text-anchor="end"')}${text(912,y+32,percent(row.percent),'text-anchor="end"')}`;
    }).join('');
    const player=selected.find(j=>j.players?.some(p=>p.me))?.players.find(p=>p.me)?.name??'';
    return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="击杀详情"><style>text{font-family:"Microsoft YaHei","Noto Sans CJK SC","Segoe UI",sans-serif}.muted{fill:#a8b0b4;font-size:15px}</style><rect width="100%" height="100%" fill="#202528"/><g fill="#eff3ed" font-size="17">
      ${text(32,46,'SALMON REVIEW · 击杀详情','font-size="27" font-weight="700"')}
      ${text(32,82,shift.stage.name+' · '+player,'font-weight="600"')}
      ${text(32,112,`排班：${date(shift.start)} — ${date(shift.end)}（UTC+8）`,'class="muted"')}
      ${text(32,140,`本期第 ${selected[0].index}—${selected.at(-1).index} 场 · 已选 ${result.selected} 场 · 统计 ${result.included} 场 · 排除 ${result.interrupted} 场掉线 / ${result.incomplete} 场数据不全`,'class="muted"')}
      <rect x="32" y="164" width="896" height="108" rx="12" fill="#192023"/>
      ${text(52,194,'个人击杀 / 出现总数','class="muted"')}${text(52,244,`${fmt(result.kills)} / ${fmt(result.appeared)} 只`,'font-size="34" font-weight="700"')}
      ${text(900,194,'击杀占比','class="muted" text-anchor="end"')}${text(900,244,percent(result.percent),'text-anchor="end" font-size="34" font-weight="700" fill="#d5ef68"')}
      <rect x="32" y="${tableTop}" width="896" height="42" fill="#292f33"/>
      ${text(48,tableTop+28,'怪物')}${text(520,tableTop+28,'个人击杀','text-anchor="end"')}${text(720,tableTop+28,'出现总数','text-anchor="end"')}${text(912,tableTop+28,'占比','text-anchor="end"')}${rows}
      ${notes.map((note,i)=>text(32,footer+34+i*26,note,'class="muted"')).join('')}</g></svg>`};
  }
  function render(result){
    return `<div class="kill-detail-summary" role="status" aria-live="polite"><div><span>个人击杀 / 出现总数</span><strong>${result.included?fmt(result.kills)+' <small>/</small> '+fmt(result.appeared):'—'}<em>只</em></strong></div><div><span>击杀占比</span><strong class="kill-detail-percent">${percent(result.percent)}</strong></div></div>
      <p class="kill-detail-coverage">已选 ${result.selected} 场 · 统计 ${result.included} 场${result.interrupted?' · 排除 '+result.interrupted+' 场掉线':''}${result.incomplete?' · 排除 '+result.incomplete+' 场数据不全':''}</p>
      ${!result.included?'<p class="kill-detail-empty">所选范围没有可统计的结算记录。</p>':`<div class="kill-detail-table"><table><thead><tr><th>怪物</th><th>个人击杀</th><th>出现总数</th><th>占比</th></tr></thead><tbody>${result.rows.map(row=>`<tr><td><span class="kill-boss-name"><span class="kill-boss-icon">${localImage(row.image)?`<img src="${esc(row.image)}" alt="" width="36" height="36">`:""}</span>${esc(row.name)}</span></td><td>${fmt(row.kills)}</td><td>${fmt(row.appeared)}</td><td>${percent(row.percent)}</td></tr>`).join('')}</tbody></table></div>`}
      <p class="kill-detail-note">占比 = 所选场次个人击杀合计 ÷ 同一批场次的出现总数。出现总数来自巨大鲑鱼明细（含金鲑鱼等特殊敌人），不含普通小怪和头目；出现总数为 0 时显示“—”。仅统计本地已保存记录。</p>
      ${result.kills!==result.detailKills?'<p class="kill-detail-note">个人结算击杀合计为 '+fmt(result.kills)+'，各类怪物明细合计为 '+fmt(result.detailKills)+'；原始记录存在差异，分别展示，不作修正。</p>':''}`;
  }
  function open(jobs,shift){
    const dialog=document.querySelector('#kill-details-dialog');
    if(dialog.open)dialog.close();
    let from=0,to=jobs.length-1,revision=0,busy=false,downloadUrl;
    const options=selected=>jobs.map((job,i)=>`<option value="${i}" ${selected===i?'selected':''}>第 ${job.index} 场${job.interrupted?' · 掉线':''}</option>`).join('');
    dialog.innerHTML=`<header class="trend-header"><div><h2 id="kill-details-title">本期击杀详情</h2><p class="subtext">${esc(shift.stage.name)} · 个人击杀 / 巨大鲑鱼出现总数</p></div><button class="close-chat" data-kill-close aria-label="关闭击杀详情" autofocus>×</button></header>
      <div class="kill-detail-body"><div class="kill-detail-range" role="group" aria-label="击杀统计场次范围"><label>起始场次 <select id="kill-detail-from" ${jobs.length?'':'disabled'}>${options(from)}</select></label><span>—</span><label>结束场次 <select id="kill-detail-to" ${jobs.length?'':'disabled'}>${options(to)}</select></label><button class="button" data-kill-reset ${jobs.length?'':'disabled'}>全部场次</button><button class="button kill-export-button" data-kill-export>导出图片</button></div><p class="kill-export-status" data-kill-export-status role="status" aria-live="polite"></p><div data-kill-results></div></div>`;
    const start=dialog.querySelector('#kill-detail-from'),end=dialog.querySelector('#kill-detail-to');
    const exportButton=dialog.querySelector('[data-kill-export]'),status=dialog.querySelector('[data-kill-export-status]');
    const clearDownload=()=>{if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null}status.replaceChildren()};
    const refresh=()=>{revision++;clearDownload();start.value=String(from);end.value=String(to);const result=calculate(jobs,from,to);dialog.querySelector('[data-kill-results]').innerHTML=render(result);dialog.querySelectorAll('.kill-boss-icon img').forEach(img=>img.onerror=()=>{img.hidden=true});exportButton.disabled=busy||!result.included};
    exportButton.onclick=async()=>{
      if(busy)return;
      busy=true;exportButton.disabled=true;status.textContent='正在生成图片…';
      const current=revision,exportFrom=from,exportTo=to,first=jobs[from]?.index,last=jobs[to]?.index;
      try{
        const rows=calculate(jobs,exportFrom,exportTo).rows,images=await loadImages(rows);
        if(!dialog.open||!status.isConnected||current!==revision)return;
        const missingImages=rows.some(row=>row.image&&!images.has(row.image));
        const output=svg(jobs,shift,exportFrom,exportTo,images);
        await document.fonts?.ready;
        const picture=new Image();
        await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=()=>reject(new Error('render'));picture.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(output.svg)});
        const canvas=document.createElement('canvas');canvas.width=output.width*2;canvas.height=output.height*2;
        const context=canvas.getContext('2d');if(!context)throw new Error('canvas');
        context.drawImage(picture,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('encode');
        if(!dialog.open||!status.isConnected||current!==revision)return;
        clearDownload();downloadUrl=URL.createObjectURL(blob);
        const link=document.createElement('a');link.href=downloadUrl;link.download=`salmon-kills-${new Date(shift.start).toISOString().slice(0,10)}-${first}-${last}.png`;link.textContent='下载图片';
        status.replaceChildren(document.createTextNode(missingImages?'图片已生成，部分怪物图片未能加载。':'图片已生成。'),link);link.click();
      }catch{if(status.isConnected&&dialog.open&&current===revision)status.textContent='图片生成失败，请重试。'}
      finally{busy=false;if(exportButton.isConnected)exportButton.disabled=!calculate(jobs,from,to).included}
    };
    start.onchange=()=>{from=Number(start.value);to=Math.max(from,to);refresh()};
    end.onchange=()=>{to=Number(end.value);from=Math.min(from,to);refresh()};
    dialog.querySelector('[data-kill-reset]').onclick=()=>{from=0;to=jobs.length-1;refresh()};
    dialog.querySelector('[data-kill-close]').onclick=()=>dialog.close();
    dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}};
    dialog.onclose=()=>{revision++;clearDownload();dialog.replaceChildren()};
    refresh();dialog.showModal();
  }
  window.addEventListener('hashchange',()=>{const dialog=document.querySelector('#kill-details-dialog');if(dialog?.open)dialog.close()});
  return {calculate,render,svg,open};
})();
