// Read Salmon Run records using nxapi's saved login, always requesting Simplified Chinese.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';

const LANGUAGE='zh-CN';
const {values,positionals}=parseArgs({allowPositionals:true,options:{
  'nxapi-root':{type:'string'},'data-path':{type:'string'},'check-only':{type:'boolean'},help:{type:'boolean'}
}});
if(values.help||!positionals.length){
  console.log('Usage: node scripts/collect-data.mjs OUTPUT_DIRECTORY [--nxapi-root PATH] [--data-path PATH] [--check-only]');
  console.log('Language is fixed to zh-CN. Uses the selected nxapi account. --check-only queries one result without writing files.');
  process.exit(values.help?0:1);
}
async function main(){
  const globalModules=process.platform==='win32'?path.join(process.env.APPDATA,'npm','node_modules'):execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  const root=path.resolve(values['nxapi-root']||path.join(globalModules,'nxapi'));
  const fromNxapi=relative=>import(pathToFileURL(path.join(root,'dist',relative)).href);
  const {addUserAgent}=await fromNxapi('util/useragent.js');
  addUserAgent('salmon-review/0.1.0 (local collection)');
  const {init}=await fromNxapi('common/globals.js');init();
  // Use the installed nxapi CLI's existing client registration for its normal login refresh.
  const [{NxapiClientAssertionProvider,setClientAssertionProvider},product]=await Promise.all([
    fromNxapi('util/nxapi-auth.js'),fromNxapi('util/product.js')
  ]);
  const cliClient=product.embedded_nxapi_auth_cli_client_id||product.pkg.__nxapi_auth?.cli?.client_id;
  if(cliClient)setClientAssertionProvider(new NxapiClientAssertionProvider(cliClient,undefined,'ca:gf ca:er ca:dr ca:na'));
  else if(process.env.NXAPI_AUTH_CLIENT_ID)setClientAssertionProvider(new NxapiClientAssertionProvider(process.env.NXAPI_AUTH_CLIENT_ID,undefined,process.env.NXAPI_AUTH_SCOPE??'ca:gf ca:er ca:dr'));
  const [{initStorage,paths},{getBulletToken},{RequestIdSymbol},{ResponseSymbol}]=await Promise.all([
    fromNxapi('util/storage.js'),fromNxapi('common/auth/splatnet3.js'),fromNxapi('api/splatnet3.js'),fromNxapi('api/util.js')
  ]);
  const storage=await initStorage(values['data-path']||paths.data);
  const selected=await storage.getItem('SelectedUser');
  if(!selected)throw new Error('No selected nxapi account. Run nxapi nso auth first.');
  const token=await storage.getItem('NintendoAccountToken.'+selected);
  if(!token)throw new Error('No saved nxapi login. Run nxapi nso auth first.');
  const {splatnet}=await getBulletToken(storage,token,undefined,true);
  splatnet.language=LANGUAGE;
  // Pin the header on this client, including requests retried after token renewal.
  // No account preferences or nxapi installation files are changed.
  const originalFetch=splatnet.fetch.bind(splatnet);
  splatnet.fetch=(url,method,body,headers,...rest)=>originalFetch(url,method,body,{...headers,'Accept-Language':LANGUAGE},...rest);
  const history=await splatnet.getCoopHistory();
  const summary=history.data.coopResult;
  const groups=summary.historyGroups.nodes;
  const items=[...new Map(groups.flatMap(g=>g.historyDetails.nodes).map(item=>[item.id,item])).values()];
  if(!items.length)throw new Error('No Salmon Run records available. Existing files have been preserved.');
  const pack=(response,result)=>({result,language:LANGUAGE,query:response[RequestIdSymbol],app_version:splatnet.version,be_version:response[ResponseSymbol].headers.get('x-be-version')});
  const first=await splatnet.getCoopHistoryDetail(items[0].id);
  const sample=first.data.coopHistoryDetail;
  console.log(JSON.stringify({language:LANGUAGE,available:items.length,sample:{stage:sample.coopStage.name,grade:sample.afterGrade?.name,weapon:sample.myResult.weapons[0]?.name,boss:sample.enemyResults[0]?.enemy.name}}));
  if(values['check-only'])return;
  const output=path.resolve(positionals[0]);
  await fs.mkdir(output,{recursive:true});
  let downloaded=0,skipped=0;
  for(const item of items){
    const id=createHash('sha256').update(item.id).digest('hex').slice(0,24);
    const file=path.join(output,`splatnet3-coop-result-${id}.json`);
    try{
      const existing=JSON.parse(await fs.readFile(file,'utf8'));
      if(existing.language===LANGUAGE&&existing.result?.id===item.id){skipped++;continue;}
      throw new Error('Output contains a conflicting record. Use a fresh output directory.');
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const response=item.id===items[0].id?first:await splatnet.getCoopHistoryDetail(item.id);
    await fs.writeFile(file,JSON.stringify(pack(response,response.data.coopHistoryDetail),null,2)+'\n',{encoding:'utf8',flag:'wx'});
    downloaded++;
    if(downloaded%10===0)console.log(`Downloaded ${downloaded} / ${items.length} records (${LANGUAGE}).`);
  }
  // Write the summary only after every referenced detail is available locally.
  await fs.writeFile(path.join(output,`splatnet3-coop-summary-${Date.now()}.json`),JSON.stringify(pack(history,summary),null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log(JSON.stringify({language:LANGUAGE,downloaded,skipped,total:items.length,output}));
}
main().catch(error=>{console.error('Collection failed: '+String(error.message||error).split('\n')[0]);process.exitCode=1;});
