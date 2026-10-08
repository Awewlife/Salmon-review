import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const directory=path.resolve(process.argv[2]??'');
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
if(!process.argv[2]||directory===root||directory.startsWith(root+path.sep))throw new Error('Key directory must be outside the source checkout');
mkdirSync(directory,{recursive:true,mode:0o700});
const keyFile=path.join(directory,'update-signing-key.pem');
if(!existsSync(keyFile)){const pair=generateKeyPairSync('ed25519');writeFileSync(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'})}
const publicKey=createPublicKey(readFileSync(keyFile)).export({type:'spki',format:'pem'});
const publicFile=new URL('../server/updater/public-key.pem',import.meta.url);
if(existsSync(publicFile)&&readFileSync(publicFile,'utf8')!==publicKey)throw new Error('Refusing to rotate the installed trust key');
writeFileSync(publicFile,publicKey);console.log('Public key ready; private key remains outside the repository.');
