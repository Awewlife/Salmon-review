'use strict';
window.SalmonReleaseNotes=(()=>{
  // Ship these notes with the app so a completed update needs no GitHub request.
  const releases={'0.3.11':[
    '点击对局中的队员名称，查看该场名片、工服和武器；图片首次查看时缓存。',
    '新增本期击杀详情，支持场次范围、怪物图片和完整 PNG 导出。',
    '更多图表可开启红蛋趋势；导出支持任选四张图表并拖动调整顺序。',
  ],'0.3.10':[
    '主程序与更新组件支持一起更新。首次启用请用新版完整安装包启动一次。',
    '记住图表显示偏好；重新打开趋势详情时，场次范围恢复全部。',
    '新增本期个人纪录：最高段位分数、单场个人搬蛋与巨大鲑鱼击杀、最长连胜。',
  ]};
  const key='salmon-release-notes-seen-v1';
  let seen='';
  try{seen=window.localStorage.getItem(key)||''}catch{}
  let visibleVersion='';
  function observe(version){
    const notice=document.querySelector('#release-notice');
    if(!notice||!releases[version]||seen===version||visibleVersion===version)return;
    visibleVersion=version;
    document.querySelector('#release-notice-title').textContent=`SALMON REVIEW ${version} · 本版新增`;
    document.querySelector('#release-notice-list').replaceChildren(...releases[version].map(text=>{const item=document.createElement('li');item.textContent=text;return item}));
    notice.hidden=false;
    document.querySelector('#dismiss-release-notice').onclick=()=>{
      seen=version;notice.hidden=true;
      try{window.localStorage.setItem(key,version)}catch{}
    };
  }
  function current(version){return releases[version]??[]}
  return {observe,current};
})();
