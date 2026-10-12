import {rm} from 'node:fs/promises';
import {appHTTP} from './app-http.js';
import {atomicJSON,json} from './files.js';
import {componentConfig,sameProjectUpdater,helperConfig} from './docker.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const bundleProtocol=2;
// The helper runs the installed coordinator, pinned by image ID. New application
// code is not trusted with the transaction until both trial services validate.
export class Bundle {
  constructor(updater){this.u=updater;this.docker=updater.docker}
  file(){return this.u.file('bundle.json')}
  async save(state){await atomicJSON(this.file(),state)}
  async begin(manifest,imageId){
    const self=await this.docker.inspect(process.env.HOSTNAME),app=await this.u.discover();
    sameProjectUpdater(self,app);
    const id=(await import('node:crypto')).randomBytes(12).toString('hex');
    const state={id,manifest,imageId,oldId:self.Id,name:self.Name.slice(1),appId:app.Id,project:self.Config.Labels['com.docker.compose.project'],helperImage:self.Image,helperName:self.Name.slice(1)+'-helper-'+id,created:Date.now()};
    await this.u.save({phase:'handoff',message:'正在交接更新助手，将一并更新主程序和更新组件…'});
    await this.save(state);
    // From here the durable bundle is the lock. Only the helper writes status,
    // app journals or credentials; the two service generations are read-only.
    this.u.delegated=true;
    await this.ensureHelper(state);
  }
  async ensureHelper(state){
    let helper;
    try{helper=await this.docker.inspect(state.helperName)}catch(e){if(e.message!=='docker_404')throw e}
    if(!helper){
      const old=await this.docker.inspect(state.oldId),app=await this.docker.inspect(state.appId);
      sameProjectUpdater(old,app);
      try{await this.docker.create(state.helperName,helperConfig(old,state))}catch(e){if(e.message!=='docker_409')throw e}
      helper=await this.docker.inspect(state.helperName);
    }
    if(helper.Config.Labels?.['salmon-review.bundle-helper']!==state.id||helper.Config.Labels?.['com.docker.compose.project']!==state.project||helper.Config.Image!==state.helperImage)throw new Error('project_mismatch');
    if(helper.State.Status==='created')await this.docker.start(helper.Id);
    // Docker restarts interrupted helpers, including after a daemon reboot. A clean exit with a blocked journal is
    // deliberately retained for diagnosis instead of endlessly restoring data.
  }
  async refresh(){
    const state=await json(this.file());
    if(state){
      this.u.delegated=true;this.u.busy=true;
      this.u.info=await json(this.u.file('status.json'),this.u.info);
      if(this.u.info.phase!=='blocked')await this.ensureHelper(state);
    }else if(this.u.delegated){
      this.u.info=await json(this.u.file('status.json'),this.u.info);
      this.u.credential=await json(this.u.file('github.json'));
      this.u.delegated=false;this.u.busy=false;
    }
  }
  async replace(state){
    const old=await this.docker.inspect(state.oldId);
    sameProjectUpdater(old,await this.u.discover());
    await this.u.save({phase:'updating_updater',message:'主程序已通过检查，正在更新并检查更新组件…'});
    await this.docker.stop(old.Id);
    await this.docker.rename(old.Id,state.name+'-rollback-'+state.id);
    const candidate=await this.docker.create(state.name,componentConfig(old,{...state.manifest,image:state.imageId},state.id));
    state.newId=candidate.Id;await this.save(state);
    await this.docker.start(candidate.Id);
    for(let i=0;i<this.u.attempts;i++){
      try{
        const status=await this.statusOf(await this.docker.inspect(candidate.Id));
        if(status.updaterVersion===state.manifest.version&&status.bundleProtocol===bundleProtocol&&status.busy&&status.auth.connected===!!this.u.credential&&status.auth.login===(this.u.credential?.login??null)){
          const app=await this.u.discover(),self=await this.docker.inspect(process.env.HOSTNAME);
          const shared=Object.keys(self.NetworkSettings.Networks).find(n=>app.NetworkSettings.Networks[n]?.IPAddress);
          const linked=await appHTTP(app.NetworkSettings.Networks[shared]?.IPAddress,'/api/update/status');
          if(linked.status===200&&linked.body.updaterVersion===state.manifest.version&&linked.body.bundleProtocol===bundleProtocol)return;
        }
      }catch{}
      await sleep(2000);
    }
    throw new Error('unhealthy');
  }
  async statusOf(container){
    const self=await this.docker.inspect(process.env.HOSTNAME);
    const shared=Object.keys(self.NetworkSettings.Networks).find(n=>container.NetworkSettings.Networks[n]?.IPAddress);
    const ip=container.NetworkSettings.Networks[shared]?.IPAddress;
    if(!ip)throw new Error('unhealthy');
    const response=await fetch(`http://${ip}:8790/status`,{headers:{'X-Salmon-Updater':this.u.token},signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('unhealthy');return response.json();
  }
  async commit(state){state.committed=true;await this.save(state)}
  async removeNew(state){
    const candidates=await this.docker.list({label:[`com.docker.compose.project=${state.project}`,`salmon-review.bundle-candidate=${state.id}`]});
    for(const item of candidates){
      const c=await this.docker.inspect(item.Id);
      if(c.Config.Labels['com.docker.compose.service']!=='updater')throw new Error('project_mismatch');
      if(c.State.Running)await this.docker.stop(c.Id);await this.docker.remove(c.Id);
    }
  }
  async restore(state){
    const old=await this.docker.inspect(state.oldId);
    if(old.Name!=='/'+state.name)await this.docker.rename(old.Id,state.name);
    if(!old.State.Running)await this.docker.start(old.Id);
    for(let i=0;i<this.u.attempts;i++){
      try{const s=await this.statusOf(await this.docker.inspect(old.Id));if(s.bundleProtocol===bundleProtocol)return}catch{}
      await sleep(1000);
    }
    throw new Error('recovery_failed');
  }
  async finish(state){
    if(state.committed){
      // Idempotent after a crash following application activation.
      await this.docker.remove(state.oldId).catch(e=>{if(e.message!=='docker_404')throw e});
    }
    await rm(this.file(),{force:true});
  }
  async cleanupHelpers(){
    if(await json(this.file())||await json(this.u.file('transaction.json')))return;
    const self=await this.docker.inspect(process.env.HOSTNAME),project=self.Config.Labels?.['com.docker.compose.project'];
    if(!project)return;
    const helpers=await this.docker.list({label:[`com.docker.compose.project=${project}`,'com.docker.compose.service=update-helper']});
    for(const item of helpers){
      const c=await this.docker.inspect(item.Id);
      if(c.State.Status==='exited'&&/^[a-f0-9]{24}$/.test(c.Config.Labels?.['salmon-review.bundle-helper']??''))await this.docker.remove(c.Id);
    }
  }
}
