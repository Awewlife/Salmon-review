import {mkdir,writeFile,readFile,rename,cp,readdir,rm,lstat,chmod,chown,statfs} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
export async function atomicJSON(file,value){await mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,file)}
export async function json(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
export async function inspectTree(root){
  let bytes=0;for(const name of await readdir(root)){const f=path.join(root,name),s=await lstat(f);if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory()))throw new Error('unsafe_data_file');bytes+=s.isDirectory()?await inspectTree(f):s.size}return bytes;
}
export async function backupData(data,backup){
  const bytes=await inspectTree(data),space=await statfs(path.dirname(backup));
  if(space.bavail*space.bsize<bytes*2+100*1024**2)throw new Error('disk_space');
  await cp(data,backup,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true});
  if(await inspectTree(backup)!==bytes||await treeHash(data)!==await treeHash(backup))throw new Error('backup_failed');
}
export async function treeHash(root){
  const hash=createHash('sha256');
  async function walk(directory,prefix=''){
    for(const name of (await readdir(directory)).sort()){
      const file=path.join(directory,name),s=await lstat(file),relative=prefix+name;
      if(s.isDirectory()){hash.update('D:'+relative+'\0');await walk(file,relative+'/')}
      else if(s.isFile()){hash.update('F:'+relative+':'+s.size+'\0');for await(const chunk of createReadStream(file))hash.update(chunk)}
      else throw new Error('unsafe_data_file');
    }
  }
  await walk(root);return hash.digest('hex');
}
async function ownership(root){
  await chown(root,1000,1000);const stat=await lstat(root);await chmod(root,stat.isDirectory()?0o700:0o600);
  if(stat.isDirectory())for(const name of await readdir(root))await ownership(path.join(root,name));
}
export async function restoreData(data,backup){
  // Both directories are fixed deployment paths; no request-provided path is used.
  if(path.resolve(data)!=='/data'||!path.resolve(backup).startsWith('/updates/backups/'))throw new Error('unsafe_restore_path');
  await inspectTree(backup);
  for(const name of await readdir(data))await rm(path.join(data,name),{recursive:true,force:true});
  for(const name of await readdir(backup))await cp(path.join(backup,name),path.join(data,name),{recursive:true,preserveTimestamps:true});
  await ownership(data);
  if(await treeHash(data)!==await treeHash(backup))throw new Error('recovery_failed');
}
