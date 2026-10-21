'use strict';
// Presentation-only localization: never rewrite saved results or form values.
window.SalmonI18n=(()=>{
  const choices={'zh-CN':'简体中文','zh-TW':'繁體中文','en':'English','ja':'日本語','inkling':'鱿鱼语 / Inkling'};
  const key='salmon-language-v1',catalog=window.SalmonLocaleCatalog??{messages:{},terms:{},traditional:{}};
  let language='zh-CN';try{const saved=window.localStorage?.getItem(key);if(Object.hasOwn(choices,saved))language=saved}catch{}
  const effective=()=>language==='inkling'?'en':language;
  const inklingUrl='https://cdn.jsdelivr.net/gh/frozenpandaman/frozenpandaman.github.io@70f9b936a841672da15d1342ad99db63d3c50229/Inkling_v2.otf';
  let inklingData='',inklingRequest;
  const canExport=format=>format==='png'||(format==='svg'&&language!=='inkling');
  function assertExport(format){if(!canExport(format))throw new Error('inkling_png_only');}
  async function prepareExport(format='png'){
    assertExport(format);
    if(language!=='inkling'||inklingData)return;
    if(!inklingRequest)inklingRequest=(async()=>{
      const response=await fetch(inklingUrl,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('inkling_font_unavailable');
      const blob=await response.blob();
      inklingData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
    })().catch(error=>{inklingRequest=null;throw error});
    await inklingRequest;
  }
  const column=locale=>({'zh-TW':0,en:1,ja:2,inkling:1})[locale];
  let bynameIndexes;
  const bynameCache=new Map();
  function byname(value,locale=effective()){
    const source=String(value??''),slot=({'zh-CN':1,'zh-TW':2,en:3,inkling:3,ja:4})[locale];
    const data=window.SalmonBynameCatalog;if(!data||!slot||!source)return source;
    const cacheKey=locale+'\0'+source;if(bynameCache.has(cacheKey))return bynameCache.get(cacheKey);
    if(!bynameIndexes)bynameIndexes=[1,2,3,4].map(i=>{
      const subjects=new Map();for(const row of data.subjects){if(!subjects.has(row[i]))subjects.set(row[i],[]);subjects.get(row[i]).push(row);}
      return {i,subjects,adjectives:data.adjectives};
    });
    const outputs=new Set();
    for(const {i,subjects,adjectives} of bynameIndexes)for(const adjective of adjectives){
      const prefix=adjective[i]+(i===3?' ':'');if(!source.startsWith(prefix))continue;
      for(const subject of subjects.get(source.slice(prefix.length))??[])outputs.add(adjective[slot]+(slot===3?' ':'')+subject[slot]);
    }
    // Saved snapshots only contain the composed text, so ambiguous IDs must not
    // be guessed. Identical destination strings are safe even with duplicate IDs.
    const result=outputs.size===1?[...outputs][0]:source;
    if(bynameCache.size>=2048)bynameCache.clear();bynameCache.set(cacheKey,result);return result;
  }
  const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const entries={...catalog.terms,...catalog.messages};
  const patterns=Object.entries(entries).filter(([key])=>/\{\d+\}/.test(key)).map(([key,values])=>{
    const indices=[];let cursor=0,pattern='^';
    for(const match of key.matchAll(/\{(\d+)\}/g)){pattern+=escapeRegex(key.slice(cursor,match.index))+'(.*?)';indices.push(Number(match[1]));cursor=match.index+match[0].length}
    pattern+=escapeRegex(key.slice(cursor))+'$';return {key,values,indices,regex:new RegExp(pattern)};
  }).sort((a,b)=>b.key.replace(/\{\d+\}/g,'').length-a.key.replace(/\{\d+\}/g,'').length);
  const words=Object.keys(entries).filter(k=>!k.includes('{')&&k.length>1).sort((a,b)=>b.length-a.length);
  const wordPattern=new RegExp(words.map(escapeRegex).join('|'),'g');
  let namePattern=null;
  const translationCache=new Map();
  function protectNames(values){
    translationCache.clear();
    const candidates=[...new Set(values)].filter(name=>typeof name==='string'&&/[\u3400-\u9fff]/.test(name)&&name.length>1&&!entries[name]).sort((a,b)=>b.length-a.length);
    namePattern=candidates.length?new RegExp(candidates.map(escapeRegex).join('|'),'g'):null;
  }
  function translateCore(text,locale){
    if(locale==='zh-CN')return text;
    const slot=column(locale),trim=text.trim();
    if(!trim)return text;
    let result;
    if(entries[trim])result=entries[trim][slot];
    else {
      for(const entry of patterns){const match=entry.regex.exec(trim);if(!match)continue;
        const args={};entry.indices.forEach((index,i)=>args[index]=match[i+1]);
        result=entry.values[slot].replace(/\{(\d+)\}/g,(_,i)=>translateCore(args[i]??'',locale));break;
      }
    }
    return text.slice(0,text.indexOf(trim))+(result??translateWords(trim,locale))+text.slice(text.indexOf(trim)+trim.length);
  }
  function translateWords(text,locale){
    const slot=column(locale);
    // One replacement pass prevents Japanese output being reinterpreted as Chinese.
    let result=text.replace(wordPattern,word=>entries[word][slot]);
    if(locale==='zh-TW')return result.replace(/[\u3400-\u9fff]/g,c=>catalog.traditional[c]??c);
    const units=locale==='ja'?{颗:'個',只:'体',次:'回',场:'回',波:'WAVE',分:'pt'}:{颗:'eggs',只:'',次:'times',场:'jobs',波:'waves',分:'pt'};
    result=result.replace(/(^|[\d\s/])([颗只次场波分])(?=$|[\s·/，。；）])/g,(_,prefix,unit)=>prefix+units[unit]);
    return result;
  }
  function t(value,locale=effective()){
    const text=String(value??'');if(locale==='zh-CN')return text;
    const cacheKey=locale+'\0'+text;if(translationCache.has(cacheKey))return translationCache.get(cacheKey);
    const protectedValues=[];let masked=text;
    // Only mixed UI text needs name masking. Latin names cannot be changed by
    // Chinese translation, and masking punctuation/one-letter names corrupts
    // otherwise ordinary labels and decimal values. Identity nodes are excluded.
    if(namePattern)masked=masked.replace(namePattern,name=>{const marker='\uE100'+protectedValues.length+'\uE101';protectedValues.push(name);return marker});
    const output=translateCore(masked,locale).replace(/\uE100(\d+)\uE101/g,(_,index)=>protectedValues[Number(index)]);
    if(translationCache.size>=2048)translationCache.clear();translationCache.set(cacheKey,output);return output;
  }
  // Keep per-node source text, allowing reversible switching without rebuilding
  // dialogs, losing selections, or interrupting an in-progress authentication form.
  const textState=new WeakMap(),attributeState=new WeakMap();
  const excluded='script,style,code,pre,textarea,input,[translate="no"],.nameplate-copy,.player-card-trigger,.trend-line-label';
  // Identity text stays verbatim, but its surrounding UI hints still translate.
  const attributeExcluded='script,style,code,pre,[translate="no"]';
  const attrs=['title','aria-label','placeholder','alt'];
  function original(state,current){return state&&current===state.output?state.source:current}
  function apply(root,locale=effective(),remember=true){
    if(!root?.querySelectorAll)return;
    const doc=root.ownerDocument??root;
    const walker=doc.createTreeWalker(root,4);
    let node;while((node=walker.nextNode())){
      const parent=node.parentElement;if(!parent)continue;
      const titleNode=parent.closest('[data-byname]');
      const uiText=(parent.localName==='title'||parent.hasAttribute('data-translate-ui')||titleNode)&&!parent.closest('[translate="no"]');
      if(parent.closest(excluded)&&!uiText)continue;
      const previous=remember?textState.get(node):null;
      if(previous?.locale===locale&&node.data===previous.output)continue;
      const source=original(previous,node.data),output=titleNode?byname(source,locale):t(source,locale);
      if(node.data!==output)node.data=output;if(remember)textState.set(node,{source,output,locale});
    }
    for(const element of [root,...root.querySelectorAll('[title],[aria-label],[placeholder],[alt]')]){
      if(!element.getAttribute||element.closest?.(attributeExcluded))continue;
      let state=attributeState.get(element);if(!state)state={};
      for(const attr of attrs){if(!element.hasAttribute(attr))continue;
        if(remember&&state[attr]?.locale===locale&&element.getAttribute(attr)===state[attr].output)continue;
        const source=original(remember?state[attr]:null,element.getAttribute(attr)),output=element.hasAttribute('data-byname')?byname(source,locale):t(source,locale);
        if(source!==output||element.getAttribute(attr)!==output)element.setAttribute(attr,output);
        state[attr]={source,output,locale};
      }
      if(remember)attributeState.set(element,state);
    }
  }
  function svg(source,{rasterize=false}={}){
    // Embedded font bytes are only an in-memory input to PNG rasterization.
    // Never return a downloadable Inkling SVG, including after a locale switch.
    if(!rasterize)assertExport('svg');
    if(effective()==='zh-CN'||typeof DOMParser==='undefined')return source;
    const doc=new DOMParser().parseFromString(source,'image/svg+xml');
    if(doc.querySelector('parsererror'))throw new Error('invalid_export_svg');
    apply(doc.documentElement,effective(),false);
    if(language==='inkling'){
      const style=doc.createElementNS('http://www.w3.org/2000/svg','style');
      style.textContent=`@font-face{font-family:'Salmon Inkling';src:url('${inklingData||inklingUrl}') format('opentype')}text,tspan{font-family:'Salmon Inkling',sans-serif!important}`;
      doc.documentElement.append(style);
      const credit=doc.createElementNS('http://www.w3.org/2000/svg','metadata');
      credit.textContent='Inkling v2 by eli / frozenpandaman. Non-commercial use; credit required. https://frozenpandaman.github.io/inkling.html';
      doc.documentElement.append(credit);
      const attribution=doc.createElementNS('http://www.w3.org/2000/svg','text');
      attribution.setAttribute('x','30');attribution.setAttribute('y','13');
      attribution.setAttribute('style','font-size:9px;fill:#a8b0b4');
      attribution.textContent='Inkling v2 by eli / frozenpandaman — non-commercial — frozenpandaman.github.io/inkling.html';
      doc.documentElement.append(attribution);
    }
    // Fit long labels without changing numerical point positions.
    for(const node of doc.querySelectorAll('text')){
      if(node.hasAttribute('textLength')||node.closest('[translate="no"]'))continue;
      const value=node.textContent;if(value.length<80)continue;
      const svg=node.ownerSVGElement,width=Number(svg?.getAttribute('width'))||Number(svg?.getAttribute('viewBox')?.split(/\s+/)[2])||900;
      const x=Number(node.getAttribute('x'))||0;
      const size=Number(node.getAttribute('style')?.match(/font-size:\s*([\d.]+)/)?.[1])||14;
      const estimate=[...value].reduce((sum,char)=>sum+(/[\u3400-\u9fff]/.test(char)?1:.62),0)*size;
      if(estimate>width-x-30&&node.getAttribute('text-anchor')!=='end'){node.setAttribute('textLength',String(Math.max(100,width-x-30)));node.setAttribute('lengthAdjust','spacingAndGlyphs')}
    }
    return new XMLSerializer().serializeToString(doc.documentElement);
  }
  let observer,scheduled=false,nameData=null;
  const pendingRoots=new Set();
  const observe=()=>observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  function updateNames(){
    const data=window.SALMON_DATA;
    if(data&&data!==nameData){nameData=data;protectNames([data.player,...(data.chartJobs??data.jobs??[]).flatMap(j=>(j.players??[]).flatMap(p=>[p.name,p.appearance?.byname]))]);}
  }
  function collectChanges(records){
    for(const record of records){
      const nodes=record.type==='childList'?record.addedNodes:[record.target];
      for(const node of nodes){const root=node.nodeType===3?node.parentElement:node;if(root?.nodeType===1)pendingRoots.add(root);}
    }
  }
  function queueChanges(records){
    collectChanges(records);
    if(!pendingRoots.size||scheduled)return;
    scheduled=true;queueMicrotask(()=>{
      scheduled=false;collectChanges(observer?.takeRecords()??[]);observer?.disconnect();updateNames();
      const roots=[...pendingRoots].filter(root=>root.isConnected);pendingRoots.clear();
      // Hover updates touch small notes/tooltips; never rescan the entire page.
      for(const root of roots)if(!roots.some(other=>other!==root&&other.contains(root)))apply(root);
      observe();
    });
  }
  function refresh(){
    if(typeof document==='undefined')return;
    observer?.disconnect();
    pendingRoots.clear();updateNames();
    apply(document.body);document.documentElement.lang=effective();document.documentElement.dataset.language=language;
    const select=document.querySelector('#language-select');if(select){select.value=language;select.querySelector('[value="inkling"]').textContent=language==='inkling'?'Inkling':choices.inkling;}
    const notice=document.querySelector('#inkling-notice');if(notice)notice.hidden=language!=='inkling';
    observe();
  }
  function set(value){
    if(!Object.hasOwn(choices,value))return false;
    language=value;try{window.localStorage?.setItem(key,value)}catch{}
    refresh();window.dispatchEvent?.(new Event('salmon-language-change'));return true;
  }
  function mount(){
    const note=document.querySelector('.topbar-note');if(!note)return;
    const label=document.createElement('label');label.className='language-control';label.setAttribute('translate','no');
    label.innerHTML='<span aria-hidden="true">🌐</span><select id="language-select" aria-label="Language / 语言 / 言語">'+Object.entries(choices).map(([value,name])=>`<option value="${value}">${name}</option>`).join('')+'</select>';
    note.prepend(label);label.querySelector('select').onchange=event=>set(event.target.value);
    const footer=document.querySelector('footer'),notice=document.createElement('p');notice.id='inkling-notice';notice.setAttribute('translate','no');
    notice.innerHTML='Inkling font by <a href="https://frozenpandaman.github.io/inkling.html" target="_blank" rel="noreferrer noopener">eli / frozenpandaman</a> · Non-commercial use; credit required. Loaded remotely when enabled; English fallback if unavailable. Decorative font, not a language translation. <a href="/fonts/INKLING-NOTICE.txt" target="_blank" rel="noreferrer noopener">Font notice</a>';
    footer?.append(notice);
    observer=new MutationObserver(queueChanges);
    refresh();
  }
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',mount,{once:true});
  return {t,byname,apply,svg,prepareExport,canExport,assertExport,set,refresh,protectNames,get:()=>language,locale:effective,choices};
})();
