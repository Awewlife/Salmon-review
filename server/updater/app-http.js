import http from 'node:http';
// Use an explicit Host header for the app's loopback-only host allowlist.
// The destination IP is read from Docker, never provided by a webpage.
export function appHTTP(ip,route,{body,token,csrf}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:ip,port:8787,path:route,method:body===undefined?'GET':'POST',headers:{Host:'127.0.0.1:8787','Content-Type':'application/json',...(token?{'X-Salmon-Updater':token}:{}),...(csrf?{'X-Salmon-CSRF':csrf}:{})}},res=>{
      let raw='';res.on('data',chunk=>{raw+=chunk;if(raw.length>1024*1024)res.destroy(new Error('invalid_response'))});res.on('error',reject);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(raw)})}catch{reject(new Error('invalid_response'))}});
    });
    req.setTimeout(10000,()=>req.destroy(new Error('unhealthy')));req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
}
