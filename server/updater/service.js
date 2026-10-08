import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,chown,chmod,rm} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Docker,candidateConfig,sameProjectApp} from './docker.js';
import {atomicJSON,json,backupData,restoreData} from './files.js';
import {privateReleases,verifyAccess,compareVersions} from './release.js';
import {appHTTP} from './app-http.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const messages={release_missing:'目前还没有可用的私有更新。',release_limited:'下载源暂时限制请求，请稍后重试。',download_failed:'下载未完成，旧版继续运行；请检查网络后重试。',invalid_signature:'更新签名校验失败，已拒绝安装。',invalid_manifest:'此更新与当前安装方式不兼容，请下载完整安装包。',invalid_download:'下载文件校验失败，旧版继续运行。',disk_space:'磁盘空间不足，已停止更新。',project_mismatch:'无法确认原有项目和数据卷，已停止更新。',busy:'正在同步、导入或登录，请完成后重试更新。',no_update:'目前没有比当前版本更新的可安装版本。',unhealthy:'新版启动或数据检查未通过。',backup_failed:'数据备份未完成，已停止更新。',recovery_failed:'自动恢复未完成。已保留旧容器和备份，请勿删除数据卷；请查看 Docker 中更新组件日志并联系维护者。'};
function publicMessage(e){return messages[e?.message]??'更新未完成，请检查网络、磁盘空间和 Docker 状态后重试。'}
Object.assign(messages,{release_missing:'已连接私有仓库，目前还没有带网页更新附件的新版。',auth_required:'请先连接你自己的 GitHub 更新权限。',auth_invalid:'GitHub 凭据已失效或格式不正确，请重新连接。',access_denied:'无法访问私有发行版，请确认已接受仓库邀请，且凭据拥有所需权限。'});
export class Updater{
  constructor({directory='/updates',docker=new Docker(),releases,manifest,download,verify=verifyAccess,backup=backupData,restore=restoreData,attempts=45}={}){
    this.credential=null;
    const client=privateReleases(()=>this.credential?.token);
    Object.assign(this,{directory,docker,releases:releases??client.releases,manifest:manifest??client.manifest,download:download??client.download,verify,backup,restore,attempts});this.busy=false;this.info={phase:'idle',progress:0,message:messages.auth_required};this.latest=null;
  }
  file(name){return path.join(this.directory,name)}
  async save(patch){this.info={...this.info,...patch,updated:Date.now()};await atomicJSON(this.file('status.json'),this.info)}
  async discover(){
    const self=await this.docker.inspect(process.env.HOSTNAME);
    const project=self.Config.Labels?.['com.docker.compose.project'];if(!project)throw new Error('project_mismatch');
    const apps=await this.docker.list({label:[`com.docker.compose.project=${project}`,'com.docker.compose.service=app']});
    const active=apps.filter(a=>!a.Names.some(n=>n.includes('-rollback-')));
    if(active.length!==1)throw new Error('project_mismatch');
    const app=await this.docker.inspect(active[0].Id);sameProjectApp(self,app);return app;
  }
  async appCall(app,endpoint,body){
    const self=await this.docker.inspect(process.env.HOSTNAME),shared=Object.keys(app.NetworkSettings.Networks).find(n=>self.NetworkSettings.Networks[n]);
    const ip=app.NetworkSettings.Networks[shared]?.IPAddress;if(!ip)throw new Error('unhealthy');
    const response=await appHTTP(ip,'/api/update/'+endpoint,{body:body??{},token:this.token});
    if(response.status!==200)throw new Error(response.status===409?'busy':'unhealthy');return response.body;
  }
  async init(){
    await mkdir(this.directory,{recursive:true,mode:0o700});await mkdir(this.file('backups'),{recursive:true,mode:0o700});
    // App can read the channel token and installed version but cannot replace
    // the root-owned transaction journal or backup directory.
    await chown(this.directory,0,0);await chmod(this.directory,0o711);
    try{this.token=(await readFile(this.file('channel.token'),'utf8')).trim()}catch(e){if(e.code!=='ENOENT')throw e;this.token=randomBytes(32).toString('hex');await writeFile(this.file('channel.token'),this.token,{mode:0o600})}
    await chown(this.file('channel.token'),0,0);await chmod(this.file('channel.token'),0o444);
    this.info=await json(this.file('status.json'),this.info);
    this.credential=await json(this.file('github.json'));
    if(!this.credential&&!await json(this.file('transaction.json')))await this.save({phase:'idle',authRequired:true,available:false,latest:null,notes:null,url:null,checked:null,message:messages.auth_required});
    const journal=await json(this.file('transaction.json'));
    if(journal){this.busy=true;try{if(journal.committed){await this.finishCleanup(journal);await this.save({phase:'success',message:'更新完成。'})}else await this.recover(journal)}finally{this.busy=false}}
    else if(['checking','downloading','verifying','loading'].includes(this.info.phase))await this.save({phase:'failed',message:'上次更新已中断，旧版仍保留，可重新检查更新。'});
  }
  async check(){
    if(this.busy||this.info.phase==='blocked')return this.status();this.busy=true;
    try{
      await this.save({phase:'checking',message:'正在验证 GitHub 权限并检查私有发行版…'});
      const app=await this.discover(),current=app.Config.Labels?.['org.opencontainers.image.version'];
      this.latest=await this.releases();const {manifest:m,notes,url}=this.latest;
      const available=compareVersions(m.version,current)>0;
      await this.save({phase:available?'available':'idle',authRequired:false,current,latest:m.version,available,notes,url,checked:Date.now(),message:available?'发现新版，可以一键更新。':'当前已是最新版本。'});
    }catch(e){await this.save({phase:'failed',available:false,authRequired:['auth_required','auth_invalid','access_denied'].includes(e.message),latest:null,notes:null,url:null,checked:Date.now(),message:publicMessage(e)})}finally{this.busy=false}
    return this.status();
  }
  status(){const {phase,current,latest,available,notes,url,checked,message,progress,updated,authRequired}=this.info;return {enabled:true,phase,current,latest,available,notes,url,checked,message,progress,updated,busy:this.busy,auth:{connected:!!this.credential,login:this.credential?.login??null,required:!this.credential||!!authRequired}}}
  async authorize(token){
    if(this.busy||this.info.phase==='blocked')throw new Error('busy');
    if(typeof token!=='string'||!/^[-A-Za-z0-9_]{20,255}$/.test(token.trim()))throw new Error('auth_invalid');
    this.busy=true;
    try{
      token=token.trim();const {login}=await this.verify(token);
      await atomicJSON(this.file('github.json'),{token,login});await chmod(this.file('github.json'),0o600);
      this.credential={token,login};this.latest=null;
      await this.save({phase:'idle',authRequired:false,available:false,latest:null,notes:null,url:null,checked:null,message:'GitHub 更新权限已连接，可以检查新版。'});
      return {accepted:true};
    }catch(e){await this.save({message:publicMessage(e)});throw e}finally{this.busy=false}
  }
  async disconnect(){
    if(this.busy||this.info.phase==='blocked')throw new Error('busy');
    this.busy=true;
    try{await rm(this.file('github.json'),{force:true});this.credential=null;this.latest=null;
      await this.save({phase:'idle',authRequired:true,available:false,latest:null,notes:null,url:null,checked:null,message:'已移除本机 GitHub 凭据，现有版本和战绩仍可使用。'});return {accepted:true};
    }finally{this.busy=false}
  }
  async install(version){
    if(this.busy||this.info.phase==='blocked')throw new Error('busy');
    if(!this.info.available||version!==this.info.latest)throw new Error('no_update');
    this.busy=true;this.completion=this.run(version).finally(()=>{this.busy=false});return {accepted:true};
  }
  async run(version){
    let journal=null,old=null,prepared=false;
    const imageFile=this.file('download.tar.gz');
    try{
      await this.save({phase:'verifying',progress:0,available:false,message:'正在核对更新签名…'});
      const m=await this.manifest(version);old=await this.discover();
      if(compareVersions(m.version,old.Config.Labels['org.opencontainers.image.version'])<=0)throw new Error('no_update');
      await this.save({phase:'downloading',message:'正在下载新版，仍可使用当前版本。'});
      await this.download(m,imageFile,progress=>this.save({progress}));
      await this.save({phase:'loading',message:'文件已校验，正在导入镜像…'});await this.docker.load(imageFile);
      const image=await this.docker.image(m.image);
      if(!m.imageIds.includes(image.Id)||image.Os!=='linux'||image.Architecture!=='amd64'||image.Config.Labels?.['org.opencontainers.image.revision']!==m.commit||image.Config.Labels?.['org.opencontainers.image.version']!==m.version)throw new Error('invalid_download');
      old=await this.discover();
      const id=randomBytes(12).toString('hex');journal={id,oldId:old.Id,name:old.Name.slice(1),backup:this.file('backups/'+id),backupComplete:false,version,created:Date.now()};
      // Persist intent before locking writes, so a crash cannot leave the old
      // app locked without a recovery journal.
      await atomicJSON(this.file('transaction.json'),journal);
      const before=await this.appCall(old,'prepare');prepared=true;journal.before=before;
      await atomicJSON(this.file('transaction.json'),journal);
      await this.save({phase:'backing_up',message:'正在暂停写入并备份本机数据…'});
      await this.docker.stop(old.Id);await this.backup('/data',journal.backup);journal.backupComplete=true;await atomicJSON(this.file('transaction.json'),journal);
      await this.save({phase:'restarting',message:'正在启动新版，页面将自动重新连接…'});
      await this.docker.rename(old.Id,journal.name+'-rollback-'+id);
      const candidate=await this.docker.create(journal.name,candidateConfig(old,m,id));journal.newId=candidate.Id;await atomicJSON(this.file('transaction.json'),journal);
      await this.docker.start(candidate.Id);
      let ready=false;
      for(let i=0;i<this.attempts;i++){
        try{
          const app=await this.docker.inspect(candidate.Id);if(['dead','exited'].includes(app.State.Status))break;
          const validation=await this.appCall(app,'validate');
          if(validation.version===m.version&&validation.fingerprint===before.fingerprint&&validation.records===before.records&&validation.jobs===before.jobs&&validation.connected===before.connected){ready=true;break}
          throw new Error('unhealthy');
        }catch{}await sleep(2000);
      }
      if(!ready)throw new Error('unhealthy');
      // Commit before enabling writes: recovery must never discard new user data.
      journal.committed=true;await atomicJSON(this.file('transaction.json'),journal);
      await this.appCall(await this.docker.inspect(candidate.Id),'activate');
      await this.finishCleanup(journal);
      await this.save({phase:'success',current:version,available:false,progress:100,message:'更新成功，战绩和账号设置已保留。'});
    }catch(e){
      console.warn(JSON.stringify({event:'update_failed',code:messages[e.message]?e.message:'update_failed'}));
      if(journal){try{if(journal.committed){await this.appCall(await this.docker.inspect(journal.newId),'activate');await this.finishCleanup(journal);await this.save({phase:'success',current:version,message:'新版已启动，更新完成。'})}else await this.recover(journal,publicMessage(e))}catch{await this.save({phase:'blocked',message:messages.recovery_failed})}}
      else{if(prepared&&old)await this.appCall(old,'cancel').catch(()=>{});await this.save({phase:'failed',authRequired:['auth_required','auth_invalid','access_denied'].includes(e.message),message:publicMessage(e)})}
    }finally{await rm(imageFile,{force:true}).catch(()=>{})}
  }
  async finishCleanup(journal){
    // Keep the last backup on this computer; never publish it with releases.
    await atomicJSON(this.file('installed.json'),{version:journal.version,image:`salmon-review:${journal.version}`});
    await chmod(this.file('installed.json'),0o444);
    if(journal.newId)await this.appCall(await this.docker.inspect(journal.newId),'activate');
    await this.docker.remove(journal.oldId).catch(()=>{});
    await rm(this.file('transaction.json'),{force:true});
  }
  async recover(journal,reason='上次更新中断。'){
    await this.save({phase:'rolling_back',message:reason+' 正在恢复旧版…'});
    const candidates=await this.docker.list({label:[`salmon-review.update-transaction=${journal.id}`]});
    for(const c of candidates){const app=await this.docker.inspect(c.Id);if(app.State.Running)await this.docker.stop(c.Id);await this.docker.remove(c.Id)}
    const old=await this.docker.inspect(journal.oldId);
    if(old.State.Running&&journal.backupComplete)await this.docker.stop(old.Id);
    if(journal.backupComplete)await this.restore('/data',journal.backup);
    if(old.Name!=='/'+journal.name)await this.docker.rename(old.Id,journal.name);
    if(!old.State.Running||journal.backupComplete)await this.docker.start(old.Id);
    let restored=false;
    for(let i=0;i<20;i++){try{await this.appCall(await this.docker.inspect(old.Id),'cancel');restored=true;break}catch{}await sleep(1000)}
    if(!restored)throw new Error('recovery_failed');
    await rm(this.file('transaction.json'),{force:true});
    await this.save({phase:'failed',available:false,message:reason+' 已恢复旧版和更新前的数据，可继续使用。'});
  }
}
export async function serve(updater){
  await updater.init();
  const server=http.createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
    const actual=Buffer.from(String(req.headers['x-salmon-updater']??'')),expected=Buffer.from(updater.token);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(403,{message:'forbidden'});
    try{
      if(req.method==='GET'&&req.url==='/status')return send(200,updater.status());
      if(req.method!=='POST')return send(404,{message:'not_found'});
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024)return send(413,{message:'too_large'})}
      const body=JSON.parse(raw||'{}');
      if(req.url==='/authorize')return send(200,await updater.authorize(body.token));
      if(req.url==='/disconnect')return send(200,await updater.disconnect());
      if(req.url==='/check'){if(!updater.busy)void updater.check();return send(202,{accepted:true})}
      if(req.url==='/install')return send(202,await updater.install(body.version));
      send(404,{message:'not_found'});
    }catch(e){send(409,{message:publicMessage(e)})}
  });
  server.listen(8790,'0.0.0.0');
  const timer=setInterval(()=>{if(process.env.SALMON_UPDATE_AUTO_CHECK!=='0'&&updater.credential&&!updater.busy&&updater.info.phase!=='blocked'&&Date.now()-(updater.info.checked??0)>24*3600*1000)void updater.check()},60000);timer.unref();
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await serve(new Updater());
