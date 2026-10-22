// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep only the target Linux/glibc native libraries. Do not ship unused Windows,
// macOS, musl or statically linked WebAssembly helpers in that image.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
if(process.platform!=='linux'||!['x64','arm64'].includes(process.arch)||!process.report.getReport().header.glibcVersionRuntime)throw Error('Expected Linux glibc x64 or arm64');
const keep=[`sharp-linux-${process.arch}`,`sharp-libvips-linux-${process.arch}`];
const root=path.resolve('node_modules/@img');
for(const name of fs.readdirSync(root)){
  if(name.startsWith('sharp-')&&!keep.includes(name)){
    fs.rmSync(path.join(root,name),{recursive:true,force:true});
  }
}
// Linux node-notifier uses notify-send, not these bundled foreign executables.
for(const name of ['mac.noindex','notifu','snoreToast']){
  fs.rmSync(path.resolve('node_modules/node-notifier/vendor',name),{recursive:true,force:true});
}
await sharp({create:{width:1,height:1,channels:4,background:'#000'}}).png().toBuffer();
console.log('Linux native image pipeline verified; foreign binaries excluded.');
