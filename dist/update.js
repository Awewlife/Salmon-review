'use strict';
(()=>{
  const dialog=document.querySelector('#update-dialog');
  let startupChecked=false,dismissedVersion=null;
  let status={},version='',csrf='',actionError='',pendingAction='',working=false,installing=false,refreshing=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,body){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Salmon-CSRF':csrf},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(url.endsWith("/authorize")?110000:12000)});const data=await r.json();if(!r.ok)throw new Error(data.message??'操作未完成');return data}
  function paintEntry(){
    const entry=document.querySelector('#manage-update-status');
    if(entry)entry.textContent=`当前版本 ${version||'正在读取…'} · ${status.available?'可更新到 '+status.latest:'启动时检查新版，也可手动检查。'}`;
    const notice=document.querySelector('#update-notice');
    notice.hidden=!(status.available&&status.latest&&status.latest!==dismissedVersion);
    document.querySelector('#update-notice-text').textContent=status.available?`SALMON REVIEW ${status.latest} 已可更新。`:'';
  }
  const pendingMessage=()=>({authorize:'正在校验 GitHub 权限…可能需要几十秒，请稍候。',check:'正在检查更新…',install:'正在提交更新请求…','cancel-install':'正在取消更新并清理下载文件…',disconnect:'正在移除本机更新凭据…'}[pendingAction]||'');
  function paint(){
    paintEntry();
    if(!dialog.open||(!working&&dialog.querySelector("#update-token")?.value))return;
    dialog.innerHTML=`<div class="manage-header"><div><div class="eyebrow">SOFTWARE UPDATE</div><h2 id="update-title">版本与更新</h2></div><button id="close-update" class="close-chat" aria-label="关闭版本与更新">×</button></div><div class="manage-body"><section><h3>当前版本 ${esc(version||'正在读取…')}</h3>${status.updaterVersion?`<p>更新组件 ${esc(status.updaterVersion)}</p>`:''}<p>公开发行版无需 GitHub 令牌。每次打开网页时检查一次新版，由你点击安装。下载期间可以继续查看战绩；安装时会短暂重启，随后自动连接。</p><p id="update-message" role="status" aria-busy="${working}">${esc(pendingMessage()||actionError||status.message||'正在读取更新状态…')}</p>${status.phase==='downloading'?`<progress max="100" value="${Number(status.progress)||0}" aria-label="新版下载进度"></progress><p>${Number(status.progress)||0}%</p>`:''}<div class="manage-actions"><button id="check-update" class="button" ${(!status.publicDownloadsSupported&&!status.auth?.connected)||working||status.busy||status.phase==='blocked'?'disabled':''}>检查更新</button><button id="install-update" class="button primary" ${!status.available||working||status.busy?'disabled':''}>${status.latest?'更新到 '+esc(status.latest):'立即更新'}</button>${status.canCancel||status.phase==='cancelling'?`<button id="cancel-update" class="button" ${working||!status.canCancel?'disabled':''}>${status.phase==='cancelling'?'正在取消…':'取消更新'}</button>`:''}</div>${status.busy&&['loading','handoff','backing_up','restarting','updating_updater','rolling_back'].includes(status.phase)?'<p>已进入安装或恢复阶段，无法取消，请等待自动完成。</p>':''}${status.busy&&!status.cancelSupported&&['verifying','downloading'].includes(status.phase)?'<p>当前更新组件不支持取消，请等待此次更新完成；使用新版完整安装包启动一次后可启用。</p>':''}${status.checked?`<p>上次检查：${esc(new Date(status.checked).toLocaleString('zh-CN'))}</p>`:''}</section><section><h3>GitHub 凭据（可选）</h3><p>${status.auth?.connected?'已保存 '+esc(status.auth.login)+' 的本机凭据'+(status.auth.required?'，需要重新验证权限。':'。'):'公开发行版可直接下载；遇到 API 限流或访问私有测试版时，可在此配置自己的凭据。'}</p><details ${pendingAction==='authorize'||status.auth?.required?'open':''}><summary>连接或更换 GitHub 凭据</summary><p>公开下载通常不需要配置。若要提高 GitHub API 请求额度，可使用自己的令牌，无需授予私有仓库 repo 权限。私有测试版另需账号有权访问仓库；经典令牌的 repo 权限较宽，仅在确实需要时启用。</p><p>私有仓库所有者也可使用仅选本仓库、Contents: Read-only 的细粒度令牌。不要填写密码、任天堂凭据或他人的令牌。</p><p><a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer noopener">在 GitHub 创建自己的令牌 ↗</a></p><label for="update-token">GitHub 令牌（只保存到本机）</label><input id="update-token" type="password" maxlength="255" autocomplete="off" spellcheck="false" placeholder="粘贴你自己的令牌" ${working?'disabled':''}><button id="connect-update" class="button" ${working||status.busy?'disabled':''}>${pendingAction==='authorize'?'正在校验…':'验证并保存'}</button>${pendingAction==='authorize'?'<p role="status">正在校验 GitHub 权限…可能需要几十秒，请稍候。</p>':''}</details><p>凭据保存在本机更新卷，页面不会回显；退出只删除本机凭据，不会影响战绩或任天堂账号。检查公开发行版时优先匿名访问，旧凭据失效不会阻止匿名下载；私有测试版仍需有效权限。</p>${status.auth?.connected?`<button id="disconnect-update" class="button" ${working||status.busy?'disabled':''}>移除本机更新凭据</button>`:''}</section>${window.SalmonReleaseNotes?.current(version).length?`<section><h3>当前版本变化</h3><ul>${window.SalmonReleaseNotes.current(version).map(note=>`<li>${esc(note)}</li>`).join('')}</ul></section>`:''}${status.notes?`<section><h3>新版变化</h3><div class="update-notes">${esc(status.notes)}</div></section>`:''}<section><h3>数据与恢复</h3>${status.cleanup?.message?`<p role="status">${esc(status.cleanup.message)}</p>`:''}${status.cleanup?.legacyBackups?`<p>另有 ${Number(status.cleanup.legacyBackups)} 份旧备份缺少校验记录，已保留。</p>`:''}<p>${status.retentionSupported?'更新成功后保留当前版、上一成功版及容器仍需使用的镜像，保留最近两份已校验备份；更早的冗余文件自动清理。':'当前更新组件尚不支持自动清理，需用新版完整安装包启动一次。'}</p><p>更新前会自动备份本机战绩、设置和登录凭据。新版通过检查后恢复使用；安装失败则尝试恢复旧版。备份只留在本机，不会上传。不要在更新过程中删除容器或数据卷。</p><p>${status.selfUpdateSupported?'主程序和更新组件会一起更新；以后无需为更新组件单独下载安装包。':'首次启用组件自更新，需要用新版完整安装包启动一次。'}更新组件需要管理 Docker，仅接受本软件的固定更新操作。</p><a href="https://github.com/Awewlife/Salmon-review/releases" target="_blank" rel="noreferrer noopener">打开发行页 ↗</a></section></div>`;
    document.querySelector('#close-update').onclick=()=>dialog.close();
    document.querySelector('#connect-update').onclick=()=>action('authorize');document.querySelector('#disconnect-update')?.addEventListener('click',()=>action('disconnect'));
    document.querySelector('#cancel-update')?.addEventListener('click',()=>action('cancel-install'));
    document.querySelector('#check-update').onclick=()=>action('check');document.querySelector('#install-update').onclick=()=>action('install');
  }
  async function refresh(){if(refreshing)return;refreshing=true;try{
    const app=await api('/api/status');csrf=app.csrf;version=app.version;
    const next=await api('/api/update/status');
    const changed=JSON.stringify(next)!==JSON.stringify(status);status=next;
    if(installing&&!status.busy&&status.phase==='success'){installing=false;location.reload();return}
    if(installing&&['failed','blocked','cancelled'].includes(status.phase))installing=false;
    if(!status.busy&&!installing)window.SalmonReleaseNotes?.observe(version);
    if(changed)paint();
    if(!startupChecked&&status.enabled){startupChecked=true;if((status.publicDownloadsSupported||status.auth?.connected)&&!status.busy){await api('/api/update/check',{});status={...status,busy:true}}}
  }catch{if(dialog.open&&!working){const message=document.querySelector('#update-message');if(message)message.textContent=installing?'程序正在重启或恢复，正在自动重新连接；请保持 Docker 运行。':'暂时无法连接本机程序，稍后自动重试。'}}finally{refreshing=false}}
  async function action(kind){if(working)return;actionError='';pendingAction=kind;working=true;let token;const input=dialog.querySelector('#update-token');if(kind==='authorize'){token=input.value;input.value=''}paint();try{
    const app=await api('/api/status');csrf=app.csrf;
    const reply=await api('/api/update/'+kind,kind==='install'?{version:status.latest}:kind==='authorize'?{token}:{});
    if(!reply.accepted)throw new Error(reply.message??'更新组件暂不可用。');
    installing=kind==='install'||(kind==='cancel-install'&&installing);status={...status,busy:['check','install','cancel-install'].includes(kind),message:kind==='cancel-install'?'正在取消更新并清理下载文件…':installing?'已提交更新，正在准备下载…':kind==='check'?'正在检查更新…':kind==='authorize'?'更新权限已连接。':'已移除本机更新凭据。'};
  }catch(e){actionError=e.message;status={...status,message:e.message}}finally{token=null;working=false;pendingAction='';paint();await refresh()}}
  dialog.addEventListener('close',()=>{const input=dialog.querySelector('#update-token');if(input)input.value=''});
  window.SalmonUpdates={paintEntry,open:async()=>{if(!dialog.open)dialog.showModal();paint();await refresh()}};
  document.querySelector('#notice-open-update').onclick=()=>window.SalmonUpdates.open();
  document.querySelector('#dismiss-update-notice').onclick=()=>{dismissedVersion=status.latest;paintEntry()};
  dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
  refresh();setInterval(()=>{if(dialog.open||installing||status.busy)void refresh()},3000);setInterval(()=>{if(!dialog.open)void refresh()},60000);
})();
