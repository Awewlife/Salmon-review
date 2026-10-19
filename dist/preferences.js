'use strict';
window.SalmonPreferences=(()=>{
  const key='salmon-chart-preferences-v1';
  const defaults={overviewMode:'performance',mode:'quantity',shareScale:'auto',showNames:true,showQuarter:false,showTotal:false,showPower:false};
  const allowed={overviewMode:['performance','score'],mode:['quantity','share'],shareScale:['auto','fixed']};
  function clean(value){
    const result={};
    if(!value||typeof value!=='object')return result;
    for(const name of Object.keys(defaults)){
      if(allowed[name]?allowed[name].includes(value[name]):typeof value[name]==='boolean')result[name]=value[name];
    }
    const metrics=['eggs','kills','deaths','power'];
    for(const name of ['exportChartOrder','exportChartSelection']){
      const list=value[name];
      if(Array.isArray(list)&&list.every(item=>metrics.includes(item))&&new Set(list).size===list.length&&(name!=='exportChartOrder'||list.length===metrics.length))result[name]=[...list];
    }
    return result;
  }
  let saved={};
  try{saved=clean(JSON.parse(window.localStorage.getItem(key)))}catch{}
  return {
    get:()=>JSON.parse(JSON.stringify({...defaults,...saved})),
    save:patch=>{saved={...saved,...clean(patch)};try{window.localStorage.setItem(key,JSON.stringify(saved))}catch{}},
  };
})();
