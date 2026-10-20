import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewedNotice} from '../scripts/notice-supplements.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'licenses/tr46-0.0.3');
const provenance=JSON.parse(fs.readFileSync(path.join(source,'provenance.json'),'utf8'));
const entry={name:'tr46',version:provenance.version,license:'MIT',integrity:provenance.integrity,sourceArchive:provenance.sourceArchive};
test('tr46 notice is tied to the installed source and exact locked archive',()=>{
  assert.deepEqual(reviewedNotice(root,entry,path.join(root,'node_modules/tr46')).files,['LICENSE.md','provenance.json']);
  for(const mutation of [{version:'0.0.4'},{integrity:'changed'},{license:'UNKNOWN'},{sourceArchive:'https://example.invalid'}]){
    assert.throws(()=>reviewedNotice(root,{...entry,...mutation},null),/review supplemental/);
  }
});
test('tr46 checks reject missing or modified notice and altered installed runtime',t=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'salmon-notices-'));
  t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
  const licenses=path.join(scratch,'licenses/tr46-0.0.3');
  fs.cpSync(source,licenses,{recursive:true});
  const runtime=path.join(scratch,'runtime');
  fs.cpSync(path.join(root,'node_modules/tr46'),runtime,{recursive:true});
  fs.appendFileSync(path.join(runtime,'index.js'),'\n// altered');
  assert.throws(()=>reviewedNotice(scratch,entry,runtime),/source checksum mismatch/);
  fs.appendFileSync(path.join(licenses,'LICENSE.md'),'\naltered');
  assert.throws(()=>reviewedNotice(scratch,entry,null),/license checksum mismatch/);
  fs.unlinkSync(path.join(licenses,'LICENSE.md'));
  assert.throws(()=>reviewedNotice(scratch,entry,null),/ENOENT/);
});
