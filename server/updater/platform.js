// Keep amd64 asset names compatible with every existing Windows updater.
export function runtimePlatform(arch=process.arch){
  if(arch==='x64')return 'linux/amd64';
  if(arch==='arm64')return 'linux/arm64';
  throw new Error('invalid_manifest');
}
export function manifestAsset(platform){
  if(platform==='linux/amd64')return 'update.json';
  if(platform==='linux/arm64')return 'update-arm64.json';
  throw new Error('invalid_manifest');
}
