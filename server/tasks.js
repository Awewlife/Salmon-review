import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {classify,messages} from './errors.js';
export function workerCall(input,onEvent=()=>{},timeoutMs=15*60*1000){
  return new Promise((resolve,reject)=>{
    const child=fork(fileURLToPath(new URL('./worker.js',import.meta.url)),[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,DEBUG:'',NODE_OPTIONS:''}});
    let finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();error?reject(error):resolve(value)};
    const timer=setTimeout(()=>finish(new Error('interrupted')),timeoutMs);
    child.on('message',async message=>{
      if(message.type==='result')return finish(null,message.value);
      if(message.type==='error')return finish(Object.assign(new Error(message.value.code),message.value));
      try{await onEvent(message.type,message.value);if(child.connected)child.send({type:'ack',seq:message.seq})}
      catch(error){finish(error)}
    });
    child.on('error',()=>finish(new Error('internal')));
    child.on('exit',()=>finish(new Error('interrupted')));
    child.send({type:'start',value:input});
  });
}
export class Tasks{
  constructor(store,account,runner=workerCall){this.store=store;this.account=account;this.runner=runner;this.active=false;this.authBusy=false;this.timer=null}
  status(){const last=this.store.db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get()??null;return {active:this.active,last,lastSuccess:this.store.get('lastSuccess'),nextAttempt:this.store.get('nextAttempt',0),autoMinutes:this.store.get('autoMinutes',0),paused:this.store.get('paused',null)}}
  start(){
    if(this.active||this.authBusy)throw new Error('busy');
    if(!this.account.read())throw new Error('auth_required');
    if(Date.now()<this.store.get('nextAttempt',0))throw new Error('cooldown');
    this.active=true;
    const id=Number(this.store.db.prepare("INSERT INTO runs(kind,state,started) VALUES('sync','running',?)").run(new Date().toISOString()).lastInsertRowid);
    this.store.set('nextAttempt',Date.now()+60000);this.store.set('paused',null);
    this.completion=this.run(id);return {id};
  }
  async run(id){
    let summary=null;
    try{
      await this.runner({action:'sync',credentials:this.account.read(),exportDirectory:path.join(this.store.directory,'exports'),known:this.store.db.prepare('SELECT id FROM records').all().map(r=>r.id)},(type,value)=>{
        if(type==='summary')summary=value;
        if(type==='record'){
          const result=this.store.import(summary?[summary,value]:[value]);
          this.store.db.prepare('UPDATE runs SET added=added+? WHERE id=?').run(result.added,id);
        }
        if(type==='progress')this.store.db.prepare('UPDATE runs SET done=?,total=? WHERE id=?').run(value.done,value.total,id);
      });
      if(summary)this.store.import([summary]);
      this.store.db.prepare("UPDATE runs SET state='success',finished=? WHERE id=?").run(new Date().toISOString(),id);
      this.store.set('lastSuccess',new Date().toISOString());this.store.set('failures',0);
    }catch(error){
      const code=classify(error),failures=this.store.get('failures',0)+1;this.store.set('failures',failures);
      this.store.db.prepare("UPDATE runs SET state='failed',finished=?,error=? WHERE id=?").run(new Date().toISOString(),code,id);
      const wait=code==='rate_limited'?Math.max(15*60,Number(error.retryAfter)||0):Math.min(6*3600,300*2**Math.min(failures-1,6));
      this.store.set('nextAttempt',Date.now()+wait*1000);
      if(!['network','rate_limited','interrupted'].includes(code))this.store.set('paused',code);
      console.warn(JSON.stringify({event:'sync_failed',id,code,message:messages[code]}));
    }finally{this.active=false}
  }
  schedule(){this.timer=setInterval(()=>{
    const minutes=this.store.get('autoMinutes',0),last=this.store.db.prepare('SELECT started FROM runs ORDER BY id DESC LIMIT 1').get();
    if(minutes&&!this.active&&!this.authBusy&&!this.store.get('paused')&&Date.now()>=this.store.get('nextAttempt',0)&&(!last||Date.now()-Date.parse(last.started)>=minutes*60000)){
      try{this.start()}catch(error){if(['auth_required'].includes(classify(error)))this.store.set('paused',classify(error))}
    }
  },15000);this.timer.unref()}
  stop(){clearInterval(this.timer)}
}
