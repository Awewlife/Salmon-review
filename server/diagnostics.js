import {access,stat,statfs} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

const fsCode=e=>['EACCES','EPERM','ENOENT','ENOSPC','EROFS'].includes(e?.code)?e.code:'unavailable';
// Deliberately return aggregates only: never paths, settings values or raw rows.
export async function readDiagnostics(store,{updaterConfigured=false}={}){
  const result={runtime:{node:process.versions.node,platform:process.platform,arch:process.arch,uptimeSeconds:Math.floor(process.uptime()),rssBytes:process.memoryUsage().rss},updaterConfigured,database:{},storage:{}};
  const start=performance.now();
  try{
    for(const table of ['records','summaries','shifts','assets'])result.database[table]=Number(store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
    result.database.schemaVersion=Number(store.db.prepare('PRAGMA user_version').get().user_version);
    result.database.ok=true;
  }catch{result.database={ok:false,code:'database_read_failed'}}
  result.database.elapsedMs=Math.round(performance.now()-start);
  const file=path.join(store.directory,'salmon.sqlite');
  await Promise.all([
    (async()=>{try{result.storage.databaseBytes=(await stat(file)).size}catch(e){result.storage.fileCode=fsCode(e)}})(),
    (async()=>{try{const fs=await statfs(store.directory);result.storage.freeBytes=Number(fs.bavail)*Number(fs.bsize);result.storage.totalBytes=Number(fs.blocks)*Number(fs.bsize)}catch(e){result.storage.spaceCode=fsCode(e)}})(),
    (async()=>{try{await access(store.directory,constants.R_OK|constants.W_OK);await access(file,constants.R_OK|constants.W_OK);result.storage.permissions=true}catch(e){result.storage.permissions=false;result.storage.permissionCode=fsCode(e)}})()
  ]);
  return result;
}
