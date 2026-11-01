import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),base=path.resolve(path.dirname(require.resolve('nxapi')),'..');
const {createYargs}=await import(pathToFileURL(path.join(base,'cli.js')));
const {checkUseLimit}=await import(pathToFileURL(path.join(base,'common/auth/util.js')));
const {ErrorResponse}=await import(pathToFileURL(path.join(base,'api/util.js')));
const mode=process.argv[2];
createYargs(['retry-probe']).command('retry-probe',false,()=>{},async()=>{
  if(mode==='local'){
    const time=Date.now()-55*60000;
    const storage={getItem:async()=>[0,1,2,3].map(i=>({time:time+i*1000,error_data:'SECRET'})),setItem:async()=>{throw new Error('limiter must not alter attempts')}};
    await checkUseLimit(storage,'splatnet3','fixture-account');
  }
  throw await ErrorResponse.fromResponse(new Response('SECRET',{status:429,headers:{'Retry-After':'42'}}),'Too many requests');
}).parse();
