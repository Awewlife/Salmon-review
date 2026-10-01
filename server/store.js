import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {hash,ownerOf,validateRecord,groupsOf,normalize,item,rejectSecrets} from './normalize.js';
import {historyAdjacency} from './continuity.js';

export class Store{
  constructor(directory){
    mkdirSync(directory,{recursive:true,mode:0o700});this.directory=directory;
    this.db=new DatabaseSync(path.join(directory,'salmon.sqlite'));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if(version>1)throw new Error('database_version_newer');
    if(version===0)this.db.exec(`BEGIN;
      CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE records(id TEXT PRIMARY KEY,owner TEXT NOT NULL,played TEXT NOT NULL,raw TEXT NOT NULL);
      CREATE TABLE summaries(id TEXT PRIMARY KEY,raw TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE shifts(id TEXT PRIMARY KEY,info TEXT NOT NULL);
      CREATE TABLE membership(record_id TEXT PRIMARY KEY,shift_id TEXT NOT NULL);
      CREATE TABLE assets(id TEXT PRIMARY KEY,url TEXT NOT NULL);
      CREATE TABLE runs(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,started TEXT NOT NULL,finished TEXT,done INTEGER DEFAULT 0,total INTEGER DEFAULT 0,added INTEGER DEFAULT 0,error TEXT);
      PRAGMA user_version=1;COMMIT;`);
    try{chmodSync(path.join(directory,'salmon.sqlite'),0o600)}catch{}
    this.db.prepare("UPDATE runs SET state='interrupted',finished=?,error='interrupted' WHERE state='running'").run(new Date().toISOString());
  }
  get(key,fallback=null){const row=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);return row?JSON.parse(row.value):fallback}
  set(key,value){this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,JSON.stringify(value))}
  has(id){return !!this.db.prepare('SELECT 1 FROM records WHERE id=?').get(id)}
  import(documents,{backup=false}={}){
    if(!Array.isArray(documents)||(!backup&&!documents.length)||documents.length>(backup?100000:2000))throw new Error('invalid_import');
    const records=[],summaries=[];
    for(const document of documents){
      rejectSecrets(document);
      const raw=document?.result;
      if(raw?.historyGroups){groupsOf(raw);summaries.push(raw)}
      else{validateRecord(raw);records.push(raw)}
    }
    const owners=new Set(records.map(ownerOf)),existing=this.get('owner');
    if(owners.size>1||(existing&&[...owners].some(o=>o!==existing)))throw new Error('account_mismatch');
    // Validate all player identifiers before accepting any part of an import.
    records.forEach(raw=>normalize(raw,null,()=>''));
    let added=0;this.db.exec('BEGIN IMMEDIATE');
    try{
      for(const raw of records){
        const known=this.db.prepare('SELECT raw FROM records WHERE id=?').get(raw.id);
        // A repeated file must not silently overwrite an already archived result.
        if(!known){this.db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(raw.id,ownerOf(raw),raw.playedTime,JSON.stringify(raw));added++}
      }
      if(!existing&&owners.size)this.set('owner',[...owners][0]);
      for(const raw of summaries){
        const serialized=JSON.stringify(raw);this.db.prepare('INSERT OR IGNORE INTO summaries VALUES(?,?,?)').run(hash(serialized),serialized,new Date().toISOString());
        for(const group of groupsOf(raw)){
          const row=this.db.prepare('SELECT info FROM shifts WHERE id=?').get(group.id),old=row?JSON.parse(row.info):null;
          group.total=Math.max(old?.total??0,group.total??0)||null;
          this.db.prepare('INSERT OR REPLACE INTO shifts VALUES(?,?)').run(group.id,JSON.stringify(group));
          for(const id of group.recordIds)this.db.prepare('INSERT OR IGNORE INTO membership VALUES(?,?)').run(id,group.id);
        }
      }
      this.set('lastImport',new Date().toISOString());this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error}
    return {added,skipped:records.length-added,summaries:summaries.length};
  }
  saveAssets(assets){
    const known=new Map(this.db.prepare('SELECT id,url FROM assets').all().map(row=>[row.id,row.url]));
    const changed=[...assets].filter(([id,url])=>known.get(id)!==url);
    if(!changed.length)return;
    // A snapshot may reference the same image thousands of times. Commit only
    // distinct new/changed URLs together; unchanged reads must not write to disk.
    const put=this.db.prepare('INSERT INTO assets(id,url) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url');
    this.db.exec('BEGIN IMMEDIATE');
    try{for(const [id,url] of changed)put.run(id,url);this.db.exec('COMMIT')}
    catch(error){this.db.exec('ROLLBACK');throw error}
  }
  snapshot(){
    const assets=new Map();
    const asset=url=>{if(!url)return '';const id=hash(url.split('?')[0]);assets.set(id,url);return '/assets/'+id};
    const adjacent=historyAdjacency(this.db.prepare('SELECT raw FROM summaries').all().map(r=>JSON.parse(r.raw)));
    const allShifts=this.db.prepare('SELECT info FROM shifts').all().map(r=>JSON.parse(r.info));
    const byId=new Map(allShifts.map(s=>[s.id,s]));
    const rows=this.db.prepare('SELECT r.raw,m.shift_id FROM records r LEFT JOIN membership m ON m.record_id=r.id ORDER BY r.played,r.id').all();
    const rawById=new Map(rows.map(row=>{const raw=JSON.parse(row.raw);return [normalizeId(raw.id),raw]}));
    const all=rows.map(row=>normalize(JSON.parse(row.raw),byId.get(row.shift_id),asset));
    const jobs=all.filter(j=>j.supported),shifts=[];
    for(const group of allShifts.sort((a,b)=>b.start.localeCompare(a.start))){
      const batch=jobs.filter(j=>j.shift===group.id),archived=all.filter(j=>j.shift===group.id);
      if(!batch.length)continue;
      batch.forEach((j,i)=>{j.index=i+1;j.continuousWithPrevious=i>0&&adjacent(group.id,batch[i-1].id,j.id)});
      const lastRaw=rawById.get(batch.at(-1).id);
      // NSO playCount excludes interrupted results (-1, no waves). Saving a
      // detail and having enough fields to analyse it are separate conditions.
      const interrupted=archived.filter(j=>j.interrupted).length,saved=archived.length-interrupted;
      const complete=group.total!==null&&saved>=group.total;
      shifts.push({...group,recordIds:undefined,loaded:batch.length,saved,interrupted,excluded:saved-batch.length,total:group.total??saved,complete,stage:batch.at(-1).stage,weapons:(lastRaw.weapons??[]).map(w=>item(w,asset))});
    }
    this.saveAssets(assets);
    return {generated:new Date().toISOString(),language:'zh-CN',timezone:'Asia/Hong_Kong',player:all.at(-1)?.players[0]?.name??'尚未导入战绩',jobs,shifts,
      archived:all.length,excluded:all.filter(j=>!j.supported).map(j=>({id:j.id,time:j.time,stage:j.stage.name,reasons:j.reasons})),lastImport:this.get('lastImport')};
  }
  backup(){return {format:'salmon-review-backup',version:1,created:new Date().toISOString(),documents:[...this.db.prepare('SELECT raw FROM summaries ORDER BY created').all(),...this.db.prepare('SELECT raw FROM records ORDER BY played').all()].map(r=>({result:JSON.parse(r.raw)}))}}
  restore(backup){if(backup?.format!=='salmon-review-backup'||backup.version!==1)throw new Error('invalid_backup');return this.import(backup.documents,{backup:true})}
  close(){this.db.close()}
}
const normalizeId=id=>'job-'+hash(id).slice(0,24);
