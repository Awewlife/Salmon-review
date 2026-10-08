import {readFile,open,statfs,rename,rm} from 'node:fs/promises';
import {createHash,verify} from 'node:crypto';
import path from 'node:path';
export const repository='Awewlife/Salmon-review-releases';
export const versionPattern=/^\d+\.\d+\.\d+$/;
export function compareVersions(a,b){
  if(!versionPattern.test(a)||!versionPattern.test(b))throw new Error('invalid_version');
  const aa=a.split('.').map(Number),bb=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(aa[i]!==bb[i])return Math.sign(aa[i]-bb[i]);return 0;
}
export function assetURL(version,name){
  if(!versionPattern.test(version)||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(name))throw new Error('invalid_manifest');
  return `https://github.com/${repository}/releases/download/v${version}/${name}`;
}
export async function publicFetch(url,{timeout=30000}={}){
  for(let redirects=0;redirects<5;redirects++){
    const u=new URL(url);
    if(u.protocol!=='https:'||u.username||u.password||u.port||!['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw new Error('invalid_source');
    const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'SalmonReview-Updater','Accept':u.hostname==='api.github.com'?'application/vnd.github+json':'application/octet-stream'}});
    if([301,302,303,307,308].includes(r.status)){url=new URL(r.headers.get('location'),u).href;await r.body?.cancel();continue}
    if(!r.ok){await r.body?.cancel();throw new Error(r.status===404?'release_missing':r.status===403||r.status===429?'release_limited':'download_failed')}
    return r;
  }throw new Error('invalid_source');
}
async function smallJSON(url){
  const r=await publicFetch(url);let size=0;const chunks=[];
  for await(const chunk of r.body){size+=chunk.length;if(size>512*1024)throw new Error('invalid_manifest');chunks.push(chunk)}
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function validateManifest(envelope,key,expectedVersion){
  if(typeof envelope?.payload!=='string'||typeof envelope.signature!=='string'||envelope.payload.length>50000)throw new Error('invalid_signature');
  const payload=Buffer.from(envelope.payload,'base64');
  if(!verify(null,payload,key,Buffer.from(envelope.signature,'base64')))throw new Error('invalid_signature');
  const m=JSON.parse(payload);
  if(m.format!==1||m.updaterProtocol!==1||m.dataFormat!==1||m.platform!=='linux/amd64'||!versionPattern.test(m.version)||m.version!==expectedVersion||m.repository!==repository||m.image!==`salmon-review:${m.version}`||!/^\w{40}$/.test(m.commit)||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>2*1024**3||!/^[a-f0-9]{64}$/.test(m.sha256)||!Array.isArray(m.imageIds)||!m.imageIds.length||!m.imageIds.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)))throw new Error('invalid_manifest');
  if(m.asset!==`salmon-review-${m.version}-linux-amd64.tar.gz`)throw new Error('invalid_manifest');
  return m;
}
export async function manifestFor(version){
  const key=await readFile(new URL('./public-key.pem',import.meta.url));
  return validateManifest(await smallJSON(assetURL(version,'update.json')),key,version);
}
export async function latestRelease(){
  const releases=await smallJSON(`https://api.github.com/repos/${repository}/releases?per_page=20`);
  if(!Array.isArray(releases))throw new Error('invalid_manifest');
  const entries=releases.filter(r=>!r.draft&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)&&r.assets?.some(a=>a.name==='update.json'));
  entries.sort((a,b)=>compareVersions(b.tag_name.slice(1),a.tag_name.slice(1)));
  if(!entries.length)throw new Error('release_missing');
  const release=entries[0],manifest=await manifestFor(release.tag_name.slice(1));
  return {manifest,notes:String(release.body??'').slice(0,12000),url:`https://github.com/${repository}/releases/tag/v${manifest.version}`};
}
export async function downloadImage(m,file,onProgress=()=>{},fetcher=publicFetch){
  const space=await statfs(path.dirname(file));
  if(space.bavail*space.bsize<m.bytes*2+100*1024**2)throw new Error('disk_space');
  const temporary=file+'.part';let handle;
  try{
    handle=await open(temporary,'w',0o600);const hash=createHash('sha256');let bytes=0,last=0;
    const r=await fetcher(assetURL(m.version,m.asset),{timeout:30*60*1000});
    for await(const chunk of r.body){bytes+=chunk.length;if(bytes>m.bytes)throw new Error('invalid_download');hash.update(chunk);await handle.writeFile(chunk);if(Date.now()-last>750){await onProgress(Math.floor(bytes/m.bytes*100));last=Date.now()}}
    if(bytes!==m.bytes||hash.digest('hex')!==m.sha256)throw new Error('invalid_download');
    await handle.sync();await handle.close();handle=null;await rename(temporary,file);await onProgress(100);
  }finally{await handle?.close();await rm(temporary,{force:true})}
}
