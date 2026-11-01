import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url);
const base=path.resolve(path.dirname(require.resolve('nxapi')),'..');
const {RateLimitError,LIMIT_REQUESTS,LIMIT_PERIOD}=await import(pathToFileURL(path.join(base,'common/auth/util.js')));
export const RETRY_MARKER='SALMON_RETRY ';
export const DEFAULT_RETRY_MS=60*60*1000;

// Only the deadline and its source cross the subprocess boundary. Never send
// response bodies, authentication keys, account identifiers or attempt errors.
export function retryMetadata(error,now=Date.now()){
  const headers=error?.response?.headers;
  const value=headers?.get?.('retry-after')?.trim();
  let retryAt;
  if(value&&/^\d+$/.test(value))retryAt=now+Number(value)*1000;
  else if(value&&/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)){
    const date=Date.parse(value),serverDate=Date.parse(headers.get('date'));
    retryAt=Number.isFinite(serverDate)?now+Math.max(0,date-serverDate):date;
  }
  if(Number.isSafeInteger(retryAt)&&retryAt>=0)return {retryAt:Math.max(now,retryAt),retrySource:'upstream'};
  if(error instanceof RateLimitError){
    // Pinned nxapi common/auth/na.js uses a 15-minute window; coral and
    // splatnet3 use util.js defaults. Unknown services use the safe fallback.
    const period=error.key==='na'?15*60*1000:['coral','splatnet3'].includes(error.key)?LIMIT_PERIOD:null;
    if(period===null)return {};
    const times=error.attempts.map(a=>a.time).filter(t=>Number.isSafeInteger(t)&&t<=now&&t>=now-period).sort((a,b)=>b-a);
    // nxapi retains attempts exactly on the window boundary (>=), hence +1 ms.
    if(times.length>=LIMIT_REQUESTS)return {retryAt:times[LIMIT_REQUESTS-1]+period+1,retrySource:'nxapi'};
    if(error.attempts.length>=LIMIT_REQUESTS&&error.attempts.every(a=>Number.isSafeInteger(a.time)&&a.time<=now))return {retryAt:now,retrySource:'nxapi'};
  }
  return {};
}

export function safeRetryMetadata(value){
  return Number.isSafeInteger(value?.retryAt)&&value.retryAt>=0&&['upstream','nxapi'].includes(value.retrySource)?{retryAt:value.retryAt,retrySource:value.retrySource}:{};
}

export function retryDeadline(error,now=Date.now()){
  const metadata=safeRetryMetadata(error);
  if(metadata.retryAt!==undefined)return Math.max(now,metadata.retryAt);
  if(typeof error?.retryAfter==='number'&&Number.isFinite(error.retryAfter)&&error.retryAfter>=0&&Number.isSafeInteger(Math.ceil(now+error.retryAfter*1000)))return Math.ceil(now+error.retryAfter*1000);
  return now+DEFAULT_RETRY_MS;
}
