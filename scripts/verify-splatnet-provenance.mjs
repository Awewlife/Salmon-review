// SPDX-License-Identifier: AGPL-3.0-or-later
// Read data only. Never import/evaluate the external web bundle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const directory=new URL('../packages/splatnet3-compat/',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,directory),'utf8'));
const provenance=read('provenance.json'),queries=read('queries.json'),enums=read('enums.json');
function argument(name){const index=process.argv.indexOf(name);assert(index>=0&&process.argv[index+1],`Required: ${name} <file>`);return process.argv[index+1]}
const bundle=fs.readFileSync(argument('--bundle'),'utf8');
const historical=fs.readFileSync(argument('--types'),'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(bundle),provenance.sources['nintendo-web-2026-10-19'].sha256);
assert.equal(hash(historical),provenance.sources['nxapi-before-types-extraction'].normalizedSha256);
for(const [name,evidence] of Object.entries(provenance.queries)){
  assert.equal(evidence.source,'nintendo-web-2026-10-19');
  assert(bundle.slice(evidence.offset).startsWith(`params:{id:"${queries[name]}",metadata:{},name:"${evidence.operationName}"`),`source mismatch for ${name}`);
}
for(const [group,members] of Object.entries(provenance.enums))for(const [member,source] of Object.entries(members)){
  const value=enums[group][member];
  if(source==='nxapi-before-types-extraction'){
    const body=historical.match(new RegExp(`export enum ${group}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
    assert(body&&new RegExp(`\\b${member}\\s*=\\s*'${value}'`).test(body),`historical enum mismatch: ${group}.${member}`);
  }else{
    assert.equal(source,'nintendo-web-2026-10-19');assert(bundle.includes(`"${value}"`),`unobserved enum: ${group}.${member}`);
  }
}
assert.deepEqual(Object.keys(queries).sort(),Object.keys(provenance.queries).sort());
for(const [group,values] of Object.entries(enums))assert.deepEqual(Object.keys(values).sort(),Object.keys(provenance.enums[group]).sort());
console.log('Verified independent query and enum provenance against both pinned source artifacts.');
