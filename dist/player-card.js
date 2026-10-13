(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=value=>typeof value==='string'&&/^\/assets\/[a-f0-9]{64}$/.test(value)?value:'';
  function picture(url,alt,kind){
    const src=local(url);
    return src?`<img class="${kind}" data-card-src="${src}" alt="${esc(alt)}">`:'';
  }
  function render(player,context){
    const a=player.appearance,n=a?.nameplate;
    const color=typeof n?.textColor==='string'&&/^rgba\([\d.,]+\)$/.test(n.textColor)?n.textColor:'#e9eded';
    return `<header class="player-card-header"><div><h2 id="player-card-title">名片与工服</h2><p class="subtext">${esc(context)}</p></div><button class="close-chat" data-card-close aria-label="关闭名片与工服" autofocus>×</button></header>
      <div class="player-card-body"><div class="player-nameplate ${local(n?.background)?'':'card-background-missing'}" style="--nameplate-text:${color}">
      ${picture(n?.background,'名片背景','card-background')}<div class="nameplate-copy"><div class="nameplate-byname" title="${esc(a?.byname)}">${esc(a?.byname)}</div><div class="nameplate-name" title="${esc(player.name)}">${esc(player.name)}</div><div class="nameplate-id">${a?.nameId?'#'+esc(a.nameId):''}</div></div>
      <div class="nameplate-badges">${(n?.badges??[]).map((url,i)=>`<span>${picture(url,`徽章 ${i+1}`,'card-badge')}</span>`).join('')}</div></div>
      ${!n?'<p class="subtext">本场记录未提供名片信息。</p>':''}
      <section class="player-uniform"><div class="uniform-picture">${picture(a?.uniform?.image,a?.uniform?.name??'工服','card-uniform')}<span class="uniform-placeholder" ${local(a?.uniform?.image)?'hidden':''}>暂无工服图片</span></div><div><h3>工服</h3><p>${esc(a?.uniform?.name??'本场记录未提供工服信息')}</p></div></section>
      <div class="card-image-status"><p data-card-status role="status" aria-live="polite"></p><button class="button" data-card-retry hidden>重试图片</button></div><p class="player-card-note">显示本场记录保存的装扮。</p></div>`;
  }
  function open(player,context){
    const dialog=document.querySelector('#player-card-dialog');
    if(dialog.open)dialog.close();
    dialog.innerHTML=render(player,context);
    const images=[...dialog.querySelectorAll('[data-card-src]')],status=dialog.querySelector('[data-card-status]'),retry=dialog.querySelector('[data-card-retry]');
    const refresh=()=>{
      const pending=images.filter(img=>img.dataset.state==='loading').length,failed=images.filter(img=>img.dataset.state==='error').length;
      status.textContent=pending?'正在加载图片…':failed?'部分图片未能加载，可稍后重试。':'';
      retry.hidden=!failed||!!pending;
    };
    const load=img=>{
      img.dataset.state='loading';img.hidden=true;
      img.onload=()=>{
        img.dataset.state='loaded';img.hidden=false;
        if(img.classList.contains('card-background'))img.parentElement.classList.remove('card-background-missing');
        if(img.classList.contains('card-uniform'))img.parentElement.querySelector('.uniform-placeholder').hidden=true;
        refresh();
      };
      img.onerror=()=>{
        img.dataset.state='error';img.hidden=true;
        if(img.classList.contains('card-background'))img.parentElement.classList.add('card-background-missing');
        if(img.classList.contains('card-uniform'))img.parentElement.querySelector('.uniform-placeholder').hidden=false;
        refresh();
      };
      img.src=img.dataset.cardSrc;
    };
    // Use readable fallback colors until the actual nameplate background loads.
    dialog.querySelector('.player-nameplate').classList.add('card-background-missing');
    dialog.querySelector('[data-card-close]').onclick=()=>dialog.close();
    dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}};
    dialog.onclose=()=>{images.forEach(img=>{img.onload=null;img.onerror=null});dialog.replaceChildren()};
    retry.onclick=()=>{images.filter(img=>img.dataset.state==='error').forEach(load);refresh()};
    dialog.showModal();images.forEach(load);refresh();
  }
  window.SalmonPlayerCard={open,render};
  window.addEventListener('hashchange',()=>{const dialog=document.querySelector('#player-card-dialog');if(dialog?.open)dialog.close()});
})();
