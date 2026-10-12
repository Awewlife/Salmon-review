import {readFile,open,statfs,rename,rm} from 'node:fs/promises';
import {createHash,verify} from 'node:crypto';
import path from 'node:path';
export const repository='Awewlife/Salmon-review';
const apiRoot=`https://api.github.com/repos/${repository}`;
export const versionPattern=/^\d+\.\d+\.\d+$/;
export function compareVersions(a,b){
  if(!versionPattern.test(a)||!versionPattern.test(b))throw new Error('invalid_version');
  const aa=a.split('.').map(Number),bb=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(aa[i]!==bb[i])return Math.sign(aa[i]-bb[i]);return 0;
}
export async function githubFetch(url,{timeout=30000,token,asset=false,transport=fetch,signal}={}){
  if(typeof token!=='string'||!token.trim())throw new Error('auth_required');
  for(let redirects=0;redirects<5;redirects++){
    const u=new URL(url);
    if(u.protocol!=='https:'||u.username||u.password||u.port||!['api.github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw new Error('invalid_source');
    const api=u.hostname==='api.github.com';
    if((redirects===0&&!api)||(api&&u.pathname!=='/user'&&u.pathname!==`/repos/${repository}`&&!u.pathname.startsWith(`/repos/${repository}/`)))throw new Error('invalid_source');
    // Signed CDN redirects must never receive the user's GitHub credential.
    const headers={'User-Agent':'SalmonReview-Updater','Accept':asset?'application/octet-stream':'application/vnd.github+json',...(api?{Authorization:`Bearer ${token}`}:{})};
    const r=await transport(u,{redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),headers});
    if([301,302,303,307,308].includes(r.status)){url=new URL(r.headers.get('location'),u).href;await r.body?.cancel();continue}
    if(!r.ok){await r.body?.cancel();throw new Error(r.status===401?'auth_invalid':r.status===429||(r.status===403&&(r.headers.get('x-ratelimit-remaining')==='0'||r.headers.has('retry-after')))?'release_limited':r.status===403||r.status===404?'access_denied':'download_failed')}
    return r;
  }throw new Error('invalid_source');
}
async function smallJSON(url,options){
  const r=await githubFetch(url,options);let size=0;const chunks=[];
  for await(const chunk of r.body){size+=chunk.length;if(size>512*1024)throw new Error('invalid_manifest');chunks.push(chunk)}
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function validateManifest(envelope,key,expectedVersion){
  if(typeof envelope?.payload!=='string'||typeof envelope.signature!=='string'||envelope.payload.length>50000)throw new Error('invalid_signature');
  const payload=Buffer.from(envelope.payload,'base64');
  if(!verify(null,payload,key,Buffer.from(envelope.signature,'base64')))throw new Error('invalid_signature');
  const m=JSON.parse(payload);
  if(m.format!==1||![1,2].includes(m.updaterProtocol)||m.dataFormat!==1||m.platform!=='linux/amd64'||!versionPattern.test(m.version)||m.version!==expectedVersion||m.repository!==repository||m.image!==`salmon-review:${m.version}`||!/^\w{40}$/.test(m.commit)||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>2*1024**3||!/^[a-f0-9]{64}$/.test(m.sha256)||!Array.isArray(m.imageIds)||!m.imageIds.length||!m.imageIds.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)))throw new Error('invalid_manifest');
  if(m.asset!==`salmon-review-${m.version}-linux-amd64.tar.gz`)throw new Error('invalid_manifest');
  return m;
}
async function releaseAsset(version,name,options){
  if(!versionPattern.test(version))throw new Error('invalid_version');
  const release=await smallJSON(`${apiRoot}/releases/tags/v${version}`,options);
  const asset=release.assets?.find(a=>a.name===name);
  if(release.draft||!Number.isSafeInteger(asset?.id)||asset.id<1)throw new Error('release_missing');
  // Construct the API path from a numeric asset ID, never from response URLs.
  return `${apiRoot}/releases/assets/${asset.id}`;
}
export async function verifyAccess(token,transport=fetch,signal){
  const options={token,transport,signal};
  const repo=await smallJSON(apiRoot,options);
  if(repo.full_name?.toLowerCase()!==repository.toLowerCase()||repo.private!==true||repo.permissions?.pull!==true)throw new Error('access_denied');
  await smallJSON(`${apiRoot}/releases?per_page=1`,options);
  const user=await smallJSON('https://api.github.com/user',options);
  if(typeof user.login!=='string'||!user.login)throw new Error('auth_invalid');
  return {login:user.login};
}
export async function manifestFor(version,options){
  const key=await readFile(new URL('./public-key.pem',import.meta.url));
  return validateManifest(await smallJSON(await releaseAsset(version,'update.json',options),{...options,asset:true}),key,version);
}
export async function latestRelease(options){
  const releases=await smallJSON(`${apiRoot}/releases?per_page=20`,options);
  if(!Array.isArray(releases))throw new Error('invalid_manifest');
  const entries=releases.filter(r=>!r.draft&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)&&r.assets?.some(a=>a.name==='update.json'));
  entries.sort((a,b)=>compareVersions(b.tag_name.slice(1),a.tag_name.slice(1)));
  if(!entries.length)throw new Error('release_missing');
  const release=entries[0],manifest=await manifestFor(release.tag_name.slice(1),options);
  return {manifest,notes:String(release.body??'').slice(0,12000),url:`https://github.com/${repository}/releases/tag/v${manifest.version}`};
}
export async function downloadImage(m,file,onProgress=()=>{},fetcher=()=>{throw new Error('auth_required')},{signal}={}){
  signal?.throwIfAborted();
  const space=await statfs(path.dirname(file));
  if(space.bavail*space.bsize<m.bytes*2+100*1024**2)throw new Error('disk_space');
  const temporary=file+'.part';let handle;
  try{
    handle=await open(temporary,'w',0o600);const hash=createHash('sha256');let bytes=0,last=0;
    const r=await fetcher(m,{timeout:30*60*1000,signal});
    for await(const chunk of r.body){signal?.throwIfAborted();bytes+=chunk.length;if(bytes>m.bytes)throw new Error('invalid_download');hash.update(chunk);await handle.writeFile(chunk);if(Date.now()-last>750){await onProgress(Math.floor(bytes/m.bytes*100));last=Date.now()}}
    signal?.throwIfAborted();
    if(bytes!==m.bytes||hash.digest('hex')!==m.sha256)throw new Error('invalid_download');
    await handle.sync();await handle.close();handle=null;await rename(temporary,file);await onProgress(100);
  }finally{await handle?.close();await rm(temporary,{force:true})}
}
export function privateReleases(getToken){
  const options=()=>({token:getToken()});
  return {
    releases:async()=>{await verifyAccess(getToken());return latestRelease(options())},
    manifest:async(version,{signal}={})=>{await verifyAccess(getToken(),fetch,signal);return manifestFor(version,{...options(),signal})},
    download:(m,file,progress,{signal}={})=>downloadImage(m,file,progress,async(_manifest,settings)=>githubFetch(await releaseAsset(m.version,m.asset,{...options(),signal}),{...options(),...settings,asset:true}),{signal})
  };
}
