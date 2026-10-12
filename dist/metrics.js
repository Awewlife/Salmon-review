'use strict';
window.SalmonStats={
  interruptionMarker(x,y){
    return `<circle class="interruption-marker" cx="${x}" cy="${y}" r="4" fill="#202528" stroke="#a8b0b4" stroke-width="1.8"><title>掉线：无有效波次结算，不计入表现统计</title></circle>`;
  },
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
  teamTotal(job,metric){
    const players=job.players??[];
    if(job.interrupted||players.length!==4||new Set(players.map(p=>p.key)).size!==4||players.some(p=>typeof p.key!=='string'||!p.key||!Number.isFinite(p[metric])||p[metric]<0))return null;
    return players.reduce((sum,p)=>sum+p[metric],0);
  },
  share(job,key,metric){
    const total=this.teamTotal(job,metric),player=job.players?.find(p=>p.key===key);
    if(total===null||!player)return null;
    // Display convention agreed for valid all-zero results, not for missing data.
    return total===0?0:player[metric]/total*100;
  },
  valueSegments(jobs,valueOf){
    const segments=[];let current=[];
    jobs.forEach((job,index)=>{
      const value=valueOf(job);
      if(value===null||(index>0&&job.continuousWithPrevious!==true)){
        if(current.length)segments.push(current);current=[];
      }
      if(value!==null)current.push({index,value});
    });
    if(current.length)segments.push(current);
    return segments;
  },
  trendSegments(jobs,key,metric,mode='quantity'){
    return mode==='share'?this.valueSegments(jobs,job=>this.share(job,key,metric)):this.segments(jobs,key,metric);
  },
  suspectedTeammates(jobs){
    const people=new Map();
    [...jobs].sort((a,b)=>a.time.localeCompare(b.time)).forEach((j,i)=>{
      j.players.filter(p=>!p.me).forEach(p=>{
        const row=people.get(p.key)||{key:p.key,name:p.name,last:-2,run:0,longest:0,count:0};
        // Keep confirmed roster continuity through interruptions, without counting them as played matches.
        row.run=(row.last===i-1&&j.continuousWithPrevious===true?row.run:0)+(j.interrupted?0:1);
        row.longest=Math.max(row.longest,row.run);row.last=i;if(!j.interrupted)row.count++;row.name=p.name;
        people.set(p.key,row);
      });
    });
    return [...people.values()].filter(p=>p.longest>=3).sort((a,b)=>b.longest-a.longest||b.count-a.count||a.key.localeCompare(b.key));
  },
  segments(jobs,key,metric){
    const segments=[];let current=[];
    jobs.forEach((j,index)=>{
      if(index>0&&j.continuousWithPrevious!==true&&current.length){segments.push(current);current=[];}
      const p=j.players.find(p=>p.key===key);
      // Zero is a display position for interrupted records, never a statistical value.
      if(p&&(j.interrupted||Number.isFinite(p[metric])))current.push({index,value:j.interrupted?0:p[metric]});
      else if(current.length){segments.push(current);current=[];}
    });
    if(current.length)segments.push(current);
    return segments;
  }
};
