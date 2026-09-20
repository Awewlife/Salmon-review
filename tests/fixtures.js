const b64=s=>Buffer.from(s).toString('base64');
export function fixture({id='match-1',owner='self',failedWave=0,start='2026-09-19T00:00:00Z',rule='REGULAR'}={}){
  const players=Array.from({length:4},(_,i)=>({player:{id:b64('CoopPlayer:session:'+ (i?`team-${i}`:owner)),name:i?'队友'+i:'测试玩家'},weapons:[{name:'示例武器'}],specialWeapon:{name:'示例大招',weaponId:20001+i},goldenDeliverCount:20+i,goldenAssistCount:i,deliverCount:500,defeatEnemyCount:10+i,rescueCount:i,rescuedCount:i%2}));
  const result={id,playedTime:start.replace('00:00:00','01:00:00'),resultWave:failedWave,myResult:players[0],memberResults:players.slice(1),dangerRate:1.5,coopStage:{name:'示例场地'},weapons:[{name:'示例武器'}],afterGrade:{name:'传说'},afterGradePoint:200,
    waveResults:Array.from({length:failedWave||3},(_,i)=>({waveNumber:i+1,waterLevel:1,deliverNorm:20,teamDeliverCount:30,goldenPopCount:50,eventWave:null,specialWeapons:i===0?players.map(p=>({id:b64('SpecialWeapon-'+p.specialWeapon.weaponId),name:'示例大招'})):[]})),
    enemyResults:[{enemy:{name:'示例巨大鲑鱼'},teamDefeatCount:46,defeatCount:10,popCount:50}],bossResult:null,scale:null,jobPoint:200,jobScore:80,jobRate:2.5,jobBonus:0};
  const summary={historyGroups:{nodes:[{startTime:start,endTime:new Date(Date.parse(start)+40*3600000).toISOString(),rule,playCount:1,historyDetails:{nodes:[{id}]}}]}};
  return {record:{result},summary:{result:summary}};
}
