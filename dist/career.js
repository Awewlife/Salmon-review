(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=v=>typeof v==='string'&&/^\/assets\/[a-f0-9]{64}$/.test(v)?v:'';
  const fmt=v=>Number(v).toLocaleString('zh-CN');
  const dialog=document.querySelector('#career-dialog'),avatar=document.querySelector('.profile .avatar');
  let data={record:null,error:null},busy=false,feedback='',generation=0;
  const picture=(row,cls='')=>local(row.image)?`<img class="${cls}" src="${row.image}" alt="" loading="lazy">`:'';
  function paintAvatar(){
    avatar.replaceChildren();const fallback=document.createElement('span');fallback.textContent=(data.record?.player||document.querySelector('.profile>div:last-child')?.firstChild?.textContent||'G').trim().slice(0,1)||'G';avatar.append(fallback);
    if(local(data.record?.avatar)){const img=document.createElement('img');img.alt='NSO 头像';img.src=data.record.avatar;img.onload=()=>{fallback.hidden=true};img.onerror=()=>img.remove();avatar.append(img)}
  }
  function render(){
    const r=data.record;
    const list=(rows)=>`<div class="career-enemies">${rows.map(row=>`<article>${picture(row)}<span>${esc(row.name)}</span><strong>${fmt(row.count)}<small> 次</small></strong></article>`).join('')}</div>`;
    dialog.innerHTML=`<header class="career-head"><div><div class="eyebrow">SALMON RUN RECORD</div><h2 id="career-title">个人打工档案</h2><p class="subtext">${esc(r?.player||'官方生涯纪录')} · 鱿鱼圈 3 官方生涯数据</p></div><button class="button" data-close aria-label="关闭个人打工档案">×</button></header><div class="career-body"><div class="career-toolbar"><span class="subtext">${r?'更新于 '+esc(new Date(r.updatedAt).toLocaleString('zh-CN',{hour12:false})):'尚未获取官方生涯纪录'}</span><button class="button" data-refresh ${busy?'disabled':''}>${busy?'正在获取…':'刷新官方纪录'}</button></div><p class="career-feedback" role="status">${esc(feedback|| (data.error?'上次刷新未完成，'+(r?'仍显示已保存的官方纪录。':'请连接账号后重试。'):''))}</p>${r?`<section><h3>各地图历史最高分</h3><div class="career-stages">${r.stages.map(row=>`<article>${picture(row)}<div><span>${esc(row.name)}</span><strong>${row.grade===null?'暂无纪录':esc(row.grade)+' '+fmt(row.gradePoint)}</strong></div></article>`).join('')||'<p class="subtext">官方暂未提供地图纪录。</p>'}</div></section><section><h3>巨大鲑鱼累计击倒数</h3>${list(r.enemies)}</section><section><h3>头目鲑鱼累计击倒数</h3>${list(r.bosses)}</section><p class="subtext">直接展示官方累计纪录，不受本地保存场次数量影响；头目击倒采用官方口径。</p>`:'<div class="career-empty"><p>连接任天堂账号后获取官方生涯击倒数和各地图历史最高分。</p><p class="subtext">获取成功后可离线查看，普通战绩同步也会刷新此纪录。</p></div>'}</div>`;
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-refresh]').onclick=refresh;
    dialog.querySelectorAll('.career-body img').forEach(img=>img.onerror=()=>{img.style.visibility='hidden'});
  }
  async function reload(){
    const seq=++generation;
    try{const response=await fetch('/api/career',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();const next=await response.json();if(seq!==generation)return;data=next;paintAvatar();if(dialog.open&&!busy)render()}catch{if(dialog.open&&!data.record){feedback='暂时无法读取本机纪录，请稍后重试。';render()}}
  }
  async function refresh(){
    if(busy)return;busy=true;generation++;feedback='正在获取官方生涯纪录…';render();
    try{const state=await (await fetch('/api/status',{signal:AbortSignal.timeout(15000)})).json();const response=await fetch('/api/career/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-Salmon-CSRF':state.csrf},body:'{}',signal:AbortSignal.timeout(110000)});const next=await response.json();if(!response.ok)throw new Error(next.message||'刷新未完成');data=next;feedback='官方纪录已更新。';paintAvatar()}
    catch(error){feedback=(error.name==='TimeoutError'?'请求超时，请稍后重试。':error.message)+(data.record?' 已保留上次的官方纪录。':'')}
    finally{busy=false;render()}
  }
  avatar.title='查看官方打工生涯纪录';avatar.setAttribute('aria-label','查看官方打工生涯纪录');
  avatar.onclick=async()=>{render();dialog.showModal();await reload();if(!data.record&&!busy)await refresh()};
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close()}});
  window.SalmonCareer={reload};reload();
})();
