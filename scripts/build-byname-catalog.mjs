// Extract only Splashtag title fragments from the pinned game-language tables.
// Usage: node scripts/build-byname-catalog.mjs <directory containing four JSON files>
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const revision='7280ff9cde8bb1c5dcef46c700c326471584d2e6';
const blobs={CNzh:'2f801b90d80effa92f14451f9dc3eb371acc8767',TWzh:'2d38b7c6c39ef310179e7d7fce348bd652012328',USen:'5312389ac52f0c8e504347d1081f5e880e234271',JPja:'b35f4709de6295b78ca54a73d66882b33846bfc9'};
if(!process.argv[2])throw Error('Specify the language-table directory');
const tables=Object.keys(blobs).map(lang=>{
  const bytes=fs.readFileSync(path.join(process.argv[2],lang+'.json'));
  const hash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if(hash!==blobs[lang])throw Error(`Unexpected source revision: ${lang}`);
  return JSON.parse(bytes.toString('utf8'));
});
const clean=value=>{
  if(typeof value!=='string')throw Error('Missing title fragment');
  const text=value.replace(/\[ruby="[^"]*"\]|\[\/ruby\]/g,'');
  if(/[\[\]<>]/.test(text))throw Error(`Unrecognized title control: ${text}`);
  return text;
};
const group=kind=>{
  const key='CommonMsg/Byname/Byname'+kind;
  return Object.keys(tables[0][key]).flatMap(id=>{
    // The source includes an orphaned 0654_1 control with no base string.
    if(tables.every(table=>table[key][id]==='[group=0001 type=0002 params=]'&&!table[key][id.replace(/_1$/,'_0')]))return [];
    const values=tables.map(table=>{
      let text=table[key][id];
      if(text==='[group=0001 type=0002 params=]')text=table[key][id.replace(/_1$/,'_0')];
      return clean(text);
    });
    if(id.endsWith('_1')&&tables.every((table,i)=>clean(table[key][id.replace(/_1$/,'_0')])===values[i]))return [];
    return [[id,...values]];
  });
};
const catalog={revision,adjectives:group('Adjective'),subjects:group('Subject')};
fs.writeFileSync(new URL('../dist/byname-catalog.js',import.meta.url),`// Nintendo game terminology; sources and extraction: docs/LOCALIZATION.md.\nwindow.SalmonBynameCatalog=${JSON.stringify(catalog)};\n`);
console.log(`${catalog.adjectives.length} adjective and ${catalog.subjects.length} subject fragments`);
