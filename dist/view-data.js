'use strict';
// Tab-scoped display cache only. Never store status responses or credentials.
window.SalmonViewData=(()=>{
  const key='salmon-review-view-v1';
  const valid=data=>!!data&&Array.isArray(data.jobs)&&Array.isArray(data.shifts)&&typeof data.player==='string'&&
    data.jobs.every(job=>job&&Array.isArray(job.players)&&job.players.length&&data.shifts.some(shift=>shift.id===job.shift));
  const signature=data=>JSON.stringify({...data,generated:undefined});
  function load(){try{const data=JSON.parse(sessionStorage.getItem(key));return valid(data)?data:null}catch{return null}}
  function save(data){try{sessionStorage.setItem(key,JSON.stringify(data))}catch{/* Storage may be disabled or full; live display still works. */}}
  return {valid,signature,load,save};
})();
window.SALMON_DATA=window.SalmonViewData.load();
