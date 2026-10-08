import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
export const updateDirectory=process.env.UPDATE_DIR;
export async function updateToken(){return updateDirectory?(await readFile(updateDirectory+'/channel.token','utf8')).trim():''}
export async function internalUpdater(req){
  if(!updateDirectory)return false;
  try{const expected=Buffer.from(await updateToken()),actual=Buffer.from(String(req.headers['x-salmon-updater']??''));return expected.length>0&&actual.length===expected.length&&timingSafeEqual(actual,expected)}catch{return false}
}
export async function updaterRequest(endpoint,body){
  if(!updateDirectory)return {enabled:false,message:'此安装方式未启用网页更新，请安装带更新组件的完整安装包。'};
  try{
    const result=await fetch('http://updater:8790/'+endpoint,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Salmon-Updater':await updateToken()},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    const value=await result.json();if(!result.ok)throw new Error(value.message);return value;
  }catch{return {enabled:false,message:'暂时无法连接本地更新组件。请确认 Docker 中的 updater 容器已运行，或重新运行启动器。'}}
}
