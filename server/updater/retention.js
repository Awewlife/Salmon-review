import path from 'node:path';
import {lstat,realpath,readdir,rm} from 'node:fs/promises';
import {atomicJSON,json,treeHash} from './files.js';
import {compareVersions,versionPattern,repository} from './release.js';
const idPattern=/^[a-f0-9]{24}$/;
const digestPattern=/^[a-f0-9]{64}$/;
const imageVersion=tag=>/^salmon-review:(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
const warning='部分旧文件未能清理，已保留；当前版本可正常使用，将在下次检查更新时重试。';

export class Retention{
  constructor(directory,docker){this.directory=directory;this.docker=docker}
  file(name){return path.join(this.directory,name)}
  async state(){
    const state=await json(this.file('retention.json'),{format:1,current:null,previous:null,backups:[]});
    if(state.format!==1||!Array.isArray(state.backups)||state.backups.some(b=>!idPattern.test(b.id)||!digestPattern.test(b.sha256)||!Number.isSafeInteger(b.created)))throw new Error('invalid_retention');
    return state;
  }
  async record(journal){
    const state=await this.state();
    if(!journal.committed||!versionPattern.test(journal.version))throw new Error('uncommitted_retention');
    if(state.current!==journal.version){
      state.previous=versionPattern.test(journal.oldVersion)?journal.oldVersion:state.current;
      state.current=journal.version;
    }
    if(journal.backupComplete&&idPattern.test(journal.id)&&digestPattern.test(journal.backupDigest)&&Number.isSafeInteger(journal.created)&&!state.backups.some(b=>b.id===journal.id)){
      state.backups.push({id:journal.id,created:journal.created,sha256:journal.backupDigest,version:journal.oldVersion??null});
    }
    await atomicJSON(this.file('retention.json'),state);
  }
  async cleanup(){
    // Never prune around an in-flight update, including a committed journal awaiting recovery.
    if(await json(this.file('transaction.json')))return {pending:true,message:'更新恢复完成后再清理旧文件。'};
    const state=await this.state(),errors=[],result={images:0,backups:0,legacyBackups:0};
    try{result.images=await this.images(state)}catch{errors.push('images')}
    try{Object.assign(result,await this.backups(state))}catch{errors.push('backups')}
    return {...result,pending:errors.length>0,message:errors.length?warning:'',checked:Date.now()};
  }
  async images(state){
    if(!versionPattern.test(state.current)||!versionPattern.test(state.previous)||compareVersions(state.current,state.previous)<=0)return 0;
    const images=await this.docker.images({'label':[`org.opencontainers.image.source=https://github.com/${repository}`]});
    let removed=0;
    for(const summary of images){
      const tags=summary.RepoTags??[];
      // Ignore custom tags, other repositories, and ambiguous multi-tag images.
      if(tags.length!==1)continue;
      const tag=tags[0],version=imageVersion(tag);
      if(!version||compareVersions(version,state.previous)>=0)continue;
      const image=await this.docker.image(tag);
      if(image.Id!==summary.Id||image.Config?.Labels?.['org.opencontainers.image.source']!==`https://github.com/${repository}`||image.Config?.Labels?.['org.opencontainers.image.version']!==version)continue;
      // Include stopped containers from every project, not just this app's project.
      const containers=await this.docker.list({});
      let used=false;
      for(const c of containers){
        if(c.ImageID===image.Id||c.Image===tag||c.Image===image.Id){used=true;break}
        // Resolve aliases / manifest IDs too; uncertain references stop cleanup.
        if(!c.Image)throw new Error('unknown_container_image');
        if((await this.docker.image(c.Image)).Id===image.Id){used=true;break}
      }
      if(used)continue;
      // Never force deletion. Docker's own reference check handles concurrent use.
      if((await this.docker.image(tag)).Id!==image.Id)continue;
      await this.docker.removeImage(image.Id);removed++;
    }
    return removed;
  }
  async backups(state){
    const root=this.file('backups');
    let rootStat;try{rootStat=await lstat(root)}catch(e){if(e.code==='ENOENT')return {backups:0,legacyBackups:0};throw e}
    if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||await realpath(root)!==path.resolve(root))throw new Error('unsafe_backup_path');
    const entries=await readdir(root),known=new Set(state.backups.map(b=>b.id));
    const legacyBackups=entries.filter(name=>!known.has(name)).length;
    const ordered=[...state.backups].sort((a,b)=>b.created-a.created||b.id.localeCompare(a.id));
    const verified=[];
    // Recheck integrity before counting a backup towards the two recovery copies.
    for(const b of ordered){
      const target=path.join(root,b.id);
      if(!entries.includes(b.id))continue;
      const st=await lstat(target);
      if(!st.isDirectory()||st.isSymbolicLink()||await realpath(target)!==path.resolve(target))throw new Error('unsafe_backup_path');
      if(b.deleting)continue;
      if(await treeHash(target)!==b.sha256)throw new Error('backup_integrity');
      verified.push(b);
    }
    let removed=0;
    const expired=verified.length>=2?[...ordered.filter(b=>b.deleting),...verified.slice(2)]:[];
    for(const b of expired){
      const target=path.resolve(root,b.id);
      if(path.dirname(target)!==path.resolve(root))throw new Error('unsafe_backup_path');
      // Persist deletion intent so a partial filesystem failure can be retried safely.
      b.deleting=true;await atomicJSON(this.file('retention.json'),state);
      await rm(target,{recursive:true,force:true});
      state.backups=state.backups.filter(entry=>entry.id!==b.id);
      await atomicJSON(this.file('retention.json'),state);removed++;
    }
    return {backups:removed,legacyBackups};
  }
}
