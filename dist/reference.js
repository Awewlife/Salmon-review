'use strict';
window.SalmonReference=(()=>{
  const data=window.SalmonReferenceData;
  const tabs={hp:'鲑鱼血量',weapons:'武器伤害',hazard:'危险度计算方式'};
  const state={hp:{query:'',category:''},weapons:{query:'',category:''},hazard:{category:''}};
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t=value=>window.SalmonI18n.t(value);
  const names=new Map();for(const [zh,values] of Object.entries(window.SalmonLocaleCatalog.terms))if(!names.has(values[1]))names.set(values[1],zh);
  const name=value=>t(names.get(value)??value);
  const categoryNames=['射击枪','滚筒','蓄力狙击枪','泼桶','旋转枪','机动枪','防空伞','爆破枪','画笔','弓','刮水刀','特殊武器与其他'];
  const common=['最大伤害','最低伤害','耗墨（%）','最大 DPS','攻击间隔（帧）','回墨延迟（帧）'];
  const headings=[common,['碾压伤害','挥击最大伤害','挥击最低伤害',...common.slice(2)],['满蓄力伤害','未满蓄力伤害',...common.slice(2,4),'蓄力 / 射击（帧）',common[5]],common,[...common.slice(0,4),'蓄力 / 射击（帧）','持续射击（帧）',common[5]],common,common,['直击伤害','爆风伤害',...common.slice(2)],['碰撞伤害','挥击最大伤害','挥击最低伤害',...common.slice(2)],['伤害','耗墨（%）','最大 DPS','蓄力 / 射击（帧）',common[5]],['纵斩伤害','横斩伤害',...common.slice(2)],['最大伤害','最低伤害','耗墨（%）',common[4],common[5]]];
  const notes=[
  "斜线分隔不同射击方式的数值；特殊顺序见数值旁的问号。",
  "挥击伤害、攻击间隔和 DPS 均按“横挥 / 纵挥”排列；耗墨与回墨延迟按“滚动 / 横挥 / 纵挥”排列。滚动耗墨为每帧消耗。",
  "耗墨和 DPS 为满蓄力射击 / 不蓄力点射；时间为蓄满所需时间 / 不蓄力点射间隔。",
  "斜线分隔不同命中方式或分段伤害；具体顺序见数值旁的问号。",
  "DPS 不计蓄力耗时。时间为第一段 + 第二段蓄力 / 射击间隔；持续射击时间为第一段 / 第二段。",
  "伤害、DPS 和射击间隔为普通射击 / 滑步后射击；耗墨及回墨延迟为射击 / 滑步。",
  "最大伤害为全弹命中上限 / 单弹 / 伞面接触；最低伤害为单弹。DPS 为全弹 / 单弹；耗墨为射击 / 发射伞面；回墨延迟为射击 / 开伞 / 发射伞面，省略不可用动作。",
  "DPS 为直击 / 爆风；爆风范围表示远端到近端的伤害。",
  "耗墨与回墨延迟为移动 / 挥击；移动耗墨按每帧计算。",
  "伤害为无蓄力－一圈－满蓄力 / 单发爆炸（×箭数）；耗墨为满蓄力 / 一圈 / 无蓄力。DPS 为单箭数值，括号表示箭数。",
  "纵斩、横斩分别为剑气 / 刀身 / 合计；DPS 为纵斩剑气 / 纵斩合计 / 横斩剑气 / 横斩合计。时间为蓄力 / 横斩间隔 / 纵斩间隔；回墨为横斩 / 纵斩。",
  "斜线分隔不同攻击方式，× 表示数量；每项的具体含义见数值旁的问号。"
];
  function section(hash=location.hash){const m=/^#reference(?:-(hp|weapons|hazard))?$/.exec(hash);return m?m[1]??'hp':null;}
  function matches(row,query){const q=query.trim().toLocaleLowerCase();return !q||row.flatMap(s=>[s,names.get(s)??s,name(s),...(window.SalmonLocaleCatalog.terms[names.get(s)]??[])]).join(' ').toLocaleLowerCase().includes(q);}
  function table(headers,rows,label){return `<div class="reference-table-scroll" tabindex="0" role="region" aria-label="${e(t(label))}"><table><caption class="sr-only">${e(t(label))}</caption><thead><tr>${headers.map(h=>`<th scope="col">${e(t(h))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>`<${i?'td':'th scope="row"'}>${cell}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  const nameCell=value=>`<span class="reference-name"><span class="reference-icon" aria-hidden="true">${window.SalmonReferenceIcons[value]?`<img src="${e(window.SalmonReferenceIcons[value])}" alt="" width="32" height="32" loading="lazy" decoding="async">`:''}</span><span>${e(name(value))}${name(value)!==value?`<small class="reference-original">${e(value)}</small>`:''}</span></span>`;
  function bindImages(root){for(const img of root.querySelectorAll('.reference-icon img')){const failed=()=>{img.hidden=true;};img.addEventListener('error',failed,{once:true});if(img.complete&&!img.naturalWidth)failed();}}

  const rollerDpsHelp='依次为横挥 / 纵挥的每秒伤害。按最大伤害连续挥击，不计回墨耗时。';
  const dynamoDpsHelp='横挥：200 × 60 ÷ 66 ≈ 181.8。\n纵挥：300 × 60 ÷ 85 ≈ 211.8。\n按最大伤害连续挥击，不计回墨耗时。';
  const penDpsHelp='458.6：蓄力＋五连发的平均每秒伤害。\n847.1：只计算蓄力完成后的连射阶段，不计蓄力耗时。\n450：不蓄力连续点射的每秒伤害。';
  const specialHelp={
  "H-3 Nozzlenose": {
    "1": "单发伤害 / 三连发全部命中的总伤害。",
    "2": "单发伤害 / 三连发全部命中的总伤害。",
    "3": "单发耗墨 / 一组三连发的总耗墨。",
    "4": "一组三连发内部的 DPS / 计入组间停顿后的持续射击 DPS。",
    "5": "三连发中两发之间的间隔 / 两组三连发之间的间隔，单位为帧。"
  },
  "L-3 Nozzlenose": {
    "1": "单发伤害 / 三连发全部命中的总伤害。",
    "2": "单发伤害 / 三连发全部命中的总伤害。",
    "3": "单发耗墨 / 一组三连发的总耗墨。",
    "4": "一组三连发内部的 DPS / 计入组间停顿后的持续射击 DPS。",
    "5": "三连发中两发之间的间隔 / 两组三连发之间的间隔，单位为帧。"
  },
  "Squeezer": {
    "1": "依次为点按射击 / 按住连续射击。",
    "2": "依次为点按射击 / 按住连续射击。",
    "3": "依次为点按射击 / 按住连续射击。",
    "4": "依次为点按射击 / 按住连续射击。",
    "5": "依次为点按射击 / 按住连续射击。"
  },
  "Bloblobber": {
    "1": "单个泡泡的伤害 / 四个泡泡全部命中的总伤害。",
    "2": "单个泡泡的伤害 / 四个泡泡全部命中的总伤害。"
  },
  "Dread Wringer": {
    "1": "第一泼伤害 / 第二泼伤害 / 两泼合计。",
    "2": "第一泼伤害 / 第二泼伤害 / 两泼合计。"
  },
  "Explosher": {
    "1": "直击伤害 / 爆风伤害。",
    "2": "直击伤害 / 爆风伤害。",
    "4": "直击 DPS / 爆风 DPS / 两者合计 DPS。"
  },
  "Sloshing Machine": {
    "4": "直击 DPS / 间接命中 DPS。",
    "2": "直击的最低伤害 / 间接命中的最低伤害。"
  },
  "Grizzco Slosher": {
    "4": "直击 DPS / 间接命中 DPS。"
  },
  "Ballpoint Splatling": {
    "4": "近程射击 DPS / 远程射击 DPS；不计蓄力耗时。",
    "5": "第一段 + 第二段蓄力时间 / 近程射击间隔 / 远程射击间隔，单位为帧。"
  },
  "Heavy Edit Splatling": {
    "4": "未满蓄力射击 DPS / 满蓄力射击 DPS；不计蓄力耗时。",
    "5": "第一段 + 第二段蓄力时间 / 未满蓄力射击间隔 / 满蓄力射击间隔，单位为帧。"
  },
  "Hydra Splatling": {
    "4": "未满蓄力射击 DPS / 满蓄力射击 DPS；不计蓄力耗时。",
    "1": "未满蓄力时的单发伤害 / 满蓄力时的单发伤害。"
  },
  "Grizzco Dualies": {
    "1": "子弹伤害 / 滑步爆炸伤害。",
    "2": "子弹伤害 / 滑步爆炸伤害。"
  },
  "Painbrush": {
    "6": "首挥准备时间 / 后续连续挥击间隔，单位为帧。",
    "5": "连续挥击阶段的 DPS，不计首挥准备时间。"
  },
  "REEF-LUX 450": {
    "1": "无蓄力－一圈－满蓄力时的单箭伤害（×3 箭）；箭矢不产生爆炸。"
  },
  "Grizzco Splatana": {
    "1": "仅为刀身命中的伤害；没有剑气伤害。",
    "2": "仅为刀身命中的伤害；没有剑气伤害。",
    "4": "纵斩刀身 DPS / 横斩刀身 DPS；不含剑气。"
  },
  "Crab Tank": {
    "1": "机枪 / 炮弹爆风 / 炮弹直击 / 滚动碰撞伤害。",
    "2": "机枪 / 炮弹爆风 / 炮弹直击 / 滚动碰撞伤害。",
    "4": "机枪射击间隔（加速前－加速后）/ 炮弹发射间隔 / 滚动碰撞间隔，单位为帧。"
  },
  "Inkjet": {
    "1": "炮弹直击伤害。",
    "2": "较远爆风 / 较近爆风的伤害。"
  },
  "Killer Wail 5.1": {
    "1": "每束镭射的每秒伤害 × 6 束；不是单次攻击伤害。"
  },
  "Kraken Royale": {
    "1": "蓄力突击伤害。",
    "2": "跳跃攻击伤害。"
  },
  "Reefslider": {
    "1": "爆炸伤害 / 冲刺接触伤害。"
  },
  "Booyah Bomb": {
    "1": "持续命中时的总伤害。",
    "2": "每次伤害判定的伤害，不是整次攻击的总伤害。"
  },
  "Triple Inkstrike": {
    "1": "持续命中时的总伤害。",
    "2": "每次伤害判定的伤害，不是整次攻击的总伤害。"
  },
  "Triple Splashdown": {
    "1": "每个爆炸的伤害 × 3 个爆炸；括号内为三次全部命中的合计。",
    "2": "每个爆炸的伤害 × 3 个爆炸；括号内为三次全部命中的合计。"
  },
  "Wave Breaker": {
    "1": "冲击波命中伤害。",
    "2": "装置本体接触伤害；本体接触不造成伤害。"
  },
  "Egg cannon": {
    "1": "金鲑鱼卵直击伤害。",
    "2": "金鲑鱼卵爆风伤害。"
  }
};
  function weaponCell(group,row,column){
    let help=group===1&&column===5?(row[0]==='Dynamo Roller'?dynamoDpsHelp:rollerDpsHelp):row[0]==='Snipewriter 5H'&&column===4?penDpsHelp:null;
    let label='DPS 说明';
    if(group===2&&column===5){
      label='蓄力与射击时间说明';
      if(row[0]==='Snipewriter 5H')help='72 帧：蓄满所需时间。\n17 帧：蓄满后连射时，两发之间的间隔。\n8 帧：不蓄力点射间隔。';
      if(row[0]==='Goo Tuber')help='71 帧：完全蓄满所需时间。\n括号内 50 帧：蓄满第一圈所需时间。\n8 帧：不蓄力点射间隔。';
    }
    if(row[0]==='Grizzco Charger'&&column===2){label='未满蓄力伤害说明';help='熊先生狙击枪不能进行未满蓄力射击。';}
    if(specialHelp[row[0]]?.[column]){help=specialHelp[row[0]][column];label=headings[group][column-1];}
    if(!help)return e(row[column]);
    const id=`reference-dps-${group}-${data.weapons[group].rows.indexOf(row)}-${column}`;
    return `<span class="reference-dps">${e(row[column])}<span class="reference-help"><button class="reference-help-button" type="button" aria-label="${e(name(row[0]))} · ${e(t(label))}" aria-describedby="${id}">?</button><span class="reference-help-tip" id="${id}" role="tooltip">${e(t(help))}</span></span></span>`;
  }
  function bindHelp(root){
    for(const help of root.querySelectorAll('.reference-help')){
      const button=help.querySelector('button'),tip=help.querySelector('[role="tooltip"]');
      const show=()=>{
        help.classList.remove('dismissed');
        const bounds=button.getBoundingClientRect(),width=Math.min(300,window.innerWidth-24);
        tip.style.width=width+'px';tip.style.left=Math.max(12,Math.min(bounds.right-width,window.innerWidth-width-12))+'px';
        tip.style.top=Math.max(12,Math.min(bounds.bottom+8,window.innerHeight-tip.offsetHeight-12))+'px';
      };
      help.onpointerenter=show;button.onfocus=show;button.onclick=show;
      button.onkeydown=ev=>{if(ev.key==='Escape'){help.classList.add('dismissed');ev.preventDefault();}};
    }
  }
  const dismissHelp=()=>document.querySelectorAll('.reference-help').forEach(help=>help.classList.add('dismissed'));
  window.addEventListener('scroll',dismissHelp,true);window.addEventListener('resize',dismissHelp);
  function health(){const s=state.hp;const rows=data.health.filter(r=>(!s.category||r[3]===s.category)&&matches(r,s.query));return rows.length?table(['名称','场景','血量（HP）','备注'],rows.map(r=>[nameCell(r[0]),e(t(r[1])),`<strong class="reference-value">${e(r[2])}</strong>`,e(t(r[4]))]),tabs.hp):empty();}
  function weapons(){const s=state.weapons;return data.weapons.map((g,i)=>{
    if(s.category&&s.category!==g.name)return '';
    const rows=g.rows.filter(r=>matches([r[0]],s.query));if(!rows.length)return '';
    return `<section class="reference-group"><h2>${e(t(categoryNames[i]))}<span class="reference-count">${rows.length}</span></h2><details class="reference-explanation"><summary>${e(t('斜线数值说明'))}</summary>${t(notes[i]).split('\n').map(text=>`<p>${e(text)}</p>`).join('')}</details>${table(['武器',...headings[i]],rows.map(r=>[nameCell(r[0]),...r.slice(1).map((v,column)=>weaponCell(i,r,column+1))]),categoryNames[i])}</section>`;
  }).join('')||empty();}
  function hazard(){const ranks=data.ranks.map(r=>[e(name(r.name)),e(r.base),`0–${r.max}`]);const rows=data.quota.filter(r=>!state.hazard.category||r[0]===state.hazard.category).map(r=>[e(name(r[0])),...r.slice(1,4).map(v=>e(v)),r[4].split('; ').map(e).join('<br>')]);
    const paras=['先将各玩家的段位换成基础 IDV，加上段位分数，再取四人平均；每 1 IDV 对应 0.2% 危险度，最高 333%。','示例：四人均为传说 40 → (800 + 40) × 0.2% = 168%。','本表平均分数适用于四人段位相同的情况；混合段位先换算 IDV。游戏及鱿鱼圈的列表可能将危险度四舍五入显示，内部数值并未取整。','掉线后不足四人时，交蛋配额 = 原四人配额 × 有效人数 ÷ 4，向下取整。'];
    return `<div class="reference-rules"><section><h2>${e(t('计算规则'))}</h2>${paras.map(p=>`<p>${e(t(p))}</p>`).join('')}</section><section>${table(['段位','基础 IDV','段位分数范围'],ranks,'段位与内部难度值')}</section></div><section class="reference-group"><h2>${e(t('危险度与交蛋配额'))}</h2><p class="reference-note">${e(t('巨大鲑鱼出现数为每个普通波次的累计上限（W1 / W2 / W3），不是同时在场数量，不含普通鲑鱼与头目鲑鱼；同时在场上限为 15。括号内为对应危险度。'))}</p>${table(['段位','四人平均分数','危险度','交蛋配额 W1 / W2 / W3','巨大鲑鱼最多出现数 W1 / W2 / W3'],rows,'危险度与交蛋配额')}</section>`;
  }
  const empty=()=>`<p class="reference-empty" role="status">${e(t('没有匹配的条目'))}</p>`;
  function results(which){return which==='hp'?health():which==='weapons'?weapons():hazard();}
  function mount(root,which=section()){
    if(!Object.hasOwn(tabs,which))which='hp';
    const s=state[which],src=data.source;
    const categories=which==='hp'?[...new Set(data.health.map(r=>r[3]))].map(v=>[v,t(v)]):which==='weapons'?data.weapons.map((g,i)=>[g.name,t(categoryNames[i])]):data.ranks.map(r=>[r.name,name(r.name)]);
    document.title=`${t('打工数据')} · SALMON REVIEW`;
    document.querySelector('#breadcrumbs').innerHTML=`${e(t('工作台'))} <span>/</span> ${e(t('打工数据'))} <span>/</span> ${e(t(tabs[which]))}`;
    root.innerHTML=`<div class="reference-page" translate="no"><div class="page-heading"><div><div class="eyebrow">SALMON RUN HANDBOOK</div><h1>${e(t('打工数据'))}</h1><p class="subtext">${e(t('离线速查 · 鲑鱼、武器与危险度'))}</p></div></div><nav class="reference-tabs" aria-label="${e(t('打工数据'))}">${Object.entries(tabs).map(([key,label])=>`<a href="#reference-${key}" ${key===which?'aria-current="page"':''}>${e(t(label))}</a>`).join('')}</nav><section class="panel reference-panel"><h2>${e(t(tabs[which]))}</h2><p class="reference-note">${e(t(which==='hp'?'部件与本体的血量分别列出，不共用同一条血量。':which==='weapons'?'仅适用于打工。1 秒 = 60 帧；DPS 为理想条件下的每秒伤害。N/A 表示不适用，? 表示暂无数据。':'无需登录，可离线查看危险度与交蛋配额。'))}</p><div class="reference-toolbar">${which!=='hazard'?`<label><span class="sr-only">${e(t(which==='hp'?'搜索鲑鱼或部件':'搜索武器名称'))}</span><input type="search" id="reference-search" aria-label="${e(t(which==='hp'?'搜索鲑鱼或部件':'搜索武器名称'))}" placeholder="${e(t(which==='hp'?'搜索鲑鱼或部件':'搜索武器名称'))}" value="${e(s.query)}"><button type="button" id="reference-clear" class="button">${e(t('清除搜索'))}</button></label>`:''}<select id="reference-category" aria-label="${e(t(which==='hazard'?'段位筛选':'分类筛选'))}"><option value="">${e(t(which==='hazard'?'全部段位':'全部分类'))}</option>${categories.map(([key,label])=>`<option value="${e(key)}" ${s.category===key?'selected':''}>${e(label)}</option>`).join('')}</select></div><div id="reference-results">${results(which)}</div></section><aside class="reference-source"><h2>${e(t('来源与许可'))}</h2><p><a href="${src.revision}" target="_blank" rel="noopener noreferrer">Inkipedia · Salmon Run Next Wave data</a> · ${e(src.authors)} · <a href="${src.licenseUrl}" target="_blank" rel="noopener noreferrer">${src.license}</a></p><p>${e(t('资料版本'))}: ${src.revisionId} · ${src.checked} · <a href="/reference-NOTICE.txt" target="_blank" rel="noopener noreferrer">${e(t('来源与许可'))}</a></p><p>${e(t('本文表格按来源翻译、节选并重排；社区资料可能滞后于游戏更新。'))}</p><p>${e(t('图标首次查看时下载并缓存；游戏图片版权归原权利人，不适用表格的 CC BY-SA 许可。'))}</p>${which==='weapons'?`<p>${e(t('电动马达滚筒 DPS 与攻击间隔参考：'))} <a href="https://wikiwiki.jp/splatoon3mix/サーモンラン/ブキ別立ち回り/ローラー属" target="_blank" rel="noopener noreferrer">wikiwiki.jp / splatoon3mix</a> · <a href="https://overfishing.wiki/ウェポン情報" target="_blank" rel="noopener noreferrer">overfishing.wiki</a> · 2026-11-01</p>`:''}</aside></div>`;
    bindImages(root);bindHelp(root);
    const update=()=>{root.querySelector('#reference-results').innerHTML=results(which);bindImages(root);bindHelp(root);};
    root.querySelector('#reference-category').onchange=ev=>{s.category=ev.target.value;update();};
    const input=root.querySelector('#reference-search');if(input){input.oninput=()=>{s.query=input.value;update();};root.querySelector('#reference-clear').onclick=()=>{input.value='';s.query='';update();input.focus();};}
  }
  window.addEventListener('salmon-language-change',()=>{if(section())mount(document.querySelector('#app'),section());});
  return {section,mount,matches};
})();
