// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewedNotice} from './notice-supplements.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const reviewed={
  'cli-table@0.3.11':'MIT', // LICENSE in the published package; missing package.json metadata.
};
const packages=Object.entries(lock.packages).filter(([key])=>key.includes('node_modules/')).map(([key,entry])=>{
  // npm file dependencies are links. Inventory the installed import path once,
  // using the local target's real name, version and license.
  const p=entry.link?{...lock.packages[entry.resolved],resolved:`file:${entry.resolved}`}:entry;
  if(entry.link&&!lock.packages[entry.resolved])throw new Error(`Missing local dependency metadata: ${entry.resolved}`);
  return {
  path:key,name:p.name??key.split('node_modules/').at(-1),version:p.version,
  license:p.license??reviewed[`${p.name??key.split('node_modules/').at(-1)}@${p.version}`]??'UNKNOWN',optional:!!p.optional,sourceArchive:p.resolved,integrity:p.integrity,
}}).sort((a,b)=>a.path.localeCompare(b.path,'en'));
if(packages.some(p=>p.license==='UNKNOWN'))throw new Error('Dependency license metadata missing; review before updating notices.');
for(const p of packages)reviewedNotice(root,p,fs.existsSync(path.join(root,p.path,'package.json'))?path.join(root,p.path):null);
const manifest=JSON.stringify({description:'Locked npm dependencies, including platform-specific optional packages. License texts remain in each package; this inventory is not a replacement for them.',packages},null,2)+'\n';
const destination=path.join(root,'THIRD_PARTY_PACKAGES.json');
if(process.argv.includes('--check')){
  if(!fs.existsSync(destination)||fs.readFileSync(destination,'utf8')!==manifest)throw new Error('Run npm run notices after changing the lockfile.');
}else fs.writeFileSync(destination,manifest);

// Build a separate license bundle for the packages actually installed on this
// platform. Include nested vendor licenses, but never traverse node_modules
// from within a package (each package is handled from the lockfile).
if(process.argv.includes('--bundle')){
  const output=path.join(root,'third-party');fs.mkdirSync(output,{recursive:true});
  const installed=[];
  function notices(directory,relative=''){
    return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
      if(entry.isSymbolicLink()||entry.name==='node_modules')return [];
      const name=path.join(relative,entry.name),full=path.join(directory,entry.name);
      if(entry.isDirectory())return notices(full,name);
      return /licen[cs]e|copying|copyright|notice/i.test(entry.name)?[name]:[];
    });
  }
  for(const p of packages){
    const directory=path.join(root,p.path);if(!fs.existsSync(path.join(directory,'package.json')))continue;
    const supplement=reviewedNotice(root,p,directory);
    const record={...p,notices:[],evidence:'shipped-notices'},files=notices(directory);
    if(supplement){
      for(const name of supplement.files){
        const target=path.join('licenses',p.path,'upstream-supplement',name);
        fs.mkdirSync(path.dirname(path.join(output,target)),{recursive:true});
        fs.copyFileSync(path.join(supplement.base,name),path.join(output,target));
        record.notices.push(target.replaceAll('\\','/'));
      }
      files.push('package.json');
      record.evidence='upstream-license-supplement; version and source hashes verified';
    }
    if(!files.length){
      // Some small packages put their license/copyright in the README only.
      for(const name of fs.readdirSync(directory))if(/^readme(?:\.|$)/i.test(name)&&fs.statSync(path.join(directory,name)).isFile())files.push(name);
      record.evidence='readme';
    }
    if(!files.length)throw new Error(`No license or README shipped for ${p.name}@${p.version}`);
    for(const name of files){
      const target=path.join('licenses',p.path,name);fs.mkdirSync(path.dirname(path.join(output,target)),{recursive:true});
      fs.copyFileSync(path.join(directory,name),path.join(output,target));record.notices.push(target.replaceAll('\\','/'));
    }
    installed.push(record);
  }
  fs.writeFileSync(path.join(output,'installed-packages.json'),JSON.stringify({packages:installed},null,2)+'\n');
  console.log(`Bundled notices for ${installed.length} installed packages.`);
}
console.log(`Verified license inventory for ${packages.length} locked packages.`);
