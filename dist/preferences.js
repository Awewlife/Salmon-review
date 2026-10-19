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
    return result;
  }
  let saved={};
  try{saved=clean(JSON.parse(window.localStorage.getItem(key)))}catch{}
  return {
    get:()=>({...defaults,...saved}),
    save:patch=>{saved={...saved,...clean(patch)};try{window.localStorage.setItem(key,JSON.stringify(saved))}catch{}},
  };
})();
