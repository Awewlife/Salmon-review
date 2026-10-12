import {Updater} from './service.js';
import {json} from './files.js';

// Exactly one named Docker container owns each bundle. Restarting an interrupted
// helper recovers the recorded transaction; it never repeats a fresh install.
const u=new Updater({helper:true});
await u.init();
const state=await json(u.bundle.file());
async function retire(){await u.docker.update(process.env.HOSTNAME,{RestartPolicy:{Name:'no',MaximumRetryCount:0}});process.exit(0)}
if(!state||state.id!==process.argv[2])await retire();
const self=await u.docker.inspect(process.env.HOSTNAME);
if(self.Name!=='/'+state.helperName||self.Config.Labels['salmon-review.bundle-helper']!==state.id)throw new Error('project_mismatch');
u.bundleState=state;
try{
  const journal=await json(u.file('transaction.json'));
  if(journal){
    if(journal.committed){await u.finishCleanup(journal);await u.save({phase:'success',current:state.manifest.version,available:false,progress:100,message:'主程序和更新组件已更新，战绩和账号设置已保留。'})}
    else await u.recover(journal);
  }else if(state.committed){
    await u.save({phase:'success',current:state.manifest.version,available:false,progress:100,message:'主程序和更新组件已更新，战绩和账号设置已保留。'});
  }else if(state.started){
    // Failure before the app journal was created never touched application data.
    await u.bundle.removeNew(state);await u.bundle.restore(state);
    await u.save({phase:'failed',available:false,message:'上次更新中断，已保留原有版本，可以重试。'});
  }else{
    state.started=true;await u.bundle.save(state);
    u.manifest=async()=>state.manifest;
    await u.run(state.manifest.version,new AbortController().signal);
  }
  if(u.info.phase!=='blocked')await u.bundle.finish(state);
}catch{
  await u.save({phase:'blocked',message:'自动恢复未完成，已保留旧容器和备份。请勿删除数据卷，请导出诊断信息并联系维护者。'});
}

// Close HTTP keep-alive handles and disable restart only after durable completion
// (or an explicitly blocked transaction that requires operator diagnosis).
await retire();
