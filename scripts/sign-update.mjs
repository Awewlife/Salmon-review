import {readFileSync,writeFileSync} from 'node:fs';
import {sign,createPublicKey} from 'node:crypto';
// The private key lives outside the repository and is never added to an image.
const [input,keyFile,output]=process.argv.slice(2);
if(!input||!keyFile||!output)throw new Error('Usage: node scripts/sign-update.mjs manifest.json private-key.pem update.json');
const key=readFileSync(keyFile),expected=readFileSync(new URL('../server/updater/public-key.pem',import.meta.url),'utf8');
if(createPublicKey(key).export({type:'spki',format:'pem'})!==expected)throw new Error('Signing key does not match installed updater public key');
const payload=readFileSync(input);writeFileSync(output,JSON.stringify({payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')})+'\n');
