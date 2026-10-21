import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('read-language override is independent of account country and token language',()=>{
  let request;
  class SplatNet3Api{fetch(...args){request={client:this,args};return 'response'}}
  const source=readFileSync(new URL('../server/nxapi-language.js',import.meta.url),'utf8').replace("import SplatNet3Api from 'nxapi/splatnet3';",'');
  vm.runInNewContext(source,{SplatNet3Api,process:{umask(){}}});
  const client=new SplatNet3Api();client.language='en-US';client.na_country='US';
  assert.equal(client.fetch('/graphql','POST','body',{'Accept-Language':'ja-JP','X-Test':'keep'}),'response');
  assert.equal(request.args[3]['Accept-Language'],'zh-CN');assert.equal(request.args[3]['X-Test'],'keep');
  assert.equal(client.language,'en-US');assert.equal(client.na_country,'US');assert.equal(request.client,client);
});
