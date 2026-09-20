'use strict';
(()=>{
  let state=null,lastRun=null,busy=false;
  const dialog=document.querySelector('#manage-dialog');
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stamp=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚无';
  const errors={auth_required:'请重新连接账号',upstream_disabled:'上游暂时禁止认证',upstream:'上游接口异常，需要检查版本',rate_limited:'请求受限，已延后',network:'网络暂时不可用',interrupted:'任务中断，可再次同步继续',account_mismatch:'账号与已有战绩不一致',disk:'请检查磁盘空间或数据卷权限'};
  async function request(url,body){
    const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Salmon-CSRF':state?.csrf??''},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw new Error(result.message??'操作未完成');return result;
  }
  function report(message,error=false){const element=document.querySelector('#manage-message');if(element){element.textContent=message;element.classList.toggle('error',error)}}
  function paintStatus(){
    const run=state.sync.last,description=state.sync.active?`同步中 ${run?.done??0} / ${run?.total??0}`:run?.state==='failed'||run?.state==='interrupted'?(errors[run.error]??'同步未完成'):state.connected?'账号已连接':'未连接账号，可导入记录';
    document.querySelector('#sync-strip').textContent=`${state.records} 场已保存 · ${description} · 上次成功同步：${stamp(state.sync.lastSuccess)}`;
    const details=document.querySelector('#sync-details');if(details)details.textContent=`${description}。上次导入：${stamp(state.lastImport)}。${state.sync.paused?'自动同步已暂停：'+(errors[state.sync.paused]??state.sync.paused)+'。':''}${state.sync.nextAttempt>Date.now()?'下次可同步：'+stamp(state.sync.nextAttempt):''}`;
    const sync=document.querySelector('#sync-now');if(sync)sync.disabled=busy||state.sync.active||!state.connected||state.sync.nextAttempt>Date.now();
  }
  async function refresh(){state=await request('/api/status');paintStatus();const run=state.sync.last;if(lastRun!==null&&run&&lastRun!==run.id+':'+run.state&&!state.sync.active)await refreshData();lastRun=run?run.id+':'+run.state:''}
  function paintExcluded(){const element=document.querySelector('#excluded-records');if(!element)return;const excluded=window.SALMON_DATA.excluded??[];element.innerHTML=excluded.length?`<p>共 ${excluded.length} 场${excluded.length>100?'，显示最近 100 场':''}</p>`+excluded.slice(-100).reverse().map(j=>`<div class="excluded-row">${html(stamp(j.time))} · ${html(j.stage)}<br><span>${html(j.reasons.join('；'))}</span></div>`).join(''):'<p>暂无。</p>'}
  async function refreshData(){window.replaceData(await request('/api/data'));paintExcluded()}
  async function operation(action){if(busy)return;busy=true;dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);try{await action();await refresh()}catch(error){report(error.message,true)}finally{busy=false;dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);paintStatus()}}
  window.openManage=async()=>{
    try{await refresh()}catch{document.querySelector('#sync-strip').textContent='无法连接本地服务，请检查容器状态。';return}
    dialog.innerHTML=`<header class="manage-header"><div><div class="eyebrow">LOCAL DATA</div><h2 id="manage-title">数据与同步</h2></div><button class="close-chat" id="close-manage" aria-label="关闭数据管理">×</button></header>
    <div class="manage-body"><p class="manage-message" id="manage-message" role="status">一个实例保存一位玩家的数据。导入、同步和升级均保留已归档场次。</p>
    <section><h3>导入已有记录</h3><p>选择 nxapi 导出的打工详情与排班汇总 JSON。可多选；没有汇总的记录会先保存，等待归类。重复导入会自动去重。</p><label class="file-picker">选择 JSON 文件<input id="import-files" type="file" accept=".json,application/json" multiple></label><button class="button primary" id="import-records">导入所选文件</button></section>
    <section><h3>连接任天堂账号</h3><p id="account-state">${state.connected?'已保存登录状态。':'尚未连接账号。'}</p><p>登录在任天堂页面完成。本工具不会索要密码；登录与刷新由容器内的官方 nxapi 命令行处理，登录缓存保存在本机数据卷中，无需配置客户端 ID。nxapi 的认证过程需要向第三方认证服务发送短期令牌。</p>
    <button class="button" id="connect-account">开始连接 / 重新连接</button> <button class="button" id="disconnect-account" ${state.connected?'':'disabled'}>退出账号</button>
    <div id="auth-steps" hidden><ol><li><a id="nintendo-login" target="_blank" rel="noreferrer noopener">打开任天堂登录页面 ↗</a></li><li>登录后，在选择此账号的按钮上复制链接地址，应以 npf71b963c1b7b6d119://auth 开头。</li><li>将链接粘贴到下面，仅提交到本机服务。授权流程 10 分钟后过期。</li></ol><label for="auth-link">授权返回链接</label><input id="auth-link" type="password" autocomplete="off" placeholder="npf71b963c1b7b6d119://auth…"><button class="button primary" id="finish-auth">完成连接</button></div></section>
    <section><h3>同步设置</h3><p id="sync-details"></p><button class="button primary" id="sync-now">立即同步</button><label class="auto-label">自动同步<select id="auto-sync"><option value="0">关闭</option><option value="15">每 15 分钟</option><option value="30">每 30 分钟</option><option value="60">每小时</option><option value="120">每 2 小时</option></select></label><p>容器运行时生效。上游认证或接口异常时自动暂停；仍可查看已保存的战绩。</p></section>
    <section><h3>备份与恢复</h3><p>备份包含原始战绩和排班汇总，不包含登录凭据或图片缓存。恢复会合并同账号记录，不覆盖现有记录。备份含玩家昵称，请妥善保存。</p><a class="button" href="/api/backup" download>下载数据备份</a><label class="file-picker">选择备份<input id="restore-file" type="file" accept=".json,application/json"></label><button class="button" id="restore-backup">恢复并合并</button></section>
    <section><h3>暂未纳入统计的记录</h3><p>缺少排班、结算字段不完整或未支持的模式会保留原始数据；不会按零分参与均值。</p><div id="excluded-records"></div></section></div>`;
    document.querySelector('#auto-sync').value=state.sync.autoMinutes;
    paintExcluded();
    document.querySelector('#close-manage').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
    document.querySelector('#import-records').onclick=()=>operation(async()=>{
      const files=[...document.querySelector('#import-files').files];if(!files.length)throw new Error('请先选择 JSON 文件。');if(files.reduce((n,f)=>n+f.size,0)>60*1024*1024)throw new Error('请选择总计小于 60 MB 的文件，较多记录请分批导入。');
      report('正在读取并导入…');const documents=[];for(const file of files)try{documents.push(JSON.parse(await file.text()))}catch{throw new Error('所选文件中有无效 JSON，请检查文件格式。')}
      const result=await request('/api/import',{documents});report(`导入完成：新增 ${result.added} 场，跳过 ${result.skipped} 场重复记录，接收 ${result.summaries} 份汇总。`);await refreshData();document.querySelector('#import-files').value='';
    });
    document.querySelector('#connect-account').onclick=()=>operation(async()=>{const result=await request('/api/auth/start',{});document.querySelector('#nintendo-login').href=result.url;document.querySelector('#auth-steps').hidden=false;report('请打开任天堂页面完成登录。')});
    document.querySelector('#finish-auth').onclick=()=>operation(async()=>{const input=document.querySelector('#auth-link'),url=input.value;input.value='';await request('/api/auth/complete',{url});document.querySelector('#auth-steps').hidden=true;document.querySelector('#account-state').textContent='已保存登录状态。';report('连接完成，可以立即同步。')});
    document.querySelector('#disconnect-account').onclick=()=>operation(async()=>{await request('/api/auth/logout',{});document.querySelector('#account-state').textContent='已退出，战绩仍保留。';document.querySelector('#auto-sync').value='0';report('登录凭据已清除，自动同步已关闭。')});
    document.querySelector('#sync-now').onclick=()=>operation(async()=>{await request('/api/sync',{});report('同步已在后台开始，关闭此窗口不影响任务。')});
    document.querySelector('#auto-sync').onchange=e=>{const autoMinutes=Number(e.target.value);operation(async()=>{await request('/api/settings',{autoMinutes});report(autoMinutes?'自动同步设置已保存。':'自动同步已关闭。')})};
    document.querySelector('#restore-backup').onclick=()=>operation(async()=>{const file=document.querySelector('#restore-file').files[0];if(!file)throw new Error('请选择备份文件。');if(file.size>60*1024*1024)throw new Error('备份超过此版本的 60 MB 网页导入限制。');const result=await request('/api/restore',JSON.parse(await file.text()));report(`恢复完成，新增 ${result.added} 场；原有记录保留。`);await refreshData()});
    paintStatus();if(!dialog.open)dialog.showModal();
  };
  document.querySelector('#nav-manage').onclick=window.openManage;
  refresh().catch(()=>{document.querySelector('#sync-strip').textContent='无法连接本地服务，请检查容器状态。'});
  setInterval(()=>refresh().catch(()=>{}),4000);
})();
