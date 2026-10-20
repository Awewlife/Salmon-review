// Exercise the published nxapi implementation with isolated fake sessions and
// HTTP interception. No real account, remote config or Nintendo request is used.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {MockAgent,setGlobalDispatcher,getGlobalDispatcher} from 'undici';
import {RequestId} from 'splatnet3-types/splatnet3';
import {fixture} from './fixtures.js';
import {normalize,groupsOf} from '../server/normalize.js';

const directory=await fs.mkdtemp(path.join(os.tmpdir(),'salmon-nxapi-contract-'));
const previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
process.env.NXAPI_DATA_PATH=directory;
process.env.XDG_CACHE_HOME=path.join(directory,'cache');
process.env.NXAPI_SKIP_UPDATE_CHECK='1';
process.env.NXAPI_DEBUG_FILE='0';
process.env.NXAPI_ENABLE_REMOTE_CONFIG='1';
process.env.NXAPI_SPLATNET3_UPGRADE_QUERIES='3';
const config=path.join(directory,'config.json');
await fs.writeFile(config,JSON.stringify({require_version:['1.6.1'],coral_gws_splatnet3:{app_ver:'test-web-version',map_queries:{}}}));
process.env.NXAPI_CONFIG_URL=pathToFileURL(config).href;
const {default:Api,RequestIdSymbol}=await import('nxapi/splatnet3');
const require=createRequire(import.meta.url),nxRoot=path.resolve(path.dirname(require.resolve('nxapi')),'../..');
const {dumpCoopResults}=await import(pathToFileURL(path.join(nxRoot,'dist/cli/splatnet3/dump-results.js')));
const {getBulletToken}=await import(pathToFileURL(path.join(nxRoot,'dist/common/auth/splatnet3.js')));
const pool=mock.get('https://api.lp1.av5ja.srv.nintendo.net');
const headers={'x-be-version':'test-backend','x-bullettoken-remaining':'7200'};
const user={language:'zh-CN',country:'HK'};
const saved=(token='fake-bullet',queries={})=>({bullet_token:{bulletToken:token,lang:'zh-CN'},version:'test-web-version',country:'HK',useragent:'test-agent',queries,expires_at:Date.now()+7200000,webserviceToken:{accessToken:'fake-web-token'}});
const api=(queries={})=>Api.createWithSavedToken(saved('fake-bullet',queries));
const intercept=(id,variables,response,status=200)=>pool.intercept({path:'/api/graphql',method:'POST',body:JSON.stringify({variables,extensions:{persistedQuery:{version:1,sha256Hash:id}}})}).reply(status,response,{headers});
after(async()=>{try{mock.assertNoPendingInterceptors()}finally{setGlobalDispatcher(previous);await mock.close();await fs.rm(directory,{recursive:true,force:true})}});

test('coop requests, variables and response metadata use the verified protocol IDs',async()=>{
  const client=api(),id='fixture-result';
  intercept(RequestId.CoopHistoryQuery,{}, {data:{coopResult:{historyGroups:{nodes:[]}}}});
  intercept(RequestId.RefetchableCoopHistory_CoopResultQuery,{}, {data:{coopResult:{historyGroups:{nodes:[]}}}});
  intercept(RequestId.CoopHistoryDetailQuery,{coopHistoryDetailId:id},{data:{coopHistoryDetail:{id}}});
  intercept(RequestId.CoopHistoryDetailRefetchQuery,{id},{data:{node:{id}}});
  assert.equal((await client.getCoopHistory())[RequestIdSymbol],RequestId.CoopHistoryQuery);
  await client.getCoopHistoryRefetch();
  assert.equal((await client.getCoopHistoryDetail(id)).data.coopHistoryDetail.id,id);
  assert.equal((await client.getCoopHistoryDetailRefetch(id)).data.node.id,id);
});

test('nxapi keeps multi-step query upgrades, removal and loop protection',async()=>{
  const next='a'.repeat(64),last='b'.repeat(64),key=RequestId.CoopHistoryQuery;
  const client=api({[key]:[next,false],[next]:[last,false]});
  assert.equal(client.getPersistedQueryId(key),last);
  intercept(last,{}, {data:{coopResult:{historyGroups:{nodes:[]}}}});
  assert.equal((await client.getCoopHistory())[RequestIdSymbol],last);
  await assert.rejects(api({[key]:null}).getCoopHistory(),/does not exist/);
  await assert.rejects(api({[key]:[next,false],[next]:[key,false]}).getCoopHistory(),/Loop detected/);
});

test('verified previous coop mappings and new constants produce identical effective IDs and filenames',async()=>{
  const evidence=JSON.parse(await fs.readFile(new URL('../packages/splatnet3-compat/provenance.json',import.meta.url),'utf8'));
  for(const [name,check] of Object.entries(evidence.migrationChecks.queries)){
    assert.equal(api(check.mapping).getPersistedQueryId(check.previousId),check.effectiveId);
    assert.equal(api(check.mapping).getPersistedQueryId(RequestId[name]),check.effectiveId);
  }
});

test('published nxapi reuses saved sessions and refreshes an expired bullet token once',async()=>{
  const memory=new Map([['BulletToken.fake-session',saved()],['NsoToken.fake-session',{user}]]);
  const storage={getItem:async k=>memory.get(k),setItem:async(k,v)=>{memory.set(k,v)}};
  const {splatnet}=await getBulletToken(storage,'fake-session',undefined,true,false);
  // Real nxapi renewal rate limiter decodes the session token; use a synthetic
  // valid-shaped JWT instead of weakening the production limiter.
  const jwt=[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({sub:'test-account'})).toString('base64url'),'fake-signature'].join('.');
  memory.set('BulletToken.'+jwt,saved());memory.set('NsoToken.'+jwt,{user});
  const {splatnet:client}=await getBulletToken(storage,jwt,undefined,true,false);
  assert.equal(splatnet.bullet_token,'fake-bullet');
  pool.intercept({path:'/api/graphql',method:'POST',headers:{authorization:'Bearer fake-bullet'}}).reply(401,{});
  pool.intercept({path:/^\/\?/,method:'GET',headers:{'x-gamewebtoken':'fake-web-token'}}).reply(200,'<html></html>');
  pool.intercept({path:'/api/bullet_tokens',method:'POST',headers:{'x-gamewebtoken':'fake-web-token'}}).reply(201,{bulletToken:'fake-refreshed',lang:'zh-CN'});
  pool.intercept({path:'/api/graphql',method:'POST',headers:{authorization:'Bearer fake-refreshed'}}).reply(200,{data:{coopResult:{historyGroups:{nodes:[]}}}},{headers});
  await client.getCoopHistory();
  assert.equal(client.bullet_token,'fake-refreshed');
  assert.equal(memory.get('BulletToken.'+jwt).bullet_token.bulletToken,'fake-refreshed');
});

test('nxapi keeps fresh Coral-to-SplatNet login and proactive renewal',async()=>{
  const calls=[];const coral={getWebServiceToken:async id=>{calls.push(id);return {accessToken:'fake-new-web'}}};
  const loginResponse=token=>{
    pool.intercept({path:/^\/\?/,method:'GET',headers:{'x-gamewebtoken':'fake-new-web'}}).reply(200,'<html></html>');
    pool.intercept({path:'/api/bullet_tokens',method:'POST',headers:{'x-gamewebtoken':'fake-new-web'}}).reply(201,{bulletToken:token,lang:'zh-CN'});
  };
  loginResponse('fake-new-bullet');
  const data=await Api.loginWithCoral(coral,user);assert.deepEqual(calls,[4834290508791808]);
  assert.equal(data.bullet_token.bulletToken,'fake-new-bullet');assert.equal(data.language,'zh-CN');
  const client=Api.createWithSavedToken(data);let renewals=0;
  client.onTokenShouldRenew=async()=>{renewals++;loginResponse('fake-proactive');return client.renewTokenWithCoral(coral,user)};
  pool.intercept({path:'/api/graphql',method:'POST'}).reply(200,{data:{coopResult:{}}},{headers:{...headers,'x-bullettoken-remaining':'60'}});
  await client.getCoopHistory();await client._renewToken;
  assert.equal(renewals,1);assert.equal(client.bullet_token,'fake-proactive');
});

test('refresh failures and missing results propagate without an unlimited retry',async()=>{
  const client=api();let refreshes=0;client.onTokenExpired=async()=>{refreshes++;throw new Error('fixture renewal rejected')};
  pool.intercept({path:'/api/graphql',method:'POST'}).reply(401,{});
  await assert.rejects(client.getCoopHistory(),/fixture renewal rejected/);assert.equal(refreshes,1);
  const retry=api();retry.onTokenExpired=async()=>saved('still-invalid');
  pool.intercept({path:'/api/graphql',method:'POST'}).reply(401,{}).times(2);
  await assert.rejects(retry.getCoopHistory(),/Non-200/);
  intercept(RequestId.CoopHistoryDetailQuery,{coopHistoryDetailId:'missing'},{data:{coopHistoryDetail:null}});
  await assert.rejects(api().getCoopHistoryDetail('missing'),/not found/);
});

test('real nxapi coop dump preserves detail fields, interruption data, filenames and retry deduplication',async()=>{
  const out=path.join(directory,'exports');await fs.mkdir(out);
  const first=fixture({id:Buffer.from('fixture-normal').toString('base64')}),second=fixture({id:Buffer.from('fixture-interrupted').toString('base64'),failedWave:-1});
  first.record.result.myResult.player.nameplate={background:{id:'test-background'}};
  const summary=first.summary.result;summary.historyGroups.nodes[0].historyDetails.nodes=[{id:second.record.result.id},{id:first.record.result.id}];
  const client=api();
  const history=()=>intercept(RequestId.CoopHistoryQuery,{}, {data:{coopResult:summary}});
  history();
  for(const f of [first,second])intercept(RequestId.CoopHistoryDetailQuery,{coopHistoryDetailId:f.record.result.id},{data:{coopHistoryDetail:f.record.result}});
  assert.deepEqual((await dumpCoopResults(client,out)).downloaded,[first.record.result.id,second.record.result.id]);
  const names=(await fs.readdir(out)).filter(n=>n.startsWith('splatnet3-coop-result-'));
  assert.equal(names.length,2);assert(names.every(n=>n.endsWith('-'+RequestId.CoopHistoryDetailQuery+'.json')));
  const docs=await Promise.all(names.map(async n=>JSON.parse(await fs.readFile(path.join(out,n),'utf8'))));
  assert.deepEqual(docs.find(d=>d.result.id===first.record.result.id).result,first.record.result);
  assert.deepEqual(docs.find(d=>d.result.id===second.record.result.id).result,second.record.result);
  for(const doc of docs){assert.equal(doc.query,RequestId.CoopHistoryDetailQuery);assert.equal(doc.be_version,'test-backend');}
  const group=groupsOf(summary)[0];
  assert.deepEqual(normalize(docs.find(d=>d.result.id===first.record.result.id).result,group,()=>''),normalize(first.record.result,group,()=>''));
  history();assert.deepEqual((await dumpCoopResults(client,out)).downloaded,[]);
  assert.equal((await fs.readdir(out)).filter(n=>n.startsWith('splatnet3-coop-result-')).length,2);
});
