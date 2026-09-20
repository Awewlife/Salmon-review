import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
export class Vault{
  constructor(directory){
    this.file=path.join(directory,'credentials.enc');const keyFile=path.join(directory,'vault.key');
    if(!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32),{mode:0o600,flag:'wx'});
    this.key=readFileSync(keyFile);
  }
  read(){
    if(!existsSync(this.file))return null;
    const data=readFileSync(this.file),dec=createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));dec.setAuthTag(data.subarray(12,28));
    return JSON.parse(Buffer.concat([dec.update(data.subarray(28)),dec.final()]).toString());
  }
  save(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv),body=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);writeFileSync(this.file+'.tmp',Buffer.concat([iv,cipher.getAuthTag(),body]),{mode:0o600});renameSync(this.file+'.tmp',this.file)}
  clear(){if(existsSync(this.file))unlinkSync(this.file)}
}
