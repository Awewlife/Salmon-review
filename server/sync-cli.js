import path from 'node:path';
import {mkdir,readdir,readFile,stat,rename} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {launchCli,cliError} from './nxapi-cli.js';

export async function syncCli(input,emit,{launch=launchCli,signal,interval=500}={}){
  if(input.credentials?.backend!=='nxapi-cli'||!input.credentials.profile)throw new Error('auth_required');
  const profile=input.credentials.profile,directory=path.resolve(input.exportDirectory);
  await mkdir(directory,{recursive:true,mode:0o700});
  // nxapi skips a detail file by existence. Preserve incomplete bytes separately
  // so an interrupted write can be downloaded again on the next run.
  for(const name of await readdir(directory)){
    if(!/^splatnet3-coop-(summary|result)-[^/\\]+\.json$/.test(name))continue;
    const file=path.join(directory,name);
    if((await stat(file)).size>64*1024*1024)throw new Error('too_large');
    const raw=await readFile(file,'utf8');
    try{JSON.parse(raw)}catch{await rename(file,file+'.incomplete-'+Date.now())}
  }
  const known=new Set(input.known),seen=new Set(),existing=new Set(await readdir(directory));
  let history=null,lastProgress='',stderr='',closed=false,exitCode=null,launchFailed=false;
  async function scan(){
    const files=(await readdir(directory)).filter(name=>/^splatnet3-coop-(summary|result)-[^/\\]+\.json$/.test(name));
    files.sort((a,b)=>Number(b.includes('-summary-'))-Number(a.includes('-summary-'))||a.localeCompare(b));
    for(const name of files){
      if(seen.has(name))continue;
      const isSummary=name.startsWith('splatnet3-coop-summary-');
      if(isSummary&&existing.has(name)){seen.add(name);continue}
      const file=path.join(directory,name);
      if((await stat(file)).size>64*1024*1024)throw new Error('too_large');
      let document;try{document=JSON.parse(await readFile(file,'utf8'))}catch(error){continue}
      if(isSummary){history=document;await emit('summary',document)}
      else if(!known.has(document.result?.id)){await emit('record',document);known.add(document.result.id)}
      seen.add(name);
    }
    if(history){
      const ids=[...new Set(history.result.historyGroups.nodes.flatMap(g=>g.historyDetails.nodes.map(j=>j.id)))];
      const progress={done:ids.filter(id=>known.has(id)).length,total:ids.length};
      if(JSON.stringify(progress)!==lastProgress){await emit('progress',progress);lastProgress=JSON.stringify(progress)}
    }
  }
  const child=launch(profile,['splatnet3','dump-results',directory,'--coop','--no-battles','--auto-update-session']);
  const finished=new Promise(resolve=>{
    child.stdout.on('data',()=>{});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-65536)});
    child.on('error',()=>{launchFailed=true});
    child.on('close',code=>{closed=true;exitCode=code;resolve()});
  });
  child.stdin.end();
  const stop=()=>child.kill();signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted)stop();
  try{
    while(!closed){await scan();await Promise.race([finished,sleep(interval)])}
    await scan();
    if(signal?.aborted)throw new Error('interrupted');
    if(launchFailed)throw new Error('internal');
    if(exitCode!==0)throw cliError(stderr);
    if(!history)throw new Error('upstream');
    const progress=JSON.parse(lastProgress);
    if(progress.done!==progress.total)throw new Error('interrupted');
    return progress;
  }finally{
    stderr='';signal?.removeEventListener('abort',stop);if(!closed){child.kill();await finished}
  }
}
