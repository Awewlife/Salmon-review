// CLI has no language flag. Only adapt read requests; do not replace its
// authentication, client identity, token storage or refresh implementation.
import SplatNet3Api from 'nxapi/splatnet3';
process.umask(0o077);
const fetch=SplatNet3Api.prototype.fetch;
SplatNet3Api.prototype.fetch=function(url,method,body,headers,...rest){
  return fetch.call(this,url,method,body,{...headers,'Accept-Language':'zh-CN'},...rest);
};
