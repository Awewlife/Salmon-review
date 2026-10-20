// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function reviewedNotice(root,entry,directory){
  if(entry.name!=='tr46')return null;
  const base=path.join(root,'licenses/tr46-0.0.3');
  const provenance=JSON.parse(fs.readFileSync(path.join(base,'provenance.json'),'utf8'));
  if(entry.version!==provenance.version||entry.license!==provenance.license||
    entry.integrity!==provenance.integrity||entry.sourceArchive!==provenance.sourceArchive){
    throw new Error('tr46 package changed; review supplemental license applicability');
  }
  const license=path.join(base,'LICENSE.md');
  if(digest(license)!==provenance.licenseSha256)throw new Error('tr46 supplemental license checksum mismatch');
  const text=fs.readFileSync(license,'utf8');
  if(!text.includes('Copyright (c) 2016 Sebastian Mayr')||!text.includes('Permission is hereby granted')||
    !text.includes('THE SOFTWARE IS PROVIDED "AS IS"'))throw new Error('Incomplete tr46 MIT notice');
  if(directory){
    const actual=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
    if(actual.name!==entry.name||actual.version!==entry.version||actual.license!=='MIT')throw new Error('Unexpected installed tr46 package');
    for(const [file,sha] of Object.entries(provenance.runtimeSha256)){
      if(digest(path.join(directory,file))!==sha)throw new Error(`tr46 installed source checksum mismatch: ${file}`);
    }
  }
  return {base,files:['LICENSE.md','provenance.json']};
}
