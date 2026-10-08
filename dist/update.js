'use strict';
(()=>{
  const dialog=document.querySelector('#update-dialog'),nav=document.querySelector('#nav-update');
  let status={},version='',csrf='',working=false,installing=false,refreshing=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,body){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Salmon-CSRF':csrf},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok)throw new Error(data.message??'操作未完成');return data}
  function paint(){
    nav.textContent=status.available?'↑ 有新版本':'↑ 版本与更新';
    if(!dialog.open)return;
    dialog.innerHTML=`<div class="manage-header"><div><div class="eyebrow">SOFTWARE UPDATE</div><h2 id="update-title">版本与更新</h2></div><button id="close-update" class="close-chat" aria-label="关闭版本与更新">×</button></div><div class="manage-body"><section><h3>当前版本 ${esc(version||'正在读取…')}</h3><p>每天自动检查新版，由你点击安装。下载期间可以继续查看战绩；安装时会短暂重启，随后自动连接。</p><p id="update-message" role="status">${esc(status.message??'正在读取更新状态…')}</p>${status.phase==='downloading'?`<progress max="100" value="${Number(status.progress)||0}" aria-label="新版下载进度"></progress><p>${Number(status.progress)||0}%</p>`:''}<div class="manage-actions"><button id="check-update" class="button" ${working||status.busy||status.phase==='blocked'?'disabled':''}>检查更新</button><button id="install-update" class="button primary" ${!status.available||working||status.busy?'disabled':''}>${status.latest?'更新到 '+esc(status.latest):'立即更新'}</button></div>${status.checked?`<p>上次检查：${esc(new Date(status.checked).toLocaleString('zh-CN'))}</p>`:''}</section>${status.notes?`<section><h3>新版变化</h3><div class="update-notes">${esc(status.notes)}</div></section>`:''}<section><h3>数据与恢复</h3><p>更新前会自动备份本机战绩、设置和登录凭据。新版通过检查后恢复使用；安装失败则尝试恢复旧版。备份只留在本机，不会上传。不要在更新过程中删除容器或数据卷。</p><p>初次启用需要安装带更新组件的完整安装包。更新组件需要管理 Docker，仅接受本软件的固定更新操作。</p><a href="https://github.com/Awewlife/Salmon-review-releases/releases" target="_blank" rel="noreferrer noopener">打开公开下载页 ↗</a></section></div>`;
    document.querySelector('#close-update').onclick=()=>dialog.close();
    document.querySelector('#check-update').onclick=()=>action('check');document.querySelector('#install-update').onclick=()=>action('install');
  }
  async function refresh(){if(refreshing)return;refreshing=true;try{
    const app=await api('/api/status');csrf=app.csrf;version=app.version;
    const next=await api('/api/update/status');
    const changed=JSON.stringify(next)!==JSON.stringify(status);status=next;
    if(installing&&status.phase==='success'){installing=false;location.reload();return}
    if(installing&&['failed','blocked'].includes(status.phase))installing=false;
    if(changed)paint();
  }catch{if(dialog.open){const message=document.querySelector('#update-message');if(message)message.textContent=installing?'程序正在重启或恢复，正在自动重新连接；请保持 Docker 运行。':'暂时无法连接本机程序，稍后自动重试。'}}finally{refreshing=false}}
  async function action(kind){if(working)return;working=true;try{
    const app=await api('/api/status');csrf=app.csrf;
    const reply=await api('/api/update/'+kind,kind==='install'?{version:status.latest}:{});
    if(!reply.accepted)throw new Error(reply.message??'更新组件暂不可用。');
    installing=kind==='install';status={...status,busy:true,message:installing?'已提交更新，正在准备下载…':'正在检查更新…'};
  }catch(e){status={...status,message:e.message}}finally{working=false;paint();await refresh()}}
  nav.onclick=async()=>{dialog.showModal();paint();await refresh()};dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
  refresh();setInterval(()=>{if(dialog.open||installing)void refresh()},3000);setInterval(()=>{if(!dialog.open)void refresh()},60000);
})();
