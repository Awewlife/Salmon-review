import {fileURLToPath} from 'node:url';
import {launchProfile} from './nxapi-cli.js';
import {validateCareer} from './career.js';
export function fetchCareer(input,{signal,launch=launchProfile}={}){
  if(input.credentials?.backend!=='nxapi-cli'||!input.credentials.profile)throw new Error('auth_required');
  return new Promise((resolve,reject)=>{
    const child=launch(input.credentials.profile,fileURLToPath(new URL('./career-fetch.js',import.meta.url)));
    let text='',tooLarge=false;
    const stop=()=>child.kill();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
    child.stdout.on('data',chunk=>{text+=chunk.toString();if(Buffer.byteLength(text)>1024*1024){tooLarge=true;stop()}});
    child.stderr.on('data',()=>{});
    child.on('error',()=>{signal?.removeEventListener('abort',stop);reject(new Error('internal'))});
    child.on('close',code=>{
      signal?.removeEventListener('abort',stop);
      if(signal?.aborted)return reject(new Error('interrupted'));
      if(tooLarge)return reject(new Error('too_large'));
      try{const value=JSON.parse(text);if(code!==0||value.error)throw new Error(value.error??'upstream');resolve(validateCareer(value))}catch(error){reject(new Error(['auth_required','rate_limited','network','upstream_disabled'].includes(error.message)?error.message:'upstream'))}
    });child.stdin.end();
  });
}
