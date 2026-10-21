import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(saved,extras={}){
  const storage=new Map(saved?[['salmon-language-v1',saved]]:[]);
  const window={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},dispatchEvent(){}};
  const context=vm.createContext({window,Event,...extras});
  for(const name of ['byname-catalog','i18n-catalog','i18n'])vm.runInContext(readFileSync(new URL(`../dist/${name}.js`,import.meta.url),'utf8'),context);
  return {api:window.SalmonI18n,storage};
}
test('language preference defaults safely, persists and keeps Inkling separate from English text',()=>{
  const {api,storage}=setup('unexpected');assert.equal(api.get(),'zh-CN');
  assert.equal(api.set('inkling'),true);assert.equal(api.get(),'inkling');assert.equal(api.locale(),'en');
  assert.equal(storage.get('salmon-language-v1'),'inkling');
  assert.equal(setup(storage.get('salmon-language-v1')).api.get(),'inkling');
  assert.equal(api.set('__proto__'),false);assert.equal(api.get(),'inkling');
});

test('Splashtag titles use official fragments in either source direction, including variants',()=>{
  const {api}=setup();
  const forms={'zh-CN':'最喜欢的星星','zh-TW':'最喜歡的星星',en:'Treasured Star',ja:'大好きなスター',inkling:'Treasured Star'};
  for(const source of Object.values(forms))for(const [locale,expected]of Object.entries(forms))assert.equal(api.byname(source,locale),expected);
  assert.equal(api.byname('最喜欢的公主','en'),'Treasured Princess');
  assert.equal(api.byname('Treasured Princess','ja'),'大好きなプリンセス');
  for(const text of ['自定义未知称号','<img src=x onerror=alert(1)>',''])assert.equal(api.byname(text,'en'),text);
});

test('ambiguous composed titles remain verbatim instead of guessing fragment IDs',()=>{
  const window={SalmonBynameCatalog:{adjectives:[['a','相同的','相同的','First','同じ'],['b','相同的','相同的','Second','同じ']],subjects:[['s','星星','星星','Star','スター']]}};
  const context=vm.createContext({window});vm.runInContext(readFileSync(new URL('../dist/i18n.js',import.meta.url),'utf8'),context);
  assert.equal(window.SalmonI18n.byname('相同的星星','en'),'相同的星星');
  assert.equal(window.SalmonI18n.byname('相同的星星','ja'),'同じスター');
});

test('title nodes translate inside a protected nameplate without changing the nickname',()=>{
  const {api}=setup();
  const holder={hasAttribute:k=>k==='data-byname'};
  const parent=title=>({localName:'span',hasAttribute:()=>false,closest:selector=>selector==='[data-byname]'?(title?holder:null):selector==='[translate="no"]'?(title?null:{}):{}});
  const nodes=[{data:'最喜欢的星星',parentElement:parent(true)},{data:'最喜欢的星星',parentElement:parent(false)}];
  const root={querySelectorAll:()=>[],ownerDocument:{createTreeWalker(){let i=0;return {nextNode:()=>nodes[i++]}}}};
  api.apply(root,'en');assert.equal(nodes[0].data,'Treasured Star');assert.equal(nodes[1].data,'最喜欢的星星');
  api.apply(root,'ja');assert.equal(nodes[0].data,'大好きなスター');
  api.apply(root,'zh-CN');assert.equal(nodes[0].data,'最喜欢的星星');
});
test('localization translates game terms and UI without changing numeric results',()=>{
  const {api}=setup();
  assert.equal(api.t('搬蛋','en'),'Golden Eggs');
  assert.equal(api.t('生筋子系统交流道遗址','en'),"Jammin' Salmon Junction");
  assert.equal(api.t('传说','ja'),'でんせつ');
  assert.equal(api.t('搬蛋','zh-TW'),'搬蛋');
  for(const locale of ['zh-CN','zh-TW','en','ja','inkling']){
    for(const number of ['20.5','479 / 475','25%','10/12 — 10/14','0','112.5%'])assert.equal(api.t(number,locale),number);
  }
});
test('short and punctuation nicknames never corrupt decimal points or replacement markers',()=>{
  const {api}=setup();api.protectNames(['.','S','1','Sample/Player 42','小明','小明同学']);
  assert.equal(api.t('小明同学 · 20.5 · 搬蛋','en'),'小明同学 · 20.5 · Golden Eggs');
  assert.equal(api.t('SALMON REVIEW 112.5%','en'),'SALMON REVIEW 112.5%');
  assert.equal(api.t('Sample/Player 42','ja'),'Sample/Player 42');
});
test('unknown text and HTML-like user text are not interpreted as markup',()=>{
  const {api}=setup();
  assert.equal(api.t('<img src=x onerror=alert(1)>','en'),'<img src=x onerror=alert(1)>');
  assert.equal(api.t('xyz-unknown','ja'),'xyz-unknown');
  assert.equal(api.t(' 搬蛋 ','en'),' Golden Eggs ');
});
test('nested range captions and empty optional exclusion clauses are translated completely',()=>{
  const {api}=setup();
  assert.equal(api.t('本期第 1—37 场 · 已选 37 场 · 统计 37 场 · 0 场未计入','en'),'Jobs 1–37 · 37 selected · 37 valid · 0 excluded');
  const text=api.t('本期第 1—37 场 · 已选 37 场；统计 37 场有效结算，包含通过与失败场次。','en');
  assert.doesNotMatch(text,/[\u3400-\u9fff]/);assert.match(text,/37 valid results/);
});
test('font is never fetched for ordinary languages; failed Inkling export can be retried',async()=>{
  let calls=0;
  const {api}=setup('en',{AbortSignal,fetch:async()=>{calls++;return {ok:false}}});
  await api.prepareExport();assert.equal(calls,0);
  api.set('inkling');await assert.rejects(api.prepareExport(),/inkling_font_unavailable/);
  await assert.rejects(api.prepareExport(),/inkling_font_unavailable/);assert.equal(calls,2);
});

test('Inkling rejects downloadable SVG before loading fonts and rechecks after language changes',async()=>{
  let calls=0;
  const {api}=setup('inkling',{AbortSignal,fetch:async()=>{calls++;return {ok:false}}});
  assert.equal(api.canExport('png'),true);assert.equal(api.canExport('svg'),false);
  await assert.rejects(api.prepareExport('svg'),/inkling_png_only/);
  assert.throws(()=>api.svg('<svg/>'),/inkling_png_only/);
  assert.equal(calls,0);
  api.set('en');await api.prepareExport('svg');assert.equal(api.canExport('svg'),true);
  api.set('inkling');assert.throws(()=>api.assertExport('svg'),/inkling_png_only/);
  assert.equal(api.canExport('html'),false);
});

test('Inkling rasterization has an explicit internal path; ordinary SVG contains no font injection',()=>{
  const {api}=setup('inkling');
  // Without a browser parser this still exercises the guard before any parsing.
  assert.equal(api.svg('<svg/>',{rasterize:true}),'<svg/>');
  api.set('en');assert.equal(api.svg('<svg/>'),'<svg/>');
});

test('rendered match details have complete English text and stable clear badges',()=>{
  const roots=new Map();
  const document={querySelector(selector){if(!roots.has(selector))roots.set(selector,{innerHTML:'',querySelectorAll:()=>[]});return roots.get(selector)},querySelectorAll:()=>[]};
  const player={name:'Test player',key:'test',me:true,eggs:19,kills:9,power:664,rescues:3,deaths:1,assist:2,weapons:[]};
  const job={id:'test-job',shift:'test-shift',index:37,time:'2026-10-01T14:48:00Z',stage:{name:'漂浮落难船'},grade:'达人',gradePoint:60,hazard:86,clear:true,eggs:62,kills:42,power:2554,playerKills:41,players:[player],bosses:[],waves:[{number:1,eggs:19,quota:13,tide:'普通',event:'普通',appeared:27,specials:[]}],king:{name:'辰龙',clear:false},scales:{gold:0,silver:1,bronze:5},jobPoint:244,jobScore:74,jobRate:1.95,jobBonus:100};
  const window={SALMON_DATA:{jobs:[job],shifts:[{id:'test-shift'}],player:'Test player'},SalmonPreferences:{get:()=>({overviewMode:'performance'})}};
  const context=vm.createContext({window,document,SalmonStats:{unusedSpecials:()=>null},SalmonRadarView:{mount(){}},SalmonRadar:{render:()=>''}});
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').split("document.querySelector('.sidebar-bottom>p')")[0];
  vm.runInContext(source,context);
  const {api}=setup('inkling');
  for(const clear of [true,false]){
    job.clear=clear;job.failedWave=3;
    vm.runInContext('detail(DATA.jobs[0])',context);
    const texts=roots.get('#app').innerHTML.split(/<[^>]*>/).map(s=>s.trim()).filter(Boolean);
    for(const text of texts)assert.doesNotMatch(api.t(text),/[\u3400-\u9fff]/,text);
    const badge=vm.runInContext('pill(DATA.jobs[0])',context);
    for(const locale of ['zh-CN','zh-TW','en','ja','inkling']){
      if(clear)assert.match(api.t(badge,locale),/>clear!!<\/span>/);
      else assert.doesNotMatch(api.t(badge,locale),/clear!!/);
    }
  }
  assert.equal(api.t('个人搬蛋不含协助搬运'),'Personal Golden Eggs deposited; assists excluded');
});

test('metric terminology distinguishes eggs, boss defeats and rescues',()=>{
  const {api}=setup();
  for(const [source,en,ja] of [
    ['金鲑鱼卵','Golden Eggs','金イクラ'],['红蛋','Power Eggs','イクラ'],
    ['巨大鲑鱼','Boss Salmonids','オオモノシャケ'],['救援','Rescues','救助数'],
    ['被救援','Times rescued','被救助数'],['击杀','Boss defeats','オオモノ討伐数'],
  ]){assert.equal(api.t(source,'en'),en);assert.equal(api.t(source,'ja'),ja);}
  for(const text of ['生存指数计算说明','本期五维图：搬蛋 122.6%，击杀 87.8%', '查看第 37 场通过的搬蛋数据与详情'])assert.doesNotMatch(api.t(text,'en'),/[\u3400-\u9fff]/,text);
});

test('trend identity suffix translates reversibly while the nickname remains verbatim',()=>{
  const {api}=setup();
  const element=(identity,ui)=>({localName:'tspan',hasAttribute:k=>ui&&k==='data-translate-ui',closest:selector=>selector==='[data-byname]'?null:selector==='[translate="no"]'?(identity?{}:null):{}});
  const nodes=[{data:'搬蛋',parentElement:element(true,false)},{data:' · 我',parentElement:element(false,true)}];
  const root={querySelectorAll:()=>[],ownerDocument:{createTreeWalker(){let i=0;return {nextNode:()=>nodes[i++]}}}};
  for(const [locale,suffix] of [['en',' · Me'],['ja','・自分'],['inkling',' · Me'],['zh-CN',' · 我']]){
    api.apply(root,locale);
    assert.equal(nodes[0].data,'搬蛋');
    assert.equal(nodes[1].data.trim(),suffix.trim());
  }
});

test('reported trend header, toggled button and tooltip phrases have complete translations',()=>{
  const {api}=setup();
  const samples=['鲑鱼心脏斗技场 · 本期已保存 6 / 6 场 · 从早到晚','移除队友对比','四人合计：','协助 3 颗（不计入占比）','点击查看场次详情 ↗'];
  for(const locale of ['en','inkling'])for(const sample of samples)assert.doesNotMatch(api.t(sample,locale),/[\u3400-\u9fff]/,sample);
});

test('language observer only walks changed subtrees and still reverses text on language switches',()=>{
  let mount,notify;const queued=[],walked=[];
  const document={documentElement:{dataset:{}},addEventListener:(_,fn)=>mount=fn};
  const make=(id,text,parent=null)=>{
    const element={id,nodeType:1,isConnected:true,parentElement:parent,localName:'div',ownerDocument:document,children:[],closest:()=>null,hasAttribute:()=>false,querySelectorAll:()=>[],contains(other){for(let n=other;n;n=n.parentElement)if(n===this)return true;return false;}};
    element.text={nodeType:3,data:text,parentElement:element};parent?.children.push(element);return element;
  };
  const body=make('body',''),main=make('main','搬蛋',body),tip=make('tip','四人合计：',body);
  document.body=body;
  document.createTreeWalker=root=>{walked.push(root.id);const nodes=[];const visit=e=>{nodes.push(e.text);e.children.forEach(visit)};visit(root);let i=0;return {nextNode:()=>nodes[i++]}};
  const option={},select={querySelector:()=>option},note={prepend(){}},footer={append(){}};
  document.querySelector=selector=>({'.topbar-note':note,'footer':footer,'#language-select':select}[selector]??null);
  document.createElement=()=>({setAttribute(){},querySelector:()=>select});
  class Observer{constructor(fn){notify=fn}observe(){}disconnect(){}takeRecords(){return []}}
  const {api}=setup('en',{document,MutationObserver:Observer,queueMicrotask:fn=>queued.push(fn)});mount();
  assert.equal(main.text.data,'Golden Eggs');walked.length=0;
  tip.text.data='协助 3 颗（不计入占比）';
  notify([{type:'characterData',target:tip.text}]);queued.shift()();
  assert.deepEqual(walked,['tip']);assert.match(tip.text.data,/3 assisted Golden Eggs/);
  walked.length=0;notify([{type:'childList',target:body,addedNodes:[]}]);assert.equal(queued.length,0);
  api.set('ja');assert.equal(main.text.data,'金イクラ');assert.match(tip.text.data,/納品アシスト3個/);
  api.set('zh-CN');assert.equal(main.text.data,'搬蛋');assert.equal(tip.text.data,'协助 3 颗（不计入占比）');
});

test('diagnostic states and public server errors have complete English and Inkling translations',async()=>{
 const {messages}=await import('../server/errors.js');const {api}=setup();
 const samples=[...Object.values(messages),
 '需要重新连接账号','上游暂时禁止认证','请求受限，请遵守等待时间','数据库读取失败',
 '突出显示 Test player','掉线：无有效波次结算，不计入表现统计',
 '版本 0.4.0 · 已保存 479 场 · 已保存账号连接。当前未在同步；最近任务 完成，50/50，耗时 41.0 秒。上次成功：2026/10/21 19:06:28。连接状态未向上游重新验证。',
 '数据库读取正常（1 ms），数据库 4 MiB，数据卷可用 80 GiB。读写权限检查通过。权限检查未实际写入；可用空间属于容器所在文件系统。',
 '读取并校验完成：475 场可统计、20 期排班、4 条未纳入统计。诊断不会替换当前显示的战绩。',
 '阶段：空闲 · 当前空闲。状态更新于 2026/10/21 19:06:28。本次只读取组件状态，未请求下载源。'];
 for(const locale of ['en','inkling'])for(const text of samples)assert.doesNotMatch(api.t(text,locale),/[\u3400-\u9fff]/,text);
});

test('tooltip attributes and interrupted export captions translate as complete messages',()=>{
 const {api}=setup();
 for(const locale of ['en','inkling'])for(const sample of ['10/13 22:32 · 结束时的段位分数','占比纵轴范围','拖动排序，或使用键盘上、下方向键','拖动排序：搬蛋','· 显示本场记录保存的装扮。','55 场结算 · 2 次中断 · 10/12 19:10 — 10/13 22:32（UTC+8）'])assert.doesNotMatch(api.t(sample,locale),/[\u3400-\u9fff]/,sample);
 assert.equal(api.t('本期通过率','zh-TW'),'本期通關率');
});

test('translation cache invalidates when protected nicknames change and separates locales',()=>{
 const {api}=setup();const text='神奇搬蛋同学';assert.notEqual(api.t(text,'en'),text);
 api.protectNames([text]);assert.equal(api.t(text,'en'),text);
 api.protectNames([]);assert.notEqual(api.t(text,'en'),text);
 assert.equal(api.t('搬蛋','ja'),'金イクラ');assert.equal(api.t('搬蛋','en'),'Golden Eggs');
});
