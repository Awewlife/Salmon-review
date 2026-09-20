import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

test('upgraded undici handles a local HTTP response through its own fetch',async()=>{
  const {createServer}=await import('node:http');
  const {fetch}=await import('undici');
  const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"ok":true}')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{assert.deepEqual(await fetch(`http://127.0.0.1:${server.address().port}/`).then(r=>r.json()),{ok:true})}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('sharp override loads its native library and processes a generated PNG',async()=>{
  const {default:sharp}=await import('sharp');
  const png=await sharp({create:{width:2,height:2,channels:4,background:'#abcdef'}}).png().toBuffer();
  const metadata=await sharp(png).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,2);
});

test('node-notifier can load the overridden CommonJS UUID v4 API without displaying a notification',()=>{
  const require=createRequire(import.meta.url);
  const notifierRequire=createRequire(require.resolve('node-notifier'));
  const {v4,validate}=notifierRequire('uuid');assert(validate(v4()));
  assert.equal(notifierRequire('uuid/package.json').version,'11.1.1');
  assert.equal(typeof require('node-notifier').notify,'function');
});
