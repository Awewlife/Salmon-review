'use strict';
(()=>{
  const number=v=>Number.isFinite(v)&&v>=0?v:null;
  const bool=v=>typeof v==='boolean'?v:null;
  const choice=(v,values)=>values.includes(v)?v:'unknown';
  const version=v=>typeof v==='string'&&/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(v)&&v.length<50?v:null;
  const stamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
  const errors=['auth_required','upstream_disabled','rate_limited','network','upstream','interrupted','busy','cooldown','forbidden','internal','disk','account_mismatch'];
  const phases=['idle','checking','available','verifying','downloading','loading','handoff','updating_updater','backing_up','restarting','success','failed','blocked','rolling_back','cancelled','cancelling'];
  const reasons={auth_required:'需要重新连接账号',upstream_disabled:'上游暂时禁止认证',rate_limited:'请求受限，请遵守等待时间',network:'上次任务遇到网络错误',upstream:'上游接口异常或版本不兼容',interrupted:'上次任务中断',disk:'磁盘空间或访问权限异常',account_mismatch:'账号与本地战绩不一致',unknown:'原因未提供或未识别',timeout:'请求超时',cancelled:'已取消',invalid_response:'返回格式异常',http_error:'接口返回错误',database_read_failed:'数据库读取失败',unavailable:'不可用'};
  const updateReasons=[['auth_required','请先连接你自己的 GitHub 更新权限。'],['auth_invalid','GitHub 凭据已失效或格式不正确，请重新连接。'],['access_denied','无法访问私有发行版，请确认已接受仓库邀请，且凭据拥有所需权限。'],['download_failed','下载未完成，旧版继续运行；请检查网络后重试。'],['invalid_manifest','此更新与当前安装方式不兼容，请下载完整安装包。'],['busy','正在同步、导入或登录，请完成后重试更新。'],['disk_space','磁盘空间不足，已停止更新。'],['invalid_signature','更新签名校验失败，已拒绝安装。'],['invalid_download','下载文件校验失败，旧版继续运行。'],['backup_failed','数据备份未完成，已停止更新。'],['unhealthy','新版启动或数据检查未通过。'],['release_limited','下载源暂时限制请求，请稍后重试。'],['release_missing','已连接私有仓库，目前还没有带网页更新附件的新版。'],['project_mismatch','无法确认原有项目和数据卷，已停止更新。'],['recovery_failed','自动恢复未完成。已保留旧容器和备份，请勿删除数据卷；请查看 Docker 中更新组件日志并联系维护者。']];
  const safeStatus=v=>{
    if(!v||!version(v.version)||!Number.isFinite(v.records)||!v.sync)throw new Error('invalid_response');
    const s=v.sync,r=s.last;
    return {version:version(v.version),records:number(v.records),connected:bool(v.connected),lastImport:stamp(v.lastImport),sync:{active:bool(s.active),autoMinutes:number(s.autoMinutes),paused:s.paused?choice(s.paused,errors):null,lastSuccess:stamp(s.lastSuccess),nextAttempt:number(s.nextAttempt),manualNextAttempt:number(s.manualNextAttempt),rateLimitedUntil:number(s.rateLimitedUntil),last:r?{state:choice(r.state,['running','success','failed','interrupted']),started:stamp(r.started),finished:stamp(r.finished),done:number(r.done),total:number(r.total),added:number(r.added),error:r.error?choice(r.error,errors):null}:null}};
  };
  const safeServer=v=>{
    if(!v?.runtime||!v.database||!v.storage)throw new Error('invalid_response');
    const d=v.database,s=v.storage,r=v.runtime,fs=['EACCES','EPERM','ENOENT','ENOSPC','EROFS','unavailable'];
    return {runtime:{node:version(r.node),platform:choice(r.platform,['linux','win32','darwin']),arch:choice(r.arch,['x64','arm64','arm','ia32']),uptimeSeconds:number(r.uptimeSeconds),rssBytes:number(r.rssBytes)},updaterConfigured:bool(v.updaterConfigured),database:{ok:bool(d.ok),code:d.code?choice(d.code,['database_read_failed']):null,records:number(d.records),summaries:number(d.summaries),shifts:number(d.shifts),assets:number(d.assets),schemaVersion:number(d.schemaVersion),elapsedMs:number(d.elapsedMs)},storage:{databaseBytes:number(s.databaseBytes),freeBytes:number(s.freeBytes),totalBytes:number(s.totalBytes),permissions:bool(s.permissions),fileCode:s.fileCode?choice(s.fileCode,fs):null,spaceCode:s.spaceCode?choice(s.spaceCode,fs):null,permissionCode:s.permissionCode?choice(s.permissionCode,fs):null}};
  };
  const safeData=v=>{
    if(!v||!Array.isArray(v.jobs)||!Array.isArray(v.shifts)||typeof v.player!=='string')throw new Error('invalid_response');
    const ids=new Set(v.shifts.map(s=>s.id));
    if(!v.jobs.every(j=>j&&Array.isArray(j.players)&&j.players.length&&ids.has(j.shift)))throw new Error('invalid_response');
    return {jobs:v.jobs.length,shifts:v.shifts.length,chartRecords:Array.isArray(v.chartJobs)?v.chartJobs.length:null,excluded:Array.isArray(v.excluded)?v.excluded.length:null};
  };
  const safeUpdate=v=>{
    if(!v||typeof v.enabled!=='boolean')throw new Error('invalid_response');
    const reason=updateReasons.find(([,text])=>typeof v.message==='string'&&v.message.startsWith(text))?.[0]??(v.phase==='failed'||v.phase==='blocked'?'unknown':null);
    return {enabled:v.enabled,phase:choice(v.phase,phases),busy:bool(v.busy),current:version(v.current),latest:version(v.latest),available:bool(v.available),progress:number(v.progress),updated:number(v.updated),checked:number(v.checked),reason,connected:bool(v.auth?.connected),authRequired:bool(v.auth?.required),canCancel:bool(v.canCancel),cleanupPending:bool(v.cleanup?.pending)};
  };
  const specs=[{id:'service',name:'本地服务与同步状态',url:'/api/status',timeout:5000,sanitize:safeStatus},{id:'storage',name:'数据库与存储',url:'/api/diagnostics',timeout:8000,sanitize:safeServer},{id:'data',name:'战绩读取与格式校验',url:'/api/data',timeout:30000,sanitize:safeData},{id:'update',name:'本地更新组件',url:'/api/update/status',timeout:8000,sanitize:safeUpdate}];
  const browserInfo=(ua='')=>{
    const match=ua.match(/(Edg)\/(\d+)/)||ua.match(/(Firefox|Chrome)\/(\d+)/)||ua.match(/Version\/(\d+).*Safari\//);
    return {family:match?(match[1]==='Edg'?'Edge':/^\d+$/.test(match[1])?'Safari':match[1]):'unknown',major:match?Number(/^\d+$/.test(match[1])?match[1]:match[2]):null,os:/Windows/.test(ua)?'Windows':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'unknown'};
  };
  function assess(id,d){
    if(id==='service')return !d.connected||d.sync.paused||['failed','interrupted'].includes(d.sync.last?.state)?'warning':'ok';
    if(id==='storage')return d.database.ok!==true||d.storage.permissions===false?'failed':d.storage.freeBytes===null||d.storage.freeBytes<1024**3||d.storage.permissions===null?'warning':'ok';
    if(id==='update')return !d.enabled||d.authRequired||d.reason||d.cleanupPending?'warning':'ok';
    return 'ok';
  }
  async function probe(spec,{fetcher,signal,timeoutMs=spec.timeout}){
    const controller=new AbortController();let timeout=false;
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted)cancel();
    const timer=setTimeout(()=>{timeout=true;controller.abort()},timeoutMs);
    try{
      const r=await fetcher(spec.url,{signal:controller.signal,cache:'no-store'});
      if(!r.ok)return {status:'failed',code:'http_error',httpStatus:r.status};
      let payload;try{payload=await r.json()}catch(error){if(controller.signal.aborted)throw error;throw new Error('invalid_response')}
      const details=spec.sanitize(payload);return {status:assess(spec.id,details),httpStatus:r.status,details};
    }catch(e){return {status:signal?.aborted?'cancelled':'failed',code:signal?.aborted?'cancelled':timeout?'timeout':e?.message==='invalid_response'?'invalid_response':'network'}}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
  }
  async function collect({fetcher=fetch,signal,onProgress=()=>{},context={},timeoutMs}={}){
    const report={schemaVersion:1,generatedAt:new Date().toISOString(),finishedAt:null,state:'running',browser:browserInfo(context.userAgent),displayCachePresent:bool(context.displayCachePresent),checks:[]};
    for(const spec of specs){
      if(signal?.aborted){report.checks.push({id:spec.id,status:'skipped',code:'cancelled'});continue}
      if(spec.id==='data'&&report.checks[0]?.status==='failed'){report.checks.push({id:spec.id,status:'skipped',code:'service_unavailable'});onProgress(report);continue}
      const check={id:spec.id,status:'running',startedAt:new Date().toISOString(),elapsedMs:0};report.checks.push(check);onProgress(report);
      const start=performance.now();Object.assign(check,await probe(spec,{fetcher,signal,timeoutMs}),{elapsedMs:Math.round(performance.now()-start)});if(spec.id==='data'&&check.status==='ok'&&check.elapsedMs>3000)check.status='warning';onProgress(report);
    }
    report.state=signal?.aborted?'cancelled':'complete';report.finishedAt=new Date().toISOString();onProgress(report);return report;
  }
  window.SalmonDiagnosticReport={safeStatus,safeServer,safeData,safeUpdate,browserInfo,collect};
  if(typeof document==='undefined')return;
  const dialog=document.querySelector('#diagnostic-dialog');let report=null,running=false,controller=null,ticker=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'无记录';
  const size=n=>n===null?'未知':n>=1024**3?(n/1024**3).toFixed(1)+' GiB':(n/1024**2).toFixed(1)+' MiB';
  const phaseNames={idle:'空闲',checking:'检查版本',available:'有新版',verifying:'校验签名',downloading:'下载',loading:'导入镜像',handoff:'交接更新助手',updating_updater:'更新组件',backing_up:'备份数据',restarting:'启动新版',success:'完成',failed:'失败',blocked:'恢复受阻',rolling_back:'恢复旧版',cancelled:'已取消',cancelling:'取消中',unknown:'未提供'};
  function detail(c){
    if(c.status==='running')return '正在读取，请稍候…';
    if(c.code)return `${reasons[c.code]??(c.code==='service_unavailable'?'本地服务未响应，跳过战绩读取':'检查未完成')}${c.httpStatus?'（HTTP '+c.httpStatus+'）':''}。`;
    const d=c.details;if(!d)return '';
    if(c.id==='service'){
      const s=d.sync,r=s.last,elapsed=r?.started?Math.max(0,((r.finished?Date.parse(r.finished):Date.now())-Date.parse(r.started))/1000):null;
      return `版本 ${d.version} · 已保存 ${d.records} 场 · ${d.connected?'已保存账号连接':'未连接账号'}。${s.active?'同步进行中':'当前未在同步'}${r?`；最近任务 ${{running:'进行中',success:'完成',failed:'失败',interrupted:'中断',unknown:'未知'}[r.state]}，${r.done??0}/${r.total??0}，耗时 ${elapsed===null?'未知':elapsed.toFixed(1)+' 秒'}`:''}。${r?.error?'最近失败原因：'+(reasons[r.error]??r.error)+'。':''}${s.paused?'自动同步暂停：'+(reasons[s.paused]??s.paused)+'。':''}上次成功：${date(s.lastSuccess)}。${s.manualNextAttempt>Date.now()?'手动重试时间：'+date(s.manualNextAttempt)+'。':''}连接状态未向上游重新验证。`;
    }
    if(c.id==='storage')return `数据库读取${d.database.ok?'正常':'失败'}（${d.database.elapsedMs??'未知'} ms），数据库 ${size(d.storage.databaseBytes)}，数据卷可用 ${size(d.storage.freeBytes)}。读写权限${d.storage.permissions===true?'检查通过':d.storage.permissions===false?'检查失败':'未知'}${d.storage.permissionCode?'（'+d.storage.permissionCode+'）':''}。权限检查未实际写入；可用空间属于容器所在文件系统。`;
    if(c.id==='data')return `读取并校验完成：${d.jobs} 场可统计、${d.shifts} 期排班、${d.excluded??'未知'} 条未纳入统计。${c.elapsedMs>3000?'读取超过 3 秒，可重试比较耗时。':''}诊断不会替换当前显示的战绩。`;
    const configured=report?.checks.find(x=>x.id==='storage')?.details?.updaterConfigured;
    if(!d.enabled)return configured===false?'此安装方式未启用网页更新。':'未能确认更新组件状态，请检查 Docker 中的 updater 容器。';
    const reason=updateReasons.find(([code])=>code===d.reason)?.[1];
    return `阶段：${phaseNames[d.phase]} · ${d.busy?'任务进行中':'当前空闲'}${d.busy&&['verifying','downloading','loading','handoff','updating_updater','backing_up','restarting'].includes(d.phase)&&d.progress!==null?' · 进度 '+Math.min(100,d.progress)+'%':''}。${d.authRequired?'需要连接 GitHub 更新权限。':''}${reason??(d.reason?'未能识别失败原因。':'')}${d.updated?'状态更新于 '+date(d.updated)+'。':''}${d.cleanupPending?'旧文件清理尚未完成。':''}本次只读取组件状态，未请求下载源。`;
  }
  function paint(){
    document.querySelector('#diagnostic-run').disabled=running;
    document.querySelector('#diagnostic-cancel').hidden=!running;
    document.querySelector('#diagnostic-export').disabled=!report;
    document.querySelector('#diagnostic-summary').textContent=!report?'检查只读取本机状态，不会触发同步、登录或更新。':running?'诊断进行中，可随时取消或导出当前结果。':report.state==='cancelled'?'已取消；已完成的检查仍可导出。':`诊断完成：${report.checks.filter(c=>c.status==='failed').length} 项失败，${report.checks.filter(c=>c.status==='warning').length} 项需留意。`;
    const names={running:'检查中',ok:'正常',warning:'需留意',failed:'失败',cancelled:'已取消',skipped:'未检查'};
    document.querySelector('#diagnostic-results').innerHTML=(report?.checks??[]).map(c=>`<li class="diagnostic-item ${c.status}"><div><strong>${specs.find(s=>s.id===c.id).name}</strong><span>${names[c.status]} · ${((c.status==='running'?Date.now()-Date.parse(c.startedAt):c.elapsedMs??0)/1000).toFixed(1)} 秒</span></div><p>${esc(detail(c))}</p></li>`).join('');
  }
  async function run(){
    if(running)return;running=true;controller=new AbortController();report=null;
    ticker=setInterval(paint,500);paint();
    try{report=await collect({signal:controller.signal,context:{userAgent:navigator.userAgent,displayCachePresent:!!window.hasLoadedData?.()},onProgress:value=>{report=value;paint()}})}
    finally{running=false;clearInterval(ticker);paint()}
  }
  function download(){
    if(!report)return;
    const snapshot=JSON.stringify(report,null,2),url=URL.createObjectURL(new Blob([snapshot],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='salmon-review-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  window.SalmonDiagnostics={get running(){return running},open(){
    if(!dialog.innerHTML){dialog.innerHTML=`<header class="manage-header"><div><div class="eyebrow">LOCAL DIAGNOSTICS</div><h2 id="diagnostic-title">一键诊断</h2></div><button class="close-chat" id="diagnostic-close" aria-label="关闭诊断">×</button></header><div class="manage-body"><p>导出仅含版本、数量、耗时和状态码，不含账号令牌、昵称、战绩明细、路径或原始日志。报告只下载到本机，不会自动上传。</p><div class="diagnostic-actions"><button class="button primary" id="diagnostic-run">开始 / 重新诊断</button><button class="button" id="diagnostic-cancel" hidden>取消诊断</button><button class="button" id="diagnostic-export" disabled>导出诊断信息</button></div><p id="diagnostic-summary" role="status" aria-live="polite"></p><ol id="diagnostic-results"></ol><div class="diagnostic-actions"><button class="button" id="diagnostic-refresh">重新读取战绩</button><button class="button" id="diagnostic-sync">前往同步设置</button><button class="button" id="diagnostic-update">查看版本与更新</button></div><p id="diagnostic-action-status" role="status"></p><p>若服务无响应：先检查 Docker Desktop 与 app 容器是否运行。不要删除数据卷；可先导出本页的超时结果。</p></div>`;
      dialog.querySelector('#diagnostic-close').onclick=()=>dialog.close();dialog.querySelector('#diagnostic-run').onclick=run;dialog.querySelector('#diagnostic-cancel').onclick=()=>controller?.abort();dialog.querySelector('#diagnostic-export').onclick=download;
      dialog.querySelector('#diagnostic-refresh').onclick=async e=>{const button=e.currentTarget,status=dialog.querySelector('#diagnostic-action-status');button.disabled=true;status.textContent='正在重新读取战绩…';try{await window.SalmonManage.refresh();status.textContent='战绩读取完成。'}catch{status.textContent='读取未完成，现有战绩保留。可以重新诊断并导出结果。'}finally{button.disabled=false}};
      dialog.querySelector('#diagnostic-sync').onclick=()=>{dialog.close();window.openManage({section:'sync'})};dialog.querySelector('#diagnostic-update').onclick=()=>window.SalmonUpdates?.open();
      dialog.addEventListener('close',()=>controller?.abort());
    }
    if(!dialog.open)dialog.showModal();paint();if(!report&&!running)void run();
  }};
})();
