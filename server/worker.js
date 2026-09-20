// Credentials travel only over the private parent/child IPC channel, never argv or logs.
import {setTimeout as sleep} from 'node:timers/promises';
import {addUserAgent,setClientAuthentication} from 'nxapi';
import CoralApi,{NintendoAccountSessionAuthorisationCoral} from 'nxapi/coral';
import SplatNet3Api from 'nxapi/splatnet3';
import {classify} from './errors.js';
addUserAgent('salmon-review/0.2.0');
if(process.env.NXAPI_AUTH_CLIENT_ID)setClientAuthentication({id:process.env.NXAPI_AUTH_CLIENT_ID,scope:'ca:gf ca:er ca:dr ca:na'});
const pending=new Map();let sequence=0;
const emit=(type,value)=>new Promise((resolve,reject)=>{const seq=++sequence;pending.set(seq,{resolve,reject});process.send({type,value,seq})});
process.on('message',async message=>{
  if(message.type==='ack'){const p=pending.get(message.seq);pending.delete(message.seq);message.error?p?.reject(new Error(message.error)):p?.resolve();return}
  if(message.type!=='start')return;
  try{const result=await run(message.value);process.send({type:'result',value:result},()=>process.exit(0))}
  catch(error){let retryAfter=Number(error.response?.headers?.get('retry-after'));if(!Number.isFinite(retryAfter)){retryAfter=Math.max(0,(Date.parse(error.response?.headers?.get('retry-after'))-Date.now())/1000)||0}process.send({type:'error',value:{code:classify(error),retryAfter}},()=>process.exit(1))}
});
export async function retry(action){
  for(let i=0;;i++)try{return await action()}catch(error){if(classify(error)!=='network'||i>=2)throw error;await sleep(2000*2**i)}
}
async function run(input){
  if(input.action==='auth-start'){
    const a=NintendoAccountSessionAuthorisationCoral.create();return {url:a.authorise_url,state:a.state,verifier:a.verifier};
  }
  if(input.action==='auth-complete'){
    const a=NintendoAccountSessionAuthorisationCoral.resume(input.auth.url,input.auth.state,input.auth.verifier),url=new URL(input.url),params=new URLSearchParams(url.hash.slice(1));
    if(url.protocol!=='npf71b963c1b7b6d119:'||url.hostname!=='auth'||params.get('state')!==a.state||!params.get('session_token_code'))throw new Error('auth_callback');
    const token=await a.getSessionToken(params);return {sessionToken:token.session_token};
  }
  if(input.action!=='sync')throw new Error('upstream');
  const credentials=input.credentials;if(!credentials?.sessionToken)throw new Error('auth_required');
  const cache=credentials.cache??{};let coral,splatnet;
  async function getCoral(force=false){
    if(!force&&cache.coral&&cache.coralUntil>Date.now())coral=CoralApi.createWithSavedToken(cache.coral);
    else{const result=await retry(()=>CoralApi.createWithSessionToken(credentials.sessionToken));coral=result.nso;cache.coral=result.data;cache.coralUntil=Date.now()+Math.max(0,cache.coral.credential.expiresIn-120)*1000;await emit('credentials',{...credentials,cache})}
    return coral;
  }
  async function renew(){
    const nso=await getCoral();
    try{cache.splatnet=await retry(()=>SplatNet3Api.loginWithCoral(nso,{...cache.coral.user,language:'zh-CN'}))}
    catch(error){if(error.response?.status!==401)throw error;await getCoral(true);cache.splatnet=await SplatNet3Api.loginWithCoral(coral,{...cache.coral.user,language:'zh-CN'})}
    await emit('credentials',{...credentials,cache});return cache.splatnet;
  }
  if(!cache.splatnet||cache.splatnet.expires_at<Date.now()+120000)await renew();
  splatnet=SplatNet3Api.createWithSavedToken(cache.splatnet);
  let renewals=0;
  splatnet.onTokenExpired=async()=>{if(++renewals>1)throw new Error('auth_required');return renew()};
  splatnet.language='zh-CN';const fetch=splatnet.fetch.bind(splatnet);
  splatnet.fetch=(url,method,body,headers,...rest)=>fetch(url,method,body,{...headers,'Accept-Language':'zh-CN'},...rest);
  const history=await retry(()=>splatnet.getCoopHistory()),summary=history.data?.coopResult;
  if(!Array.isArray(summary?.historyGroups?.nodes))throw new Error('upstream');
  const ids=[...new Set(summary.historyGroups.nodes.flatMap(g=>g.historyDetails.nodes.map(j=>j.id)))];
  await emit('summary',{result:summary});
  const known=new Set(input.known);let done=0;
  for(const id of ids){
    if(!known.has(id)){
      const response=await retry(()=>splatnet.getCoopHistoryDetail(id));await emit('record',{result:response.data.coopHistoryDetail});await sleep(1200);
    }
    await emit('progress',{done:++done,total:ids.length});
  }
  return {total:ids.length};
}
