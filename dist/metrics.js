'use strict';
window.SalmonStats={
  unusedSpecials(job,player){
    // Attribute uses by stable special ID only when all four assignments are unique.
    if(job.rule!=='REGULAR'||job.clear||![1,2,3].includes(job.failedWave))return null;
    const ids=job.players.map(p=>p.special?.weaponId),id=player.special?.weaponId;
    if(ids.length!==4||ids.some(n=>!Number.isInteger(n))||new Set(ids).size!==4||!ids.includes(id))return null;
    const waves=job.waves.filter(w=>w.number>=1&&w.number<=3);
    if(waves.length!==job.failedWave||!Array.from({length:job.failedWave},(_,i)=>i+1).every(n=>waves.some(w=>w.number===n))||waves.some(w=>!Array.isArray(w.specials)))return null;
    const uses=waves.flatMap(w=>w.specials.map(s=>s.weaponId));
    if(uses.some(n=>!ids.includes(n))||ids.some(n=>uses.filter(u=>u===n).length>2))return null;
    const used=uses.filter(n=>n===id).length;
    return used<2?{used,remaining:2-used}:null;
  },
  passedWaves(job){return job.clear?3:Math.max(0,Math.min(3,job.failedWave-1))},
  killAverage(jobs,clearedOnly=false){
    const sample=clearedOnly?jobs.filter(j=>j.clear):jobs;
    return {count:sample.length,value:sample.length?sample.reduce((n,j)=>n+j.players.find(p=>p.me).kills,0)/sample.length:null};
  },
  suspectedTeammates(jobs){
    const people=new Map();
    [...jobs].sort((a,b)=>a.time.localeCompare(b.time)).forEach((j,i)=>{
      j.players.filter(p=>!p.me).forEach(p=>{
        const row=people.get(p.key)||{key:p.key,name:p.name,last:-2,run:0,longest:0,count:0};
        row.run=row.last===i-1?row.run+1:1;
        row.longest=Math.max(row.longest,row.run);row.last=i;row.count++;row.name=p.name;
        people.set(p.key,row);
      });
    });
    return [...people.values()].filter(p=>p.longest>=3).sort((a,b)=>b.longest-a.longest||b.count-a.count||a.key.localeCompare(b.key));
  },
  segments(jobs,key,metric){
    const segments=[];let current=[];
    jobs.forEach((j,index)=>{
      const p=j.players.find(p=>p.key===key);
      if(p&&Number.isFinite(p[metric]))current.push({index,value:p[metric]});
      else if(current.length){segments.push(current);current=[];}
    });
    if(current.length)segments.push(current);
    return segments;
  }
};
