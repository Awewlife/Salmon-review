'use strict';
window.SalmonReleaseNotes=(()=>{
  // Ship these notes with the app so a completed update needs no GitHub request.
  const releases={'0.4.1':[
    "个人档案新增历史五维图，支持最近 100 场与全部历史或前 100 场对比。",
    "历史对比支持指数／场均表切换和图片导出，对照使用紫色虚线。",
    "新增打工数据速查，离线查看鲑鱼血量、武器伤害及危险度与交蛋配额。",
    "请求受限时按实际剩余时间等待，战绩同步与官方纪录刷新共用等待时间。",
    "整理多语言界面说明，更新依赖安全修复与资料许可。",
  ],'0.4.0':[
    '排班总览新增五维图，对比个人与全队 25% 的五项场均表现。',
    '点击左下角 NSO 头像，查看官方生涯击倒数和各地图历史最高分，支持离线查看。',
    '公开发行版无需 GitHub 令牌即可检查和下载更新。',
    '发行版附带源码与许可证，并包含安全更新。',
    '旧私有版请使用 0.4.0 完整安装包过渡一次，沿用原项目名和数据卷。',
  ],'0.3.12':[
    '调整队员名片排版，长昵称自动缩放；专用字体无法加载时使用系统字体。',
    '改善战绩同步，更新后无需重新登录。',
    '补齐第三方许可材料，并增加发行打包校验。',
  ],'0.3.11':[
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
