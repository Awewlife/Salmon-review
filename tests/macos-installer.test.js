import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const release=new URL('../release/',import.meta.url);
const configId='sha256:'+'a'.repeat(64),indexId='sha256:'+'b'.repeat(64),pinnedId='sha256:'+'c'.repeat(64);

// Exercise the actual Bash launcher. Fake only the Docker boundary; never use
// the developer's Docker socket or data volumes. macOS CI uses its real shasum.
for(const arch of ['amd64','arm64'])for(const scenario of ['classic','containerd','missing','replace','wrong','tampered','unsafe-path','symlink','custom-project','custom-port','legacy-project','updated','pinned','locked','helper-running','helper-exited-locked','rollback','unhealthy','foreign-config','invalid-metadata','environment']){
  test(`Mac ${arch} launcher: ${scenario}`,{skip:process.platform==='win32'},async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'salmon-mac-'));
    try{
      const directory=path.join(root,'安装包 with spaces'),bin=path.join(root,'bin'),trace=path.join(root,'trace.jsonl');
      await mkdir(directory);await mkdir(bin);await mkdir(path.join(directory,'docs'));
      for(const name of ['Start.command','start-macos.sh'])await copyFile(new URL(name,release),path.join(directory,name));
      const files=['Start.command','start-macos.sh','release.env','compose.yaml','release.json','salmon-review-image.tar.gz','docs/readme.md'];
      const ids=scenario==='containerd'?`${indexId},${configId}`:configId;
      await writeFile(path.join(directory,'release.env'),`VERSION=0.4.0\nPLATFORM=linux/${arch}\nCOMMIT=${'d'.repeat(40)}\nIMAGE_IDS=${scenario==='invalid-metadata'?'$(touch injected)':ids}\n`);
      for(const name of ['compose.yaml','release.json','salmon-review-image.tar.gz','docs/readme.md'])await writeFile(path.join(directory,name),'fixture '+name);
      const sums=[];
      for(const name of files)sums.push(`${createHash('sha256').update(await readFile(path.join(directory,name))).digest('hex')}  ${name}`);
      if(scenario==='unsafe-path')sums.push('a'.repeat(64)+'  ../outside');
      await writeFile(path.join(directory,'SHA256SUMS.txt'),sums.join('\n')+'\n');
      if(scenario==='tampered')await writeFile(path.join(directory,'salmon-review-image.tar.gz'),'altered image');
      if(scenario==='symlink'){
        await rm(path.join(directory,'docs'),{recursive:true});await mkdir(path.join(root,'outside'));
        await writeFile(path.join(root,'outside/readme.md'),'fixture docs/readme.md');
        await symlink(path.join(root,'outside'),path.join(directory,'docs'));
      }
      await writeFile(path.join(bin,'docker'),`#!/usr/bin/env node
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const a=process.argv.slice(2),s=process.env.SCENARIO,arch=process.env.ARCH;
fs.appendFileSync(process.env.TRACE,JSON.stringify({args:a,image:process.env.SALMON_IMAGE,updater:process.env.SALMON_UPDATER_IMAGE})+'\\n');
const out=x=>console.log(x),has=x=>a.includes(x),loaded=process.env.TRACE+'.loaded';
if(a[0]==='info')out('linux/'+(arch==='arm64'?'aarch64':'x86_64'));
else if(a[0]==='volume')out(s==='legacy-project'?'previous_salmon-data':'');
else if(a[0]==='load')fs.writeFileSync(loaded,'1');
else if(a[0]==='image'){
  if((s==='missing'||s==='replace')&&!fs.existsSync(loaded))process.exit(1);
  const id=s==='wrong'?'sha256:'+'f'.repeat(64):s==='containerd'?'${indexId}':'${configId}';
  out(id+'|linux/'+arch+'|'+ 'd'.repeat(40)+'|0.4.0');
}else if(a[0]==='ps'){
  if(has('label=com.docker.compose.service=update-helper'))out(s.startsWith('helper-')?'helper':'');
  else out(['updated','pinned','locked','rollback'].includes(s)?'existing':'');
}else if(a[0]==='inspect'){
  const template=a[a.indexOf('--format')+1];
  if(template.includes('Health.Status'))out(s==='unhealthy'?'running/unhealthy':'running/healthy');
  else if(template==='{{.State.Status}}')out(s==='helper-running'?'running':'exited');
  else if(template.includes('.Mounts'))out('fixture_salmon-updates');
  else if(template==='{{.Name}}')out(s==='rollback'?'/fixture-app-rollback-123':'/fixture-app-1');
  else if(template==='{{.Config.Image}}')out(s==='pinned'?'${pinnedId}':s==='updated'?'salmon-review:0.5.0':'salmon-review:0.4.0');
  else if(template.includes('org.opencontainers.image.version'))out('0.5.0');
  else process.exit(2);
}else if(a[0]==='compose'){
  if(has('version'))out('Docker Compose version fixture');
  else if(has('config')){
    const service={image:process.env.SALMON_IMAGE||'salmon-review:0.4.0',platform:'linux/'+(s==='foreign-config'?'other':arch),pull_policy:'never'};
    out(JSON.stringify({services:{app:{...service,ports:[{host_ip:'127.0.0.1',published:process.env.SALMON_PORT||'8787',target:8787}]},updater:{...service,image:process.env.SALMON_UPDATER_IMAGE||'salmon-review:0.4.0'}}}));
  }else if(has('up')){}else if(has('ps'))out('fixture-'+a.at(-1));else process.exit(2);
}else if(a[0]==='run'){
  if(has('-i')){const i=a.indexOf('-e');const r=spawnSync(process.execPath,a.slice(i),{input:fs.readFileSync(0)});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status)}
  else if(s==='locked'||s==='helper-exited-locked')process.exit(42);
}else process.exit(2);
`,{mode:0o755});
      if(process.platform!=='darwin')await writeFile(path.join(bin,'shasum'),`#!/usr/bin/env node
import fs from 'node:fs';import {createHash} from 'node:crypto';const f=process.argv.at(-1);console.log(createHash('sha256').update(fs.readFileSync(f)).digest('hex')+'  '+f);
`,{mode:0o755});
      // Node resolves extensionless fixtures as ESM because their bin has a package manifest.
      await writeFile(path.join(bin,'package.json'),' {"type":"module"}');
      const args=[path.join(directory,'Start.command'),'--no-browser'];
      if(scenario==='custom-project')args.push('--project-name','my-records');
      if(scenario==='custom-port')args.push('--port','18787');
      const result=spawnSync('/bin/bash',args,{encoding:'utf8',timeout:120000,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,SCENARIO:scenario,ARCH:arch,TRACE:trace,SALMON_IMAGE:'untrusted:latest',SALMON_UPDATER_IMAGE:'untrusted:latest'}});
      const commands=(await readFile(trace,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
      const up=commands.find(c=>c.args[0]==='compose'&&c.args.includes('up'));
      const reject=['wrong','tampered','unsafe-path','symlink','legacy-project','locked','helper-running','helper-exited-locked','rollback','unhealthy','foreign-config','invalid-metadata'].includes(scenario);
      assert.equal(result.status,reject?1:0,result.stdout+result.stderr);
      if(scenario!=='unhealthy')assert.equal(!!up,!reject,result.stdout+result.stderr);
      assert.equal(commands.some(c=>c.args[0]==='load'),['missing','replace','wrong'].includes(scenario));
      if(scenario==='updated'||scenario==='pinned'){
        const expected=scenario==='pinned'?pinnedId:'salmon-review:0.5.0';
        assert.equal(up.image,expected);assert.equal(up.updater,expected);
      }else if(up){assert.equal(up.image,undefined);assert.equal(up.updater,undefined)}
      if(scenario==='custom-project')assert.ok(up.args.includes('my-records'));
      if(scenario==='custom-port')assert.match(result.stdout,/127\.0\.0\.1:18787/);
      assert.ok(commands.every(c=>!c.args.includes('prune')&&!c.args.includes('down')));
    }finally{await rm(root,{recursive:true,force:true})}
  });
}
