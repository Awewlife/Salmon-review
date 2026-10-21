'use strict';
(()=>{
  let state=null,lastRun=null,busy=false,authPhase='idle',authAttempt=null;
  let openGeneration=0,refreshing=null,dataRefresh=Promise.resolve(),loadedVersion=null,needsData=true;
  const dialog=document.querySelector('#manage-dialog');
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paintedText=new WeakMap();
  const setText=(element,value)=>{if(paintedText.get(element)===value)return;paintedText.set(element,value);element.textContent=value};
  const stamp=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚无';
  const errors={auth_required:'请重新连接账号',upstream_disabled:'上游暂时禁止认证',upstream:'上游接口异常，需要检查版本',rate_limited:'请求受限，已延后',network:'网络暂时不可用',interrupted:'任务中断，可再次同步继续',account_mismatch:'账号与已有战绩不一致',disk:'请检查磁盘空间或数据卷权限'};
  async function request(url,body){
    const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Salmon-CSRF':state?.csrf??''},body:body===undefined?undefined:JSON.stringify(body),...(body===undefined?{signal:AbortSignal.timeout(30000)}:{})});
    const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.message??'操作未完成'),{code:result.code});return result;
  }
  function report(message,error=false){const element=document.querySelector('#manage-message');if(element){element.textContent=message;element.classList.toggle('error',error)}}
  function quickReport(message,error=false){const element=document.querySelector('#sync-feedback');element.hidden=false;element.textContent=message;element.classList.toggle('error',error)}
  function authReport(message,error=false){
    report(message,error);
    const element=document.querySelector('#auth-message');if(element){element.hidden=false;element.textContent=message;element.classList.toggle('error',error)}
  }
  function paintAuth(){
    const steps=document.querySelector('#auth-steps');if(!steps)return;
    if(authPhase==='waiting'&&authAttempt&&authAttempt.expires<=Date.now()){
      authPhase='expired';authAttempt=null;authReport('本次登录链接已过期，请点击“重新生成登录链接”，再按步骤登录。',true);
    }
    const waiting=authPhase==='waiting'&&authAttempt;
    steps.hidden=!waiting&&authPhase!=='submitting';
    const link=document.querySelector('#nintendo-login');link.hidden=!waiting;
    if(waiting)link.href=authAttempt.url;else link.removeAttribute('href');
    document.querySelector('#finish-auth').disabled=busy||!waiting||!document.querySelector('#auth-link').value.trim();
    document.querySelector('#connect-account').disabled=busy||state.sync.active;
    setText(document.querySelector('#connect-account'),authPhase==='starting'?'正在生成链接…':authPhase==='idle'?'开始连接 / 重新连接':'重新生成登录链接');
    setText(document.querySelector('#finish-auth'),authPhase==='submitting'?'正在验证，请稍候…':'完成连接');
    setText(document.querySelector('#auth-expiry'),waiting?`本次链接剩余 ${Math.ceil((authAttempt.expires-Date.now())/60000)} 分钟；请使用本次打开的登录页面。`:'');
    document.querySelector('#disconnect-account').disabled=busy||state.sync.active||!state.connected;
  }
  const needsLogin=()=>!state.connected||state.sync.paused==='auth_required';
  const manualRetryAt=()=>state.sync.manualNextAttempt??state.sync.nextAttempt??0;
  function paintRetryButtons(){
    const quick=document.querySelector('#quick-sync'),retryAt=manualRetryAt(),seconds=Math.max(0,Math.ceil((retryAt-Date.now())/1000)),cooldown=seconds>0,limited=state.sync.rateLimitedUntil>Date.now();
    quick.disabled=busy||state.sync.active||needsLogin()||cooldown;
    setText(quick,state.sync.active?'正在同步…':needsLogin()?'请先连接账号':cooldown?(limited?'限流等待中':seconds<=60?`${seconds} 秒后可重试`:'稍后再同步'):'立即同步');
    quick.title=needsLogin()?'请通过左侧账号入口重新连接':cooldown?`${limited?'请求受限，最早':'手动'}可同步：${stamp(retryAt)}`:'下载最新打工记录';
    const sync=document.querySelector('#sync-now');if(sync){sync.disabled=quick.disabled;setText(sync,paintedText.get(quick));sync.title=quick.title}
    return {cooldown,retryAt};
  }
  function paintStatus(){
    const run=state.sync.last,description=authPhase==='starting'?'正在准备登录':authPhase==='submitting'?'正在验证登录':authPhase==='waiting'?'等待任天堂授权':state.sync.active?`同步中 ${run?.done??0} / ${run?.total??0}`:state.sync.paused==='auth_required'?'登录已失效，请重新连接':state.connected?'账号已连接':'未连接账号，可导入记录';
    const previous=run?.state==='failed'||run?.state==='interrupted'?`上次同步未完成（${stamp(run.finished)}）：${errors[run.error]??'同步未完成'}。`:'';
    const disconnected=needsLogin()&&!['starting','submitting','waiting'].includes(authPhase)&&!state.sync.active;
    setText(document.querySelector('#sync-status'),`${state.records} 场已保存 · ${disconnected?'':description}`);
    document.querySelector('#quick-connect').hidden=!disconnected;
    setText(document.querySelector('#quick-connect'),state.sync.paused==='auth_required'?'重新连接账号':'未连接账号');
    document.querySelector('#quick-connect').disabled=busy;
    setText(document.querySelector('#sync-last'),` · 上次成功同步：${stamp(state.sync.lastSuccess)}`);
    const {cooldown,retryAt}=paintRetryButtons();
    const details=document.querySelector('#sync-details');if(details)setText(details,`${description}。${previous}上次导入：${stamp(state.lastImport)}。${state.sync.paused?'自动同步已暂停：'+(errors[state.sync.paused]??state.sync.paused)+'。':''}${cooldown?'手动可同步：'+stamp(retryAt)+'。':''}${state.sync.autoMinutes&&!state.sync.paused&&state.sync.nextAttempt>Date.now()?'自动同步最早重试：'+stamp(state.sync.nextAttempt)+'（同时遵循所选同步间隔）。':''}`);
    paintAuth();
  }
  function refresh(){
    // Coalesce timer/manual reads; a slow response must not race a newer render.
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      try{state=await request('/api/status')}catch(error){
        setText(document.querySelector('#sync-status'),window.hasLoadedData()?'暂时无法读取同步状态，当前战绩保持显示；稍后自动重试。':'暂时无法连接本地服务，稍后自动重试。');
        document.querySelector('#data-refresh-note').textContent=window.hasLoadedData()?'当前展示为上次成功读取的战绩。':'';
        throw error;
      }
      paintStatus();const run=state.sync.last,runKey=run?run.id+':'+run.state:'';
      const version=JSON.stringify([state.records,state.lastImport,runKey]);
      if(lastRun!==null&&run&&lastRun!==runKey&&!state.sync.active){
        quickReport(run.state==='success'?`同步完成，新增 ${run.added??0} 场记录。`:`本次同步未完成：${errors[run.error]??'请在数据与同步中查看状态'}。`,run.state!=='success');
      }
      lastRun=runKey;
      if(needsData||(!state.sync.active&&loadedVersion!==version)){
        document.querySelector('#data-refresh-note').textContent=window.hasLoadedData()?'正在更新战绩，暂显示上次读取的内容。':'正在读取本机战绩…';
        try{await refreshData();loadedVersion=version;needsData=false}
        catch(error){document.querySelector('#data-refresh-note').textContent=window.hasLoadedData()?'战绩更新失败，已保留当前展示；稍后自动重试。':'战绩暂时读取失败，稍后自动重试。';throw error}
      }
    })().finally(()=>{refreshing=null});
    return refreshing;
  }
  function paintExcluded(){const element=document.querySelector('#excluded-records');if(!element)return;const excluded=window.SALMON_DATA.excluded??[];element.innerHTML=excluded.length?`<p>共 ${excluded.length} 场${excluded.length>100?'，显示最近 100 场':''}</p>`+excluded.slice(-100).reverse().map(j=>`<div class="excluded-row">${html(stamp(j.time))} · ${html(j.stage)}<br><span>${html(j.reasons.join('；'))}</span></div>`).join(''):'<p>暂无。</p>'}
  function refreshData(){
    // Queue import/restore refreshes behind any older read, so older data cannot win.
    dataRefresh=dataRefresh.catch(()=>{}).then(async()=>{
      const data=await request('/api/data');window.replaceData(data);paintExcluded();
      document.querySelector('#data-refresh-note').textContent='';
    });
    return dataRefresh;
  }
  async function operation(action,{auth=false,quick=false,pending='正在处理…'}={}){if(busy)return;busy=true;const notify=auth?authReport:quick?quickReport:report;notify(pending);paintStatus();dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);try{await action();await refresh()}catch(error){if(auth){if(authPhase==='starting'||authPhase==='submitting'&&error.code!=='auth_callback'){authPhase='error';authAttempt=null}else if(authPhase==='submitting')authPhase='waiting';authReport(error.message,true)}else {if(error.code==='auth_required')state.sync.paused='auth_required';notify(error.message,true)}}finally{busy=false;dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);paintStatus()}}
  function startSync(quick=false){
    if(!state||busy||state.sync.active||needsLogin()||manualRetryAt()>Date.now())return;
    return operation(async()=>{await request('/api/sync',{});(quick?quickReport:report)('同步已在后台开始，完成后自动更新战绩。')},{quick,pending:'正在开始同步…'});
  }
  window.openManage=async({section}={})=>{
    if(busy){if(!dialog.open)dialog.showModal();return}
    const generation=++openGeneration;
    dialog.innerHTML=`<header class="manage-header"><div><div class="eyebrow">LOCAL DATA</div><h2 id="manage-title">数据与同步</h2></div><button class="close-chat" id="close-manage" aria-label="关闭数据管理">×</button></header><div class="manage-body"><p id="manage-loading" role="status">正在读取本地服务状态…</p><button class="button" id="open-diagnostics">一键诊断与导出</button><button class="button" id="retry-manage">重新加载设置</button></div>`;
    document.querySelector('#close-manage').onclick=()=>dialog.close();
    document.querySelector('#open-diagnostics').onclick=()=>window.SalmonDiagnostics.open();
    document.querySelector('#retry-manage').onclick=()=>window.openManage({section});
    dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
    if(!dialog.open)dialog.showModal();
    try{await refresh()}catch{if(generation===openGeneration){const message=dialog.querySelector('#manage-loading');if(message)message.textContent='本地服务或战绩读取未完成。可以先诊断并导出结果，再检查 Docker 容器状态。'}return}
    if(generation!==openGeneration||!dialog.open)return;
    dialog.innerHTML=`<header class="manage-header"><div><div class="eyebrow">LOCAL DATA</div><h2 id="manage-title">数据与同步</h2></div><button class="close-chat" id="close-manage" aria-label="关闭数据管理">×</button></header>
    <div class="manage-body"><p class="manage-message" id="manage-message" role="status">一个实例保存一位玩家的数据。导入、同步和升级均保留已归档场次。</p>
    <section><h3>导入已有记录</h3><p>选择 nxapi 导出的打工详情与排班汇总 JSON。可多选；没有汇总的记录会先保存，等待归类。重复导入会自动去重。</p><label class="file-picker">选择 JSON 文件<input id="import-files" type="file" accept=".json,application/json" multiple></label><button class="button primary" id="import-records">导入所选文件</button></section>
    <section class="auth-section" id="account-section" tabindex="-1" aria-labelledby="account-heading"><div class="auth-heading"><h3 id="account-heading">连接任天堂账号</h3><span class="auth-local">仅在本机保存</span></div><p id="account-state">${state.sync.paused==='auth_required'?'登录已失效，请重新连接后再同步。':state.connected?'已保存登录状态。':'尚未连接账号。'}</p>
    <p>准备好玩喷喷的任天堂账号，按照下面三步操作。密码只在任天堂页面输入。</p>
    <button class="button primary" id="connect-account">开始连接 / 重新连接</button> <button class="button" id="disconnect-account" ${state.connected?'':'disabled'}>退出账号</button>
    <p class="manage-message auth-message" id="auth-message" role="status" aria-live="polite" hidden></p>
    <ol class="auth-guide" aria-label="登录操作指南">
      <li><span class="auth-number">1</span><div><h4>打开任天堂页面并登录</h4><p>先点上方“开始连接”，再打开生成的登录链接，登录你用于游玩 Splatoon 3 的账号。</p><a class="button" hidden id="nintendo-login" target="_blank" rel="noreferrer noopener">① 打开任天堂登录页面 ↗</a></div></li>
      <li><span class="auth-number">2</span><div><h4>在“选择此账号”按钮上复制链接</h4><p>电脑：在按钮上点鼠标右键，选择“复制链接地址”或“复制链接”。手机：长按按钮，再选择复制链接。英文按钮可能显示为“Select this person”。</p>
      <div class="auth-copy-demo" role="img" aria-label="操作示意：在选择此账号按钮上右键，选择复制链接地址。不是复制地址栏网址。"><span class="auth-demo-label">操作示意 · 非实际按钮</span><span class="auth-demo-account">选择此账号</span><span class="auth-demo-arrow">右键 / 长按 →</span><span class="auth-demo-menu">复制链接地址</span></div>
      <p class="auth-copy-note">要复制按钮的链接，不是浏览器地址栏的网址；不要直接左键点击按钮。</p></div></li>
      <li><span class="auth-number">3</span><div><h4>回到这里粘贴，完成连接</h4><p>正确链接以 <code>npf71b963c1b7b6d119://auth</code> 开头。粘贴后点“完成连接”，成功后即可“立即同步”。</p></div></li>
    </ol>
    <div id="auth-steps" hidden><p id="auth-expiry"></p><label for="auth-link">③ 粘贴按钮的返回链接</label><input id="auth-link" type="password" autocomplete="off" spellcheck="false" aria-describedby="auth-link-help" placeholder="npf71b963c1b7b6d119://auth…"><p id="auth-link-help">链接仅提交给本机服务，无需发到聊天窗口。</p><button class="button primary" id="finish-auth" disabled>完成连接</button></div>
    <details class="auth-faq"><summary>没有看到按钮，或链接提示无效？</summary><p>请使用这次生成的登录页面，重新复制“选择此账号”按钮的完整链接。若已跳转到 App、链接过期或关掉了登录页面，点击“重新生成登录链接”再试。</p><p>登录和刷新由 nxapi 处理，无需配置客户端 ID。登录缓存保存在本机数据卷；认证过程需要向第三方认证服务发送短期令牌。</p></details></section>
    <section id="sync-settings" tabindex="-1"><h3>同步设置</h3><p id="sync-details"></p><button class="button primary" id="sync-now">立即同步</button><label class="auto-label">自动同步<select id="auto-sync"><option value="0">关闭自动同步</option><option value="15">每 15 分钟</option><option value="30">每 30 分钟</option><option value="60">每小时</option><option value="120">每 2 小时</option></select></label><p>容器运行时生效。上游认证或接口异常时自动暂停；仍可查看已保存的战绩。</p></section>
    <section><h3>诊断与排查</h3><p>检查本地服务、战绩读取、同步与更新状态，导出不含账号凭据和战绩明细的诊断报告。</p><button class="button" id="open-diagnostics">一键诊断与导出</button></section>
    <section><h3>版本与更新</h3><p id="manage-update-status">启动时自动检查新版，也可以在这里手动检查和更新。</p><button class="button" id="open-update">查看版本与更新</button></section><section><h3>备份与恢复</h3><p>备份包含原始战绩和排班汇总，不包含登录凭据或图片缓存。恢复会合并同账号记录，不覆盖现有记录。备份含玩家昵称，请妥善保存。</p><a class="button" href="/api/backup" download>下载数据备份</a><label class="file-picker">选择备份<input id="restore-file" type="file" accept=".json,application/json"></label><button class="button" id="restore-backup">恢复并合并</button></section>
    <section><h3>暂未纳入统计的记录</h3><p>缺少排班、结算字段不完整或未支持的模式会保留原始数据；不会按零分参与均值。</p><div id="excluded-records"></div></section></div>`;
    document.querySelector('#open-diagnostics').onclick=()=>window.SalmonDiagnostics.open();
    document.querySelector('#auto-sync').value=state.sync.autoMinutes;
    document.querySelector('#open-update').onclick=()=>window.SalmonUpdates?.open();window.SalmonUpdates?.paintEntry();
    paintExcluded();
    document.querySelector('#close-manage').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
    document.querySelector('#import-records').onclick=()=>operation(async()=>{
      const files=[...document.querySelector('#import-files').files];if(!files.length)throw new Error('请先选择 JSON 文件。');if(files.reduce((n,f)=>n+f.size,0)>60*1024*1024)throw new Error('请选择总计小于 60 MB 的文件，较多记录请分批导入。');
      report('正在读取并导入…');const documents=[];for(const file of files)try{documents.push(JSON.parse(await file.text()))}catch{throw new Error('所选文件中有无效 JSON，请检查文件格式。')}
      const result=await request('/api/import',{documents});report(`导入完成：新增 ${result.added} 场，跳过 ${result.skipped} 场重复记录，接收 ${result.summaries} 份汇总。`);await refreshData();document.querySelector('#import-files').value='';
    });
    document.querySelector('#auth-link').oninput=paintAuth;
    document.querySelector('#connect-account').onclick=()=>operation(async()=>{
      authPhase='starting';authAttempt=null;document.querySelector('#auth-link').value='';paintStatus();
      authAttempt=await request('/api/auth/start',{});authPhase='waiting';paintAuth();
      authReport('新的登录链接已准备好，请打开任天堂页面，按下方图示复制按钮链接。');
    },{auth:true,pending:'正在生成新的登录链接，请稍候…'});
    document.querySelector('#finish-auth').onclick=()=>operation(async()=>{
      const input=document.querySelector('#auth-link'),url=input.value.trim();
      if(!url.startsWith('npf71b963c1b7b6d119://auth'))throw Object.assign(new Error('请复制“选择此账号”按钮的链接，而不是地址栏的网址。'),{code:'auth_callback'});
      authPhase='submitting';input.value='';paintStatus();
      await request('/api/auth/complete',{url});authPhase='idle';authAttempt=null;
      document.querySelector('#account-state').textContent='已保存登录状态。';authReport('连接成功！现在可以点击“立即同步”读取打工记录。');
    },{auth:true,pending:'正在验证登录并保存连接，请稍候…'});
    document.querySelector('#disconnect-account').onclick=()=>operation(async()=>{await request('/api/auth/logout',{});authPhase='idle';authAttempt=null;document.querySelector('#auth-link').value='';document.querySelector('#account-state').textContent='已退出，战绩仍保留。';document.querySelector('#auto-sync').value='0';authReport('登录凭据已清除，自动同步已关闭。')},{auth:true,pending:'正在退出账号…'});
    document.querySelector('#sync-now').onclick=()=>startSync();
    document.querySelector('#auto-sync').onchange=e=>{const autoMinutes=Number(e.target.value);operation(async()=>{await request('/api/settings',{autoMinutes});report(autoMinutes?'自动同步设置已保存。':'自动同步已关闭。')})};
    document.querySelector('#restore-backup').onclick=()=>operation(async()=>{const file=document.querySelector('#restore-file').files[0];if(!file)throw new Error('请选择备份文件。');if(file.size>60*1024*1024)throw new Error('备份超过此版本的 60 MB 网页导入限制。');const result=await request('/api/restore',JSON.parse(await file.text()));report(`恢复完成，新增 ${result.added} 场；原有记录保留。`);await refreshData()});
    paintStatus();
    if(section==='sync'){const sync=document.querySelector('#sync-settings');sync.scrollIntoView({block:'start'});sync.focus({preventScroll:true})}
    if(section==='account'){const account=document.querySelector('#account-section');account.scrollIntoView({block:'start'});account.focus({preventScroll:true})}
  };
  document.querySelector('#nav-manage').onclick=()=>window.openManage();
  document.querySelector('#quick-connect').onclick=()=>window.openManage({section:'account'});
  document.querySelector('#quick-sync').onclick=()=>startSync(true);
  document.querySelector('#data-refresh-note').textContent=window.hasLoadedData()?'暂显示本标签页上次读取的战绩，正在后台更新。':'';
  refresh().catch(()=>{});
  window.SalmonManage={refresh:async()=>{if(refreshing)await refreshing.catch(()=>{});needsData=true;await refresh()}};
  setInterval(()=>{if(!window.SalmonDiagnostics?.running)return refresh().catch(()=>{})},4000);
  setInterval(()=>{if(state){paintRetryButtons();if(dialog.open)paintAuth()}},1000);
})();
