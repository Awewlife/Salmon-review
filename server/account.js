import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,rmSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {launchCli,cliError,validateCallback} from './nxapi-cli.js';

export class CliAccount{
  constructor(directory,{launch=launchCli,ttl=10*60*1000,completeTimeout=120000}={}){
    this.root=path.resolve(directory,'nxapi');this.file=path.join(this.root,'account.json');
    this.launch=launch;this.ttl=ttl;this.completeTimeout=completeTimeout;this.pending=null;
    mkdirSync(this.root,{recursive:true,mode:0o700});
    // Clean only abandoned login profiles, never archived records or active credentials.
    const active=this.read()?.profile;
    for(const name of readdirSync(this.root))if(/^profile-[a-f0-9-]{36}$/.test(name)&&path.join(this.root,name)!==active)this.remove(path.join(this.root,name));
  }
  read(){
    if(!existsSync(this.file))return null;
    const {name}=JSON.parse(readFileSync(this.file,'utf8'));
    if(!/^profile-[a-f0-9-]{36}$/.test(name))throw new Error('disk');
    const profile=path.join(this.root,name);
    return existsSync(profile)?{backend:'nxapi-cli',profile}:null;
  }
  remove(profile){
    // Resolve and check the final target before any recursive removal.
    const target=path.resolve(profile);
    if(path.dirname(target)!==this.root||!/^profile-[a-f0-9-]{36}$/.test(path.basename(target)))throw new Error('disk');
    rmSync(target,{recursive:true,force:true});
  }
  async cancel(){
    const pending=this.pending;if(!pending)return;
    this.pending=null;clearTimeout(pending.timer);pending.child.kill();
    await pending.finished;this.remove(pending.profile);
  }
  async start(){
    await this.cancel();
    const profile=path.join(this.root,'profile-'+randomUUID());mkdirSync(profile,{mode:0o700});
    const child=this.launch(profile,['nso','auth','--select']);
    let resolveReady,rejectReady,resolveDone,settled=false,stdout='',stderr='',launchError=false;
    const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
    const finished=new Promise(resolve=>resolveDone=resolve);
    const pending={child,profile,finished,url:null,expires:Date.now()+this.ttl,timer:null,submitted:false};
    this.pending=pending;
    child.stdout.on('data',chunk=>{
      if(pending.url)return; // Ignore all later output, including session tokens.
      stdout=(stdout+chunk.toString()).slice(-32768);
      const candidate=stdout.match(/^https:\/\/accounts\.nintendo\.com\/connect\/1\.0\.0\/authorize\?[^\s]+/m)?.[0];
      if(candidate){pending.url=candidate;stdout='';settled=true;resolveReady({url:candidate,expires:pending.expires})}
    });
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-65536)});
    child.on('error',()=>{launchError=true});
    child.on('close',code=>{
      clearTimeout(pending.timer);const error=launchError?new Error('internal'):code===0?null:cliError(stderr);
      stderr='';stdout='';resolveDone(error);
      if(!settled){settled=true;rejectReady(error??new Error('upstream'))}
    });
    pending.timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(new Error('interrupted'))}this.cancel().catch(()=>{})},this.ttl);
    pending.timer.unref();
    // A CLI version/prompt failure should not leave an HTTP request hanging.
    const promptTimer=setTimeout(()=>{if(!settled){settled=true;rejectReady(new Error('interrupted'));this.cancel().catch(()=>{})}},30000);
    promptTimer.unref();
    try{return await ready}catch(error){await this.cancel();throw error}finally{clearTimeout(promptTimer)}
  }
  async complete(value){
    const pending=this.pending;
    if(!pending||pending.submitted||pending.expires<Date.now())throw new Error('auth_callback');
    const url=validateCallback(value,pending.url);pending.submitted=true;
    clearTimeout(pending.timer);
    let timedOut=false;
    pending.timer=setTimeout(()=>{timedOut=true;pending.child.kill()},this.completeTimeout);
    pending.child.stdin.on('error',()=>{});pending.child.stdin.end(url+'\n');
    const error=await pending.finished;
    if(timedOut||error){await this.cancel();throw timedOut?new Error('interrupted'):error}
    const previous=this.read();
    writeFileSync(this.file+'.tmp',JSON.stringify({name:path.basename(pending.profile)}),{mode:0o600});
    renameSync(this.file+'.tmp',this.file);this.pending=null;
    if(previous)this.remove(previous.profile);
    return {backend:'nxapi-cli'};
  }
  async clear(){
    await this.cancel();const previous=this.read();
    if(previous)this.remove(previous.profile);
    rmSync(this.file,{force:true});
    // Explicit logout also clears files from the previous library-auth backend.
    for(const name of ['credentials.enc','credentials.enc.tmp','vault.key'])rmSync(path.join(this.root,'..',name),{force:true});
  }
}
