import {version} from './version.js';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {classify} from './errors.js';

const require=createRequire(import.meta.url);
const entry=path.resolve(path.dirname(require.resolve('nxapi')),'../../bin/nxapi.js');
const preload=new URL('./nxapi-language.js',import.meta.url).href;

// Run the published executable as a subprocess. Its own client registration,
// authentication, rate limiting and refresh logic remain owned by nxapi.
export function launchCli(profile,args){return launchProfile(profile,entry,args)}
export function launchProfile(profile,executable,args=[]){
  mkdirSync(profile,{recursive:true,mode:0o700});
  const env={...process.env};
  for(const key of Object.keys(env))if(/^(NXAPI_|ZNCA_|ZNC_PROXY_URL$|DEBUG$|NODE_OPTIONS$)/.test(key))delete env[key];
  Object.assign(env,{
    NODE_ENV:'production',DEBUG:'',NODE_OPTIONS:'',NXAPI_DEBUG_FILE:'0',NXAPI_SKIP_UPDATE_CHECK:'1',
    NXAPI_USER_AGENT:`salmon-review/${version} (+https://github.com/Awewlife/Salmon-review)`,
    NXAPI_DATA_PATH:profile,HOME:profile,APPDATA:profile,LOCALAPPDATA:profile,
    XDG_DATA_HOME:profile,XDG_CACHE_HOME:path.join(profile,'cache'),XDG_CONFIG_HOME:profile,XDG_STATE_HOME:profile,
  });
  return spawn(process.execPath,['--import',preload,executable,...(executable===entry?['--data-path',profile]:[]),...args],{
    cwd:profile,env,stdio:['pipe','pipe','pipe'],windowsHide:true,
  });
}

// Never return raw CLI output: nso auth prints a session token to stdout.
export function cliError(text){
  if(/Too many attempts|429|rate.?limit/i.test(text))return Object.assign(new Error('rate_limited'),{retryAfter:3600});
  if(/Invalid token|No valid bullet_token|401|invalid_grant/i.test(text))return new Error('auth_required');
  return new Error(classify(new Error(text)));
}

export function validateCallback(value,authoriseUrl){
  try{
    if(typeof value!=='string'||value.length>12000||/[\r\n]/.test(value))throw new Error();
    const url=new URL(value),params=new URLSearchParams(url.hash.slice(1)),expected=new URL(authoriseUrl).searchParams.get('state');
    if(url.protocol!=='npf71b963c1b7b6d119:'||url.hostname!=='auth'||!expected||params.get('state')!==expected||!params.get('session_token_code'))throw new Error();
    return url.href;
  }catch{throw new Error('auth_callback')}
}
