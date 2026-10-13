import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.js';
import {appearance} from '../server/normalize.js';
import {createApp} from '../server/main.js';
import {fixture} from './fixtures.js';

const url=name=>`https://example.nintendo.net/${name}.png`;
function dress(player,name){Object.assign(player,{byname:'测试称号',nameId:'1234',uniform:{name,image:{url:url(name)}},nameplate:{background:{image:{url:url('banner')},textColor:{r:1,g:0.5,b:0,a:1}},badges:[{image:{url:url('badge')}},null,null]}})}

test('appearance is preserved per match and backup; old records and unsafe URLs remain safe',t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'salmon-card-')),store=new Store(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
  const a=fixture({id:'first'}),b=fixture({id:'second'});dress(a.record.result.memberResults[0].player,'orange');dress(b.record.result.memberResults[0].player,'blue');
  store.import([a.record,a.summary,b.record,b.summary]);
  const [first,second]=store.snapshot().jobs.map(j=>j.players[1]);
  assert.equal(first.key,second.key);assert.equal(first.appearance.uniform.name,'orange');assert.equal(second.appearance.uniform.name,'blue');
  assert.notEqual(first.appearance.uniform.image,second.appearance.uniform.image);
  assert.match(first.appearance.uniform.image,/^\/assets\/[a-f0-9]{64}$/);
  assert.equal(first.appearance.nameplate.textColor,'rgba(255,128,0,1)');
  assert.deepEqual(first.appearance.nameplate.badges.slice(1),[null,null]);
  assert.equal(store.snapshot().jobs[0].players[0].appearance,null);
  assert.equal(store.backup().documents.filter(d=>d.result.memberResults)[0].result.memberResults[0].player.uniform.name,'orange');
  const unsafe={uniform:{name:'bad',image:{url:'http://localhost/private'}},nameplate:{background:{image:{url:'https://attacker.example/a.png'},textColor:{r:'red',g:0,b:0,a:1}},badges:[{image:{url:'javascript:alert(1)'}}]}};
  const normalized=appearance(unsafe,u=>u||'');assert.equal(normalized.uniform.image,'');assert.equal(normalized.nameplate.background,'');assert.equal(normalized.nameplate.textColor,null);assert.deepEqual(normalized.nameplate.badges,['']);
});

test('appearance markup escapes names, only contains local deferred image URLs, and handles absent fields',()=>{
  const c={window:{addEventListener(){}}};vm.createContext(c);vm.runInContext(readFileSync(new URL('../dist/player-card.js',import.meta.url),'utf8'),c);
  const html=c.window.SalmonPlayerCard.render({name:'<script>alert(1)</script>',appearance:{byname:'<img>',nameId:'123',uniform:{name:'"工服',image:'/assets/'+'a'.repeat(64)},nameplate:{background:'https://attacker.example/image',textColor:'red;position:fixed',badges:[null]}}},'<地图>');
  assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('attacker.example'));assert(!html.includes('position:fixed'));assert(!/\ssrc=/.test(html));assert(html.includes('data-card-src="/assets/'));assert(html.includes('&lt;地图&gt;'));
  const missing=c.window.SalmonPlayerCard.render({name:'old'},'');assert(missing.includes('未提供名片'));assert(missing.includes('未提供工服'));assert(!missing.includes('<img'));
});

test('appearance images download only on demand, retry after failure and survive restart offline',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'salmon-card-http-'));
  let app=await createApp({directory});
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true})});
  const listen=async()=>{await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+app.server.address().port};
  let base=await listen(),calls=0;
  const nativeFetch=globalThis.fetch,png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  t.mock.method(globalThis,'fetch',async(input,options)=>{
    if(String(input).startsWith('https://')){calls++;if(calls===1)return new Response('',{status:503});if(calls>2)throw Error('offline');return new Response(png,{headers:{'Content-Type':'image/png'}})}
    return nativeFetch(input,options);
  });
  const f=fixture();dress(f.record.result.memberResults[0].player,'orange');app.store.import([f.record,f.summary]);
  const data=await fetch(base+'/api/data').then(r=>r.json()),asset=data.jobs[0].players[1].appearance.uniform.image;
  assert.equal(calls,0);assert.equal((await fetch(base+'/player-card.js')).status,200);assert.equal(calls,0);
  assert.equal((await fetch(base+asset)).status,404);assert.equal(calls,1);
  assert.deepEqual(Buffer.from(await (await fetch(base+asset)).arrayBuffer()),png);assert.equal(calls,2);
  await app.close();app=await createApp({directory});base=await listen();
  const cached=await fetch(base+asset);assert.equal(cached.status,200);assert.deepEqual(Buffer.from(await cached.arrayBuffer()),png);assert.equal(calls,2);
});
