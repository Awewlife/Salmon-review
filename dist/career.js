(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=v=>typeof v==='string'&&/^\/assets\/[a-f0-9]{64}$/.test(v)?v:'';
  const fmt=v=>Number(v).toLocaleString('zh-CN');
  const dialog=document.querySelector('#career-dialog'),avatar=document.querySelector('.profile .avatar');
  let data={record:null,error:null},busy=false,feedback='',generation=0,activeTab='official',historyMode='all',compareTable='index',comparePeriod='history';
  const picture=(row,cls='')=>local(row.image)?`<img class="${cls}" src="${row.image}" alt="" loading="lazy">`:'';
  function paintAvatar(){
    avatar.replaceChildren();const fallback=document.createElement('span');fallback.textContent=(data.record?.player||document.querySelector('.profile>div:last-child')?.firstChild?.textContent||'G').trim().slice(0,1)||'G';avatar.append(fallback);
    if(local(data.record?.avatar)){const img=document.createElement('img');img.alt='NSO 头像';img.src=data.record.avatar;img.onload=()=>{fallback.hidden=true};img.onerror=()=>img.remove();avatar.append(img)}
  }
  function render(){
    const r=data.record;
    const list=(rows)=>`<div class="career-enemies">${rows.map(row=>`<article>${picture(row)}<span>${esc(row.name)}</span><strong>${fmt(row.count)}<small> 次</small></strong></article>`).join('')}</div>`;
    dialog.innerHTML=`<header class="career-head"><div><div class="eyebrow">SALMON RUN RECORD</div><h2 id="career-title">个人打工档案</h2><p class="subtext">${esc(r?.player||window.SALMON_DATA?.player||'个人打工档案')}</p></div><button class="button" data-close aria-label="关闭个人打工档案">×</button></header><div class="career-body"><div class="career-tabs" role="tablist" aria-label="打工档案内容"><button type="button" id="career-tab-official" role="tab" aria-selected="${activeTab==='official'}" aria-controls="career-panel" tabindex="${activeTab==='official'?0:-1}" data-career-tab="official">官方纪录</button><button type="button" id="career-tab-history" role="tab" aria-selected="${activeTab==='history'}" aria-controls="career-panel" tabindex="${activeTab==='history'?0:-1}" data-career-tab="history">历史表现</button></div><div id="career-panel" role="tabpanel" aria-labelledby="career-tab-${activeTab}">${activeTab==='history'?historyContent():`<div class="career-toolbar"><span class="subtext">${r?'更新于 '+esc(new Date(r.updatedAt).toLocaleString('zh-CN',{hour12:false})):'尚未获取官方生涯纪录'}</span><button class="button" data-refresh ${busy?'disabled':''}>${busy?'正在获取…':'刷新官方纪录'}</button></div><p class="career-feedback" role="status">${esc(feedback|| (data.error?'上次刷新未完成，'+(r?'仍显示已保存的官方纪录。':'请连接账号后重试。'):''))}</p>${r?`<section><h3>各地图历史最高分</h3><div class="career-stages">${r.stages.map(row=>`<article>${picture(row)}<div><span>${esc(row.name)}</span><strong>${row.grade===null?'暂无纪录':esc(row.grade)+' '+fmt(row.gradePoint)}</strong></div></article>`).join('')||'<p class="subtext">官方暂未提供地图纪录。</p>'}</div></section><section><h3>巨大鲑鱼累计击倒数</h3>${list(r.enemies)}</section><section><h3>头目鲑鱼累计击倒数</h3>${list(r.bosses)}</section><p class="subtext">来自鱿鱼圈 3 的累计纪录，包含未保存在本机的场次。</p>`:'<div class="career-empty"><p>连接任天堂账号后获取官方生涯击倒数和各地图历史最高分。</p><p class="subtext">获取成功后可离线查看，普通战绩同步也会刷新此纪录。</p></div>'}`}</div></div>`;
    dialog.classList.toggle('career-history',activeTab==='history');
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    const refreshButton=dialog.querySelector('[data-refresh]');if(refreshButton)refreshButton.onclick=refresh;
    const tabs=[...dialog.querySelectorAll('[data-career-tab]')];
    const choose=tab=>{activeTab=tab;render();dialog.querySelector(`[data-career-tab="${tab}"]`).focus()};
    tabs.forEach(button=>{
      button.onclick=()=>choose(button.dataset.careerTab);
      button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();choose(event.key==='Home'?'official':event.key==='End'?'history':activeTab==='official'?'history':'official')}};
    });
    if(activeTab==='history'&&window.hasLoadedData?.()){
      const source=window.SALMON_DATA??{},jobs=window.SalmonRadar.historyJobs(source);
      const root=dialog.querySelector('[data-career-radar]');
      if(historyMode==='compare')window.SalmonRadarCompare.mount(root,jobs,source.player??'',{table:compareTable,period:comparePeriod,onTableChange:value=>{compareTable=value},onPeriodChange:value=>{comparePeriod=value}});
      else window.SalmonRadarView.mount(root,jobs,null,source.player??'',{history:true});
      dialog.querySelectorAll('[data-history-mode]').forEach(button=>button.onclick=()=>{historyMode=button.dataset.historyMode;render();dialog.querySelector(`[data-history-mode="${historyMode}"]`).focus()});
    }
    dialog.querySelectorAll('.career-body img').forEach(img=>img.onerror=()=>{img.style.visibility='hidden'});
  }
  function historyContent(){
    if(!window.hasLoadedData?.())return '<p class="career-empty">正在读取本机战绩…</p>';
    const jobs=window.SalmonRadar.historyJobs(window.SALMON_DATA??{});
    return `<section class="career-history-content"><div class="career-history-heading"><h3>历史五维图</h3><div class="history-mode" role="group" aria-label="历史图显示方式"><button class="button" data-history-mode="all" aria-pressed="${historyMode==='all'}">全部历史</button><button class="button" data-history-mode="compare" aria-pressed="${historyMode==='compare'}">近期对比</button></div></div><p class="subtext">根据本地保存的战绩统计，不代表官方完整生涯。</p>${historyMode==='all'?`<div class="career-history-coverage"><p>${esc(window.SalmonRadar.historyRange(jobs))}</p><p>${esc(window.SalmonRadar.historySummary(jobs))}</p></div>`:''}<div data-career-radar></div><p class="subtext career-history-context">100% 表示这些对局的全队均分，不是全体玩家平均水平。图形反映队内分担情况，受地图、武器和队友分工影响。</p></section>`;
  }
  async function reload({historyChanged=false}={}){
    const seq=++generation;
    try{const response=await fetch('/api/career',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();const next=await response.json();if(seq!==generation)return;data=next;paintAvatar();if(dialog.open&&!busy&&(activeTab==='official'||historyChanged))render()}catch{if(dialog.open&&!data.record){feedback='暂时无法读取本机纪录，请稍后重试。';render()}}
  }
  async function refresh(){
    if(busy)return;busy=true;generation++;feedback='正在获取官方生涯纪录…';render();
    try{const state=await (await fetch('/api/status',{signal:AbortSignal.timeout(15000)})).json();const response=await fetch('/api/career/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-Salmon-CSRF':state.csrf},body:'{}',signal:AbortSignal.timeout(110000)});const next=await response.json();if(!response.ok)throw new Error(next.message||'刷新未完成');data=next;feedback='官方纪录已更新。';paintAvatar()}
    catch(error){feedback=(error.name==='TimeoutError'?'请求超时，请稍后重试。':error.message)+(data.record?' 已保留上次的官方纪录。':'')}
    finally{busy=false;render()}
  }
  avatar.title='查看个人打工档案';avatar.setAttribute('aria-label','查看个人打工档案');
  avatar.onclick=async()=>{activeTab='official';render();dialog.showModal();await reload();if(activeTab==='official'&&!data.record&&!busy)await refresh()};
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close()}});
  window.SalmonCareer={reload};reload();
})();
