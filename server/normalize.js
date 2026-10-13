import {createHash} from 'node:crypto';

export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export const number=value=>Number.isFinite(value)&&value>=0?value:null;
export function playerKey(id){
  if(typeof id!=='string'||!id.length)throw new Error('invalid_record');
  const decoded=Buffer.from(id,'base64').toString('utf8');
  return hash(decoded.includes(':')?decoded.split(':').at(-1):id).slice(0,24);
}
const text=(value,fallback='未知')=>typeof value==='string'?value.slice(0,300):fallback;
function gradeId(raw){
  if(typeof raw?.id!=='string')return null;
  const match=Buffer.from(raw.id,'base64').toString('utf8').match(/^CoopGrade-([0-8])$/);
  return match?Number(match[1]):null;
}
export function safeAssetUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(/\.nintendo\.net$|\.nintendo\.com$/).test(u.hostname)?u.href:null}catch{return null}
}
export function item(raw,asset=()=> ''){return {name:text(raw?.name),image:asset(safeAssetUrl(raw?.image?.url))}}
export function appearance(player,asset){
  if(!player?.nameplate&&!player?.uniform)return null;
  const color=player.nameplate?.background?.textColor;
  const textColor=color&&['r','g','b','a'].every(k=>Number.isFinite(color[k])&&color[k]>=0&&color[k]<=1)
    ?`rgba(${['r','g','b'].map(k=>Math.round(color[k]*255)).join(',')},${color.a})`:null;
  return {byname:text(player.byname,''),nameId:text(player.nameId,''),
    uniform:player.uniform?item(player.uniform,asset):null,
    nameplate:player.nameplate?{background:asset(safeAssetUrl(player.nameplate.background?.image?.url)),textColor,
      badges:Array.isArray(player.nameplate.badges)?player.nameplate.badges.slice(0,3).map(b=>b?asset(safeAssetUrl(b.image?.url)):null):[]}:null};
}
function special(raw,asset){
  let id=raw?.weaponId;
  if(!Number.isInteger(id)&&typeof raw?.id==='string'){
    const match=Buffer.from(raw.id,'base64').toString().match(/^SpecialWeapon-(\d+)$/);id=match?Number(match[1]):null;
  }
  return {...item(raw,asset),weaponId:Number.isInteger(id)?id:null};
}
export function ownerOf(raw){return playerKey(raw?.myResult?.player?.id)}
export function validateRecord(raw){
  if(!raw||typeof raw.id!=='string'||raw.id.length>2000||!Number.isFinite(Date.parse(raw.playedTime))||!raw.myResult?.player?.id||!Array.isArray(raw.memberResults)||!Array.isArray(raw.waveResults)||!Array.isArray(raw.enemyResults))throw new Error('invalid_record');
  ownerOf(raw);
  return raw;
}
export function normalize(raw,group,asset){
  validateRecord(raw);
  const players=[raw.myResult,...raw.memberResults].map((p,i)=>({
    key:playerKey(p.player?.id),name:text(p.player?.name),me:i===0,appearance:appearance(p.player,asset),
    eggs:number(p.goldenDeliverCount),assist:number(p.goldenAssistCount),power:number(p.deliverCount),kills:number(p.defeatEnemyCount),rescues:number(p.rescueCount),deaths:number(p.rescuedCount),
    weapons:(p.weapons??[]).map(w=>item(w,asset)),special:special(p.specialWeapon,asset)
  }));
  const waves=raw.waveResults.map(w=>({number:w.waveNumber,tide:['干潮','普通','满潮'][w.waterLevel]??'未知',event:text(w.eventWave?.name,'普通'),quota:number(w.deliverNorm),eggs:number(w.teamDeliverCount),appeared:number(w.goldenPopCount),specials:Array.isArray(w.specialWeapons)?w.specialWeapons.map(s=>special(s,asset)):null}));
  const bosses=raw.enemyResults.map(e=>({...item(e.enemy,asset),me:number(e.defeatCount),team:number(e.teamDefeatCount),appeared:number(e.popCount)}));
  const sum=values=>values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;
  const rule=group?.rule??raw.rule??'UNKNOWN';
  const reasons=[];
  const interrupted=raw.resultWave===-1&&waves.length===0;
  if(!group)reasons.push('缺少排班汇总，等待归类');
  if(rule!=='REGULAR')reasons.push('此模式暂未支持统计');
  if(![0,1,2,3].includes(raw.resultWave)||number(raw.dangerRate)===null||players.length!==4||new Set(players.map(p=>p.key)).size!==4||players.some(p=>['eggs','kills','power','rescues','deaths'].some(k=>!Number.isInteger(p[k])))||!bosses.every(b=>Number.isInteger(b.team)))reasons.push('结算字段不完整');
  const expected=raw.resultWave===0?3:raw.resultWave;
  const normalWaves=waves.filter(w=>w.number>=1&&w.number<=3);
  if(![1,2,3].includes(expected)||normalWaves.length!==expected||new Set(waves.map(w=>w.number)).size!==waves.length||waves.some(w=>![1,2,3,4].includes(w.number))||!Array.from({length:expected},(_,i)=>i+1).every(n=>normalWaves.some(w=>w.number===n&&Number.isInteger(w.eggs)))||normalWaves.some(w=>!Array.isArray(w.specials)))reasons.push('波次字段不完整');
  const eggs=sum(waves.filter(w=>w.number<=3).map(w=>w.eggs)),playerEggs=sum(players.map(p=>p.eggs));
  if(interrupted){
    for(const reason of ['结算字段不完整','波次字段不完整']){const i=reasons.indexOf(reason);if(i>=0)reasons.splice(i,1)}
    reasons.push('对局中断：没有波次结算，不计入统计');
  }
  return {id:'job-'+hash(raw.id).slice(0,24),shift:group?.id??'unassigned',time:raw.playedTime,rule,supported:reasons.length===0,reasons,interrupted,
    stage:item(raw.coopStage,asset),hazard:number(raw.dangerRate)===null?null:Math.round(raw.dangerRate*1000)/10,clear:raw.resultWave===0,failedWave:raw.resultWave,
    grade:text(raw.afterGrade?.name,'—'),gradeId:gradeId(raw.afterGrade),gradePoint:number(raw.afterGradePoint),eggs,power:sum(players.map(p=>p.power)),kills:sum(bosses.map(b=>b.team)),playerKills:sum(players.map(p=>p.kills)),players,waves,bosses,
    king:raw.bossResult?{...item(raw.bossResult.boss,asset),clear:raw.bossResult.hasDefeatBoss===true}:null,scales:raw.scale??null,
    jobPoint:number(raw.jobPoint),jobScore:number(raw.jobScore),jobRate:number(raw.jobRate),jobBonus:number(raw.jobBonus),eggReconciliationDelta:eggs!==null&&playerEggs!==null?playerEggs-eggs:0};
}
export function groupsOf(summary){
  if(!Array.isArray(summary?.historyGroups?.nodes))throw new Error('invalid_summary');
  return summary.historyGroups.nodes.map(g=>{
    if(!Number.isFinite(Date.parse(g.startTime))||!Number.isFinite(Date.parse(g.endTime))||Date.parse(g.endTime)<=Date.parse(g.startTime)||typeof g.rule!=='string'||!Array.isArray(g.historyDetails?.nodes))throw new Error('invalid_summary');
    return {id:'shift-'+hash(g.rule+'|'+g.startTime+'|'+g.endTime).slice(0,24),start:g.startTime,end:g.endTime,rule:g.rule,total:number(g.playCount),recordIds:g.historyDetails.nodes.map(d=>d.id).filter(id=>typeof id==='string')};
  });
}
export function rejectSecrets(value){
  if(!value||typeof value!=='object')return;
  for(const [key,v] of Object.entries(value)){
    if(/token|password|secret|authorization/i.test(key))throw new Error('credentials_in_import');
    rejectSecrets(v);
  }
}
