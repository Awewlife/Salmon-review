import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/main.js';
import {fixture} from './fixtures.js';

test('display response cache avoids repeated normalization and invalidates local and external commits',async t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'salmon-cache-'));
 const app=await createApp({directory});
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 let snapshots=0;const original=app.store.snapshot.bind(app.store);app.store.snapshot=()=>{snapshots++;return original()};
 const read=async()=>{const response=await fetch(base+'/api/data');assert.match(response.headers.get('cache-control'),/no-store/);return response.json()};
 assert.equal((await read()).archived,0);await read();assert.equal(snapshots,1);
 const f=fixture();app.store.import([f.record,f.summary]);
 assert.equal((await read()).archived,1);await read();assert.equal(snapshots,2);
 const script=await (await fetch(base+'/data.js')).text();assert.match(script,/window.SALMON_DATA/);assert.equal(snapshots,2);
 const external=new DatabaseSync(path.join(directory,'salmon.sqlite'));
 try{external.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('lastImport',JSON.stringify('external-change'));}finally{external.close()}
 assert.equal((await read()).lastImport,'external-change');assert.equal(snapshots,3);
 await read();assert.equal(snapshots,3);
 // Status is never served from the display cache.
 app.store.set('lastImport','new-change');const status=await (await fetch(base+'/api/status')).json();assert.equal(status.lastImport,'new-change');
});
