import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {referenceIconUrl} from '../server/reference-icons.js';
const read=name=>fs.readFileSync(new URL(`../dist/${name}`,import.meta.url),'utf8');
function setup(locale='zh-CN'){
  const window={addEventListener(){},localStorage:{getItem:()=>locale}},context=vm.createContext({window,Event});
  for(const script of ['i18n-catalog','reference-i18n','i18n','reference-data','reference-icons','reference'])vm.runInContext(read(script+'.js'),context);
  const fields=new Map(),root={innerHTML:'',querySelectorAll:()=>[],querySelector(selector){if(!fields.has(selector))fields.set(selector,{innerHTML:'',value:'',focus(){}});return fields.get(selector);}};
  context.document={querySelector:()=>({innerHTML:''})};context.location={hash:'#reference-hp'};
  return {context,root,fields,data:window.SalmonReferenceData,api:window.SalmonReference,i18n:window.SalmonI18n};
}
test('reference preserves complete selected tables and Salmon Run rather than PvP damage',()=>{
  const {data}=setup();assert.equal(data.health.length,28);assert.equal(data.quota.length,43);assert.equal(data.weapons.length,12);assert.equal(data.weapons.flatMap(g=>g.rows).length,83);
  const weapon=n=>data.weapons.flatMap(g=>g.rows).find(r=>r[0]===n);
  assert.equal(weapon('.96 Gal')[1],'85');assert.equal(weapon('Sploosh-o-matic')[1],'45');assert.equal(weapon('E-liter 4K')[1],'600');assert.equal(weapon('Grizzco Splatana')[1],'1200');assert.equal(weapon('Splat Brella')[5],'29/?');
  assert.deepEqual(Array.from(data.health.find(r=>r[0]==='Flyfish')).slice(1,3),['一般','360 / 300']);
  assert.equal(data.quota.at(-1)[2],'333.0%');assert.equal(data.quota.at(-1)[3],'30-32-35');assert.equal(data.quota[3][4],'3-4-5 (12.0%-13.8%); 4-4-5 (14.0%-15.8%)');
  for(const g of data.weapons)assert.ok(g.rows.every(r=>r.length===g.rows[0].length),g.name);
});
test('all handbook views render in all languages with complete English and Inkling UI',()=>{
  for(const locale of ['zh-CN','zh-TW','en','ja','inkling']){
    const {api,root}=setup(locale);
    for(const section of ['hp','weapons','hazard']){
      api.mount(root,section);assert.match(root.innerHTML,/CC BY-SA 4.0/);assert.match(root.innerHTML,/738411/);assert.ok(root.innerHTML.includes(`href="#reference-${section}" aria-current="page"`));
      if(locale==='en'||locale==='inkling')assert.doesNotMatch(root.innerHTML.replace(/<[^>]*>/g,''),/[\u3400-\u9fff]/,`${locale}/${section}`);
      if(locale==='zh-TW')assert.doesNotMatch(root.innerHTML.replace(/<[^>]*>/g,''),/[伤资译滞戏驾驶锅弹篮减帧迟压挥斩枪泼伞笔远审剑气义镭跃鲨骑赞终极陆声呐冲难础将况]/,`traditional/${section}`);
    }
  }
});
test('search matches localized and original names, preserves selections and escapes input',()=>{
  const {api,root,fields}=setup('en');api.mount(root,'weapons');const input=fields.get('#reference-search');input.value='斯普拉射击枪';input.oninput();
  let results=fields.get('#reference-results').innerHTML;assert.match(results,/Splattershot/);assert.doesNotMatch(results,/Grizzco Roller/);
  input.value='スプラシューター';input.oninput();assert.match(fields.get('#reference-results').innerHTML,/Splattershot/);
  input.value='<img src=x onerror=alert(1)>';input.oninput();api.mount(root,'weapons');assert.doesNotMatch(root.innerHTML,/<img src=x/);assert.match(root.innerHTML,/No matching entries/);
  fields.get('#reference-clear').onclick();assert.match(fields.get('#reference-results').innerHTML,/Grizzco Roller/);
  const select=fields.get('#reference-category');select.onchange({target:{value:'Chargers'}});results=fields.get('#reference-results').innerHTML;assert.match(results,/E-liter/);assert.doesNotMatch(results,/Splattershot/);
  api.mount(root,'hp');api.mount(root,'weapons');assert.match(root.innerHTML,/value="Chargers" selected/);
});
test('handbook route works before records load, supports deep links and is excluded from chart resize',()=>{
  const {api,context,root}=setup();assert.equal(api.section('#reference'),'hp');assert.equal(api.section('#reference-weapons'),'weapons');assert.equal(api.section('#reference-hazard'),'hazard');assert.equal(api.section('#job-1'),null);assert.equal(api.section('#reference-invalid'),null);
  const source=read('app.js'),route=source.slice(source.indexOf('function route('),source.indexOf("document.querySelector('.sidebar-bottom>p')"));
  let mounted=0;context.window.SalmonReference.mount=()=>mounted++;context.window.scrollTo=()=>{};
  context.document.querySelector=()=>({classList:{toggle(){},remove(){}}});context.app=root;context.hasData=false;
  vm.runInContext(route+';route();',context);assert.equal(mounted,1);
  assert.match(source,/if\(!window\.SalmonReference\.section\(\)&&DATA\.jobs\.length/);
});
test('license notice and required scripts ship in the frontend',()=>{
  const html=read('index.html');for(const name of ['reference-data.js','reference-icons.js','reference-i18n.js','reference.js','reference.css'])assert.ok(html.includes(name));
  assert.ok(html.indexOf('reference-i18n.js')<html.indexOf('src="i18n.js"'));
  assert.match(read('reference-NOTICE.txt'),/Attribution-ShareAlike 4.0/);assert.match(read('reference-NOTICE.txt'),/action=history/);
});

test('all source icons map to the restricted cache endpoint, including every weapon',()=>{
  const {context,data,api,root}=setup();
  const icons=JSON.parse(fs.readFileSync(new URL('../server/reference-icons.json',import.meta.url)));
  assert.equal(Object.keys(icons).length,106);
  for(const [name,{url,source}] of Object.entries(icons)){
    const id=createHash('sha256').update(url).digest('hex');
    assert.equal(context.window.SalmonReferenceIcons[name],'/assets/'+id);
    assert.equal(referenceIconUrl(id),url);
    assert.ok(read('reference-NOTICE.txt').includes(source));
  }
  assert.equal(referenceIconUrl('0'.repeat(64)),undefined);
  for(const group of data.weapons)for(const row of group.rows)assert.ok(icons[row[0]],row[0]);
  assert.deepEqual([...new Set(data.health.filter(row=>!icons[row[0]]).map(row=>row[0]))],['Drizzler missile','Mothership container']);
  api.mount(root,'weapons');assert.equal((root.innerHTML.match(/loading="lazy"/g)||[]).length,83);
  assert.doesNotMatch(root.innerHTML,/<img[^>]*src="https:/);
  api.mount(root,'hazard');assert.match(root.innerHTML,/巨大鲑鱼最多出现数 W1 \/ W2 \/ W3/);assert.match(root.innerHTML,/每个普通波次的累计上限/);
});

test('Dynamo correction matches damage and timing; DPS explanations are linked tooltips',()=>{
  const {data,api,root}=setup();
  const roller=data.weapons.find(group=>group.name==='Rollers').rows.find(row=>row[0]==='Dynamo Roller');
  const damage=roller[2].split('/').map(Number),frames=roller[6].split('/').map(Number),dps=roller[5].split('/').map(Number);
  assert.deepEqual(frames,[66,85]);
  assert.deepEqual(dps,damage.map((value,i)=>Number((value*60/frames[i]).toFixed(1))));
  api.mount(root,'weapons');
  assert.match(root.innerHTML,/181\.8\/211\.8<span class="reference-help">/);
  assert.match(root.innerHTML,/458\.6\/847\.1\/450<span class="reference-help">/);
  const buttons=[...root.innerHTML.matchAll(/aria-describedby="(reference-dps-[^"]+)"/g)];
  assert.ok(buttons.length>50);assert.equal(new Set(buttons.map(match=>match[1])).size,buttons.length);
  for(const [,id] of buttons)assert.ok(root.innerHTML.includes(`id="${id}" role="tooltip"`));
  assert.doesNotMatch(root.innerHTML,/待核实|reference-dps-line/);
});

test('weapon-specific hints target existing cells and stay out of category explanations',()=>{
  const source=read('reference.js').replace(/\r\n/g,'\n'),start=source.indexOf('  const specialHelp=')+'  const specialHelp='.length;
  const hints=JSON.parse(source.slice(start,source.indexOf(';\n  function weaponCell',start)));
  for(const locale of ['zh-CN','zh-TW','en','ja','inkling']){
    const {data,api,root}=setup(locale);api.mount(root,'weapons');
    const summaries=[...root.innerHTML.matchAll(/<details class="reference-explanation">([\s\S]*?)<\/details>/g)].map(m=>m[1]).join('');
    assert.doesNotMatch(summaries,/R-PEN|Snipewriter|开瓶|開瓶|Squeezer|ボトルガイザー|文森|Painbrush|フィンセント|螃蟹|Crab Tank|カニタンク/);
    for(const [weapon,columns] of Object.entries(hints)){
      const group=data.weapons.findIndex(g=>g.rows.some(row=>row[0]===weapon));assert.ok(group>=0,weapon);
      const row=data.weapons[group].rows.findIndex(r=>r[0]===weapon);
      for(const column of Object.keys(columns)){
        assert.ok(Number(column)>0&&Number(column)<data.weapons[group].rows[row].length,`${weapon}/${column}`);
        assert.ok(root.innerHTML.includes(`id="reference-dps-${group}-${row}-${column}" role="tooltip"`),`${locale}/${weapon}/${column}`);
      }
    }
  }
});
