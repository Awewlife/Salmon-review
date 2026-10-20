// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import * as adapter from 'splatnet3-types/splatnet3';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const provenance=read('packages/splatnet3-compat/provenance.json');
const lock=read('package-lock.json');
const require=createRequire(import.meta.url);
const nxapi=path.resolve(path.dirname(require.resolve('nxapi')),'../..');
assert.equal(JSON.parse(fs.readFileSync(path.join(nxapi,'package.json'),'utf8')).version,provenance.nxapiVersion,'nxapi upgrade needs a new compatibility review');
const nxRequire=createRequire(path.join(nxapi,'package.json'));
assert.equal(fs.realpathSync(nxRequire.resolve('splatnet3-types/splatnet3')),fs.realpathSync(path.join(root,'packages/splatnet3-compat/splatnet3.js')),'nxapi must resolve the local adapter');
for(const [key,p] of Object.entries(lock.packages)){
  if(key.endsWith('node_modules/splatnet3-types')){
    assert.equal(p.link,true);assert.equal(p.resolved,'packages/splatnet3-compat');
  }
  assert(!/registry[^\s]*\/splatnet3-types\//.test(p.resolved??''),'upstream archive must not be installed');
}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.js')?[path.join(dir,e.name)]:[])}
const imports=new Set(),queries=new Set();let consumers=0;
for(const file of files(path.join(nxapi,'dist'))){
  const source=fs.readFileSync(file,'utf8');
  if(!/['"]splatnet3-types(?:\/[^'"]*)?['"]/.test(source))continue;
  consumers++;
  for(const match of source.matchAll(/(?:from\s*|import\s*\()['"](splatnet3-types[^'"]*)['"]/g))assert.equal(match[1],'splatnet3-types/splatnet3','new dependency entry point needs review');
  const bindings=[...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]splatnet3-types\/splatnet3['"]/g)];
  assert(bindings.length,'unrecognized splatnet3-types import needs review');
  for(const match of bindings)for(const binding of match[1].split(',')){
    const [name,local=name]=binding.trim().split(/\s+as\s+/);
    assert(Object.hasOwn(adapter,name),`missing export ${name}`);imports.add(name);
    for(const use of source.matchAll(new RegExp(`\\b${local}\\.(\\w+)`,'g'))){
      const member=use[1];assert(Object.hasOwn(adapter[name],member),`missing ${name}.${member}`);
      if(name==='RequestId')queries.add(member);
      else assert.equal(typeof adapter[name][member],'string');
    }
  }
}
assert.equal(consumers,11,'runtime import surface changed');
assert.deepEqual([...imports].sort(),Object.keys(adapter).sort());
assert.deepEqual([...queries].sort(),[...Object.keys(provenance.queries),...provenance.unsupportedQueries].sort(),'query contract changed');
for(const name of Object.keys(provenance.queries))assert.match(adapter.RequestId[name],/^[a-f0-9]{64}$/);
console.log(`Verified nxapi runtime contract: ${consumers} modules, ${imports.size} exports, ${queries.size} query names; local adapter only.`);
