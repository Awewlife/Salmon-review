// Fake external process for adapter tests; never contacts Nintendo.
import {createInterface} from 'node:readline';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import path from 'node:path';
import {fixture} from './fixtures.js';
const [mode,profile,directory]=process.argv.slice(2);
if(mode.startsWith('auth')){
  console.log('https://accounts.nintendo.com/connect/1.0.0/authorize?state=test-state');
  const rl=createInterface({input:process.stdin});
  for await(const value of rl){
    if(mode==='auth-fail'){console.error('Remote configuration prevents Coral authentication SECRET-MUST-NOT-LEAK');process.exit(1)}
    if(mode==='auth-hang'){await sleep(10000);process.exit(1)}
    await mkdir(path.join(profile,'persist'),{recursive:true});
    await writeFile(path.join(profile,'persist','fixture'),JSON.stringify({key:'SelectedUser',value:'test-player'}));
    console.log('Session token SECRET-MUST-NOT-LEAK');rl.close();break;
  }
}else{
  const f=fixture();await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,`splatnet3-coop-summary-${Date.now()}.json`),JSON.stringify(f.summary));
  const file=path.join(directory,'splatnet3-coop-result-fixture.json');
  // Like nxapi: existence is enough to skip. The adapter must quarantine partial files.
  try{await readFile(file)}catch{
    await writeFile(file,'{"result":');await sleep(80);await writeFile(file,JSON.stringify(f.record));
  }
  await sleep(80);
  if(mode==='sync-fail'){console.error('fetch failed SECRET-MUST-NOT-LEAK');process.exitCode=1}
}
