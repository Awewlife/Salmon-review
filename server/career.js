import {safeAssetUrl,playerKey,rejectSecrets} from './normalize.js';
const count=v=>Number.isSafeInteger(v)&&v>=0;
const name=v=>typeof v==='string'?v.slice(0,300):'';
const item=v=>{if(!v||typeof v.id!=='string'||!name(v.name))throw new Error('upstream');return {id:v.id.slice(0,2000),name:name(v.name),image:safeAssetUrl(v.image?.url)}};
export function normalizeCareer(raw,player,avatar){
  if(!raw||!player?.id||!['stageHighestRecords','defeatEnemyRecords','defeatBossRecords'].every(k=>Array.isArray(raw[k])))throw new Error('upstream');
  const counts=rows=>rows.map(r=>{if(!count(r.defeatCount))throw new Error('upstream');return {...item(r.enemy),count:r.defeatCount}});
  const stages=raw.stageHighestRecords.map(r=>{
    // A stage without an official highest grade is unknown, never a fabricated zero.
    if(r.grade===null&&r.gradePoint===null)return {...item(r.coopStage),grade:null,gradePoint:null};
    if(!r.grade||!name(r.grade.name)||!count(r.gradePoint))throw new Error('upstream');
    return {...item(r.coopStage),grade:name(r.grade.name),gradePoint:r.gradePoint};
  });
  return {format:1,owner:playerKey(player.id),updatedAt:new Date().toISOString(),player:name(player.name),avatar:safeAssetUrl(avatar),stages,enemies:counts(raw.defeatEnemyRecords),bosses:counts(raw.defeatBossRecords)};
}
export function validateCareer(value){
  rejectSecrets(value);
  if(value?.format!==1||!/^\w{24}$/.test(value.owner??'')||!Number.isFinite(Date.parse(value.updatedAt))||typeof value.player!=='string'||value.player.length>300||!['stages','enemies','bosses'].every(k=>Array.isArray(value[k])&&value[k].length<=100))throw new Error('invalid_backup');
  if(value.avatar!==null&&!safeAssetUrl(value.avatar))throw new Error('invalid_backup');
  for(const key of ['stages','enemies','bosses'])for(const row of value[key]){
    if(typeof row.id!=='string'||row.id.length>2000||typeof row.name!=='string'||row.name.length>300||(row.image!==null&&!safeAssetUrl(row.image)))throw new Error('invalid_backup');
    if(key==='stages'?!((row.grade===null&&row.gradePoint===null)||(typeof row.grade==='string'&&row.grade.length<=300&&count(row.gradePoint))):!count(row.count))throw new Error('invalid_backup');
  }
  // Whitelist fields: imported backups must not introduce extra profile data.
  const rows=key=>value[key].map(r=>({id:r.id,name:r.name,image:r.image,...(key==='stages'?{grade:r.grade,gradePoint:r.gradePoint}:{count:r.count})}));
  return {format:1,owner:value.owner,updatedAt:value.updatedAt,player:value.player,avatar:value.avatar,stages:rows('stages'),enemies:rows('enemies'),bosses:rows('bosses')};
}

export async function loadOfficialCareer(splatnet,queryId,avatar){
  // HistoryRecord.currentPlayer has no stable ID; a fresh coop detail identifies
  // the owner independently of local records and mutable display names.
  const history=await splatnet.getCoopHistory();
  const latest=history.data?.coopResult?.historyGroups?.nodes?.flatMap(g=>g.historyDetails?.nodes??[])[0];
  if(history.errors?.length||!latest?.id)throw new Error('upstream');
  const detail=await splatnet.getCoopHistoryDetail(latest.id);
  const response=await splatnet.persistedQuery(queryId,{});
  if(detail.errors?.length||response.errors?.length)throw new Error('upstream');
  return normalizeCareer(response.data?.coopRecord,detail.data?.coopHistoryDetail?.myResult?.player,avatar);
}
