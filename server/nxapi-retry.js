import {retryMetadata,RETRY_MARKER} from './rate-limit.js';
// yargs reports the actual error object through console.error. Observe only;
// nxapi's authentication limiter and request/refresh behavior stay unchanged.
const report=console.error;
console.error=function(...args){
  report.apply(this,args);
  for(const error of args){
    const metadata=retryMetadata(error);
    if(metadata.retryAt!==undefined)process.stderr.write('\n'+RETRY_MARKER+JSON.stringify(metadata)+'\n');
  }
};
