import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Only checked-in icon URLs are eligible. Imported records do not gain a new
// host allowance, and clients cannot supply arbitrary remote image URLs.
const catalog=JSON.parse(readFileSync(new URL('./reference-icons.json',import.meta.url),'utf8'));
const icons=new Map(Object.values(catalog).map(({url})=>{
  const parsed=new URL(url);
  if(parsed.origin!=='https://cdn.wikimg.net'||parsed.username||parsed.password||parsed.search||parsed.hash||!parsed.pathname.startsWith('/en/splatoonwiki/images/')||!parsed.pathname.endsWith('.png'))throw new Error('Invalid reference icon URL');
  return [createHash('sha256').update(url).digest('hex'),url];
}));
export const referenceIconUrl=id=>icons.get(id);
