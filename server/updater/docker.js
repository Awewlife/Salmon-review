import http from 'node:http';
import {createReadStream} from 'node:fs';
export class Docker{
  constructor(socketPath='/var/run/docker.sock'){this.socketPath=socketPath}
  request(method,path,body,{stream=false,timeout=120000}={}){
    return new Promise((resolve,reject)=>{
      const req=http.request({socketPath:this.socketPath,path,method,headers:{'Content-Type':stream?'application/x-tar':'application/json'}},res=>{
        const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>8*1024**2){res.destroy(new Error('docker_response_large'));return}chunks.push(chunk)});
        res.on('error',reject);res.on('end',()=>{const raw=Buffer.concat(chunks).toString();if(res.statusCode>=300)return reject(new Error('docker_'+res.statusCode));try{resolve(raw?JSON.parse(raw):null)}catch{if(stream&&!/"error"\s*:/.test(raw))resolve(raw);else reject(new Error('docker_response'))}});
      });
      req.setTimeout(timeout,()=>req.destroy(new Error('docker_timeout')));req.on('error',reject);
      if(stream){const input=createReadStream(body);input.on('error',e=>req.destroy(e));req.on('close',()=>input.destroy());input.pipe(req)}else req.end(body===undefined?undefined:JSON.stringify(body));
    });
  }
  inspect(id){return this.request('GET','/containers/'+encodeURIComponent(id)+'/json')}
  list(filters){return this.request('GET','/containers/json?all=true&filters='+encodeURIComponent(JSON.stringify(filters)))}
  stop(id){return this.request('POST',`/containers/${encodeURIComponent(id)}/stop?t=20`)}
  start(id){return this.request('POST',`/containers/${encodeURIComponent(id)}/start`)}
  rename(id,name){return this.request('POST',`/containers/${encodeURIComponent(id)}/rename?name=${encodeURIComponent(name)}`)}
  remove(id){return this.request('DELETE',`/containers/${encodeURIComponent(id)}?v=false&force=false`)}
  create(name,config){return this.request('POST','/containers/create?name='+encodeURIComponent(name),config)}
  update(id,config){return this.request('POST','/containers/'+encodeURIComponent(id)+'/update',config)}
  load(file){return this.request('POST','/images/load?quiet=true',file,{stream:true,timeout:30*60*1000})}
  images(filters){return this.request('GET','/images/json?all=true&filters='+encodeURIComponent(JSON.stringify(filters)))}
  removeImage(name){return this.request('DELETE','/images/'+encodeURIComponent(name)+'?force=false&noprune=true')}
  image(name){return this.request('GET','/images/'+encodeURIComponent(name)+'/json')}
}
export function candidateConfig(old,manifest,transaction){
  const config=structuredClone(old.Config);
  config.Image=manifest.image;
  config.Env=[...(config.Env??[]).filter(e=>!e.startsWith('SALMON_UPDATE_TRIAL=')),'SALMON_UPDATE_TRIAL=1'];
  config.Labels={...config.Labels,'org.opencontainers.image.version':manifest.version,'org.opencontainers.image.revision':manifest.commit,'salmon-review.update-transaction':transaction};
  delete config.Hostname;
  const endpoints={};for(const [name,net] of Object.entries(old.NetworkSettings.Networks??{}))endpoints[name]={Aliases:(net.Aliases??[]).filter(a=>a!==old.Id.slice(0,12))};
  return {...config,HostConfig:old.HostConfig,NetworkingConfig:{EndpointsConfig:endpoints}};
}
export function sameProjectApp(self,app){
  const project=self.Config.Labels?.['com.docker.compose.project'];
  const mine=self.Mounts.find(m=>m.Destination==='/data'),data=app.Mounts.find(m=>m.Destination==='/data');
  if(!project||app.Config.Labels?.['com.docker.compose.project']!==project||app.Config.Labels?.['com.docker.compose.service']!=='app'||mine?.Type!=='volume'||data?.Type!=='volume'||mine.Name!==data.Name||app.HostConfig.Privileged||app.Mounts.some(m=>m.Destination==='/var/run/docker.sock'))throw new Error('project_mismatch');
  const bindings=Object.values(app.HostConfig.PortBindings??{}).flat();
  if(!bindings.length||bindings.some(p=>p.HostIp!=='127.0.0.1'))throw new Error('project_mismatch');
  return project;
}

// Docker Desktop may report an internal proxy socket as Source. Preserve the
// inspected bind unchanged; validate the in-container destination and ownership.
export function sameProjectUpdater(updater,app){
  const project=sameProjectApp(updater,app);
  const updates=updater.Mounts.find(m=>m.Destination==='/updates'),shared=app.Mounts.find(m=>m.Destination==='/updates');
  if(updater.Config.Labels?.['com.docker.compose.service']!=='updater'||updater.HostConfig.Privileged||Object.values(updater.HostConfig.PortBindings??{}).flat().length||updates?.Type!=='volume'||shared?.Type!=='volume'||updates.Name!==shared.Name||!updater.Mounts.some(m=>m.Destination==='/var/run/docker.sock'&&m.Type==='bind'))throw new Error('project_mismatch');
  return project;
}
export function componentConfig(old,manifest,id){
  const config=candidateConfig(old,manifest,id);
  config.Env=config.Env.filter(e=>!e.startsWith('SALMON_UPDATE_TRIAL='));
  delete config.Labels['salmon-review.update-transaction'];
  config.Labels['salmon-review.bundle-candidate']=id;
  return config;
}
export function helperConfig(old,state){
  const config=componentConfig(old,{image:state.helperImage,version:old.Config.Labels['org.opencontainers.image.version'],commit:old.Config.Labels['org.opencontainers.image.revision']},state.id);
  config.Cmd=['node','server/updater/helper.js',state.id];
  config.Labels['com.docker.compose.service']='update-helper';
  config.Labels['salmon-review.bundle-helper']=state.id;
  delete config.Labels['salmon-review.bundle-candidate'];
  config.Healthcheck={Test:['NONE']};
  config.HostConfig=structuredClone(old.HostConfig);
  config.HostConfig.RestartPolicy={Name:'unless-stopped',MaximumRetryCount:0};
  for(const endpoint of Object.values(config.NetworkingConfig.EndpointsConfig))endpoint.Aliases=[state.helperName];
  return config;
}
