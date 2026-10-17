'use strict';
window.SalmonKillDetails=(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:1}):'—';
  const count=value=>Number.isSafeInteger(value)&&value>=0;
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
        row.kills+=boss.me;row.appeared+=boss.appeared;types.set(key,row);
      }
    }
    return {selected:selected.length,included,interrupted,incomplete,kills,appeared,detailKills,percent:ratio(kills,appeared),
      rows:[...types.values()].sort((a,b)=>b.appeared-a.appeared||String(a.name).localeCompare(String(b.name),'zh-CN')).map(row=>({...row,percent:ratio(row.kills,row.appeared)}))};
  }
  const percent=value=>value===null?'—':fmt(value)+'%';
  function render(result){
    return `<div class="kill-detail-summary" role="status" aria-live="polite"><div><span>个人击杀 / 出现总数</span><strong>${result.included?fmt(result.kills)+' <small>/</small> '+fmt(result.appeared):'—'}<em>只</em></strong></div><div><span>击杀占比</span><strong class="kill-detail-percent">${percent(result.percent)}</strong></div></div>
      <p class="kill-detail-coverage">已选 ${result.selected} 场 · 统计 ${result.included} 场${result.interrupted?' · 排除 '+result.interrupted+' 场掉线':''}${result.incomplete?' · 排除 '+result.incomplete+' 场数据不全':''}</p>
      ${!result.included?'<p class="kill-detail-empty">所选范围没有可统计的结算记录。</p>':`<div class="kill-detail-table"><table><thead><tr><th>怪物</th><th>个人击杀</th><th>出现总数</th><th>占比</th></tr></thead><tbody>${result.rows.map(row=>`<tr><td>${esc(row.name)}</td><td>${fmt(row.kills)}</td><td>${fmt(row.appeared)}</td><td>${percent(row.percent)}</td></tr>`).join('')}</tbody></table></div>`}
      <p class="kill-detail-note">占比 = 所选场次个人击杀合计 ÷ 同一批场次的出现总数。出现总数来自巨大鲑鱼明细（含金鲑鱼等特殊敌人），不含普通小怪和头目；出现总数为 0 时显示“—”。仅统计本地已保存记录。</p>
      ${result.kills!==result.detailKills?'<p class="kill-detail-note">个人结算击杀合计为 '+fmt(result.kills)+'，各类怪物明细合计为 '+fmt(result.detailKills)+'；原始记录存在差异，分别展示，不作修正。</p>':''}`;
  }
  function open(jobs,shift){
    const dialog=document.querySelector('#kill-details-dialog');
    if(dialog.open)dialog.close();
    let from=0,to=jobs.length-1;
    const options=selected=>jobs.map((job,i)=>`<option value="${i}" ${selected===i?'selected':''}>第 ${job.index} 场${job.interrupted?' · 掉线':''}</option>`).join('');
    dialog.innerHTML=`<header class="trend-header"><div><h2 id="kill-details-title">本期击杀详情</h2><p class="subtext">${esc(shift.stage.name)} · 个人击杀 / 巨大鲑鱼出现总数</p></div><button class="close-chat" data-kill-close aria-label="关闭击杀详情" autofocus>×</button></header>
      <div class="kill-detail-body"><div class="kill-detail-range" role="group" aria-label="击杀统计场次范围"><label>起始场次 <select id="kill-detail-from" ${jobs.length?'':'disabled'}>${options(from)}</select></label><span>—</span><label>结束场次 <select id="kill-detail-to" ${jobs.length?'':'disabled'}>${options(to)}</select></label><button class="button" data-kill-reset ${jobs.length?'':'disabled'}>全部场次</button></div><div data-kill-results></div></div>`;
    const start=dialog.querySelector('#kill-detail-from'),end=dialog.querySelector('#kill-detail-to');
    const refresh=()=>{start.value=String(from);end.value=String(to);dialog.querySelector('[data-kill-results]').innerHTML=render(calculate(jobs,from,to))};
    start.onchange=()=>{from=Number(start.value);to=Math.max(from,to);refresh()};
    end.onchange=()=>{to=Number(end.value);from=Math.min(from,to);refresh()};
    dialog.querySelector('[data-kill-reset]').onclick=()=>{from=0;to=jobs.length-1;refresh()};
    dialog.querySelector('[data-kill-close]').onclick=()=>dialog.close();
    dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}};
    dialog.onclose=()=>dialog.replaceChildren();
    refresh();dialog.showModal();
  }
  window.addEventListener('hashchange',()=>{const dialog=document.querySelector('#kill-details-dialog');if(dialog?.open)dialog.close()});
  return {calculate,render,open};
})();
