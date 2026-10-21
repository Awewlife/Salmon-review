import {fetchCareer} from './career-cli.js';
import {syncCli} from './sync-cli.js';
import {classify} from './errors.js';
const pending=new Map();let sequence=0;
const controller=new AbortController();
const emit=(type,value)=>new Promise((resolve,reject)=>{
  const seq=++sequence;pending.set(seq,{resolve,reject});process.send({type,value,seq});
});
const stop=()=>{controller.abort();for(const p of pending.values())p.reject(new Error('interrupted'));pending.clear()};
process.on('SIGTERM',stop);process.on('disconnect',stop);
process.on('message',async message=>{
  if(message.type==='ack'){const p=pending.get(message.seq);pending.delete(message.seq);message.error?p?.reject(new Error(message.error)):p?.resolve();return}
  if(message.type!=='start')return;
  try{
    if(!['sync','career'].includes(message.value.action))throw new Error('upstream');
    const result=message.value.action==='career'?await fetchCareer(message.value,{signal:controller.signal}):await syncCli(message.value,emit,{signal:controller.signal});
    if(process.connected)process.send({type:'result',value:result},()=>process.exit(0));else process.exit(0);
  }catch(error){
    if(process.connected)process.send({type:'error',value:{code:classify(error),retryAfter:error.retryAfter??0}},()=>process.exit(1));else process.exit(1);
  }
});
