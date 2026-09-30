import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {Store} from './store.js';
import {CliAccount} from './account.js';
import {Tasks,workerCall} from './tasks.js';
import {publicError} from './errors.js';
import {safeAssetUrl} from './normalize.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map(['index.html','view-data.js','app.js','metrics.js','chart-dialog.js','style.css','manage.js','manage.css'].map(name=>['/'+name,path.join(root,'../dist',name)]));
staticFiles.set('/LICENSE',path.join(root,'../LICENSE'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
export async function createApp({directory=process.env.DATA_DIR??path.join(root,'../data'),runner=workerCall,accountOptions}={}){
  const store=new Store(directory),account=new CliAccount(directory,accountOptions),tasks=new Tasks(store,account,runner);
  const csrf=randomBytes(32).toString('hex');const assetJobs=new Map();
  await mkdir(path.join(directory,'assets'),{recursive:true,mode:0o700});
  const send=(res,status,value,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value))};
  const state=()=>({version:'0.3.3',csrf,connected:!!account.read(),authBackend:'nxapi-cli',records:store.db.prepare('SELECT count(*) AS n FROM records').get().n,owner:!!store.get('owner'),lastImport:store.get('lastImport'),sync:tasks.status()});
  async function readBody(req){
    if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new Error('bad_json');
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>64*1024*1024)throw new Error('too_large');chunks.push(chunk)}
    try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw new Error('bad_json')}
  }
  async function image(id){
    const file=path.join(directory,'assets',id);try{return await readFile(file)}catch{}
    if(assetJobs.has(id))return assetJobs.get(id);
    const task=(async()=>{
      const row=store.db.prepare('SELECT url FROM assets WHERE id=?').get(id),url=safeAssetUrl(row?.url);if(!url)throw new Error('not_found');
      const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('not_found');
      let size=0;const chunks=[];for await(const part of response.body){size+=part.length;if(size>5*1024*1024)throw new Error('too_large');chunks.push(part)}
      const body=Buffer.concat(chunks);if(!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('not_found');
      await writeFile(file+'.tmp',body);await rename(file+'.tmp',file);return body;
    })();assetJobs.set(id,task);try{return await task}finally{assetJobs.delete(id)}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try{
      const host=req.headers.host??'',url=new URL(req.url,'http://'+host);
      // Fetch Metadata is browser-controlled and cannot be set by page JavaScript.
      // Some browser configurations rewrite Origin without the local port; an
      // explicit same-origin classification still identifies a local request.
      // Without that classification, retain the exact Origin check. Cross-site
      // requests and unrecognized hosts are always rejected; writes also need CSRF.
      const site=req.headers['sec-fetch-site'];
      if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||site==='cross-site'||(site!=='same-origin'&&req.headers.origin&&req.headers.origin!=='http://'+host))return send(res,403,publicError(new Error('forbidden')));
      const mutation=req.method!=='GET'&&req.method!=='HEAD';
      if(mutation){const value=Buffer.from(String(req.headers['x-salmon-csrf']??'')),expected=Buffer.from(csrf);if(value.length!==expected.length||!timingSafeEqual(value,expected))return send(res,403,publicError(new Error('forbidden')))}
      if(req.method==='GET'&&url.pathname==='/api/status')return send(res,200,state());
      if(req.method==='GET'&&url.pathname==='/api/data')return send(res,200,store.snapshot());
      if(req.method==='GET'&&url.pathname==='/api/backup')return send(res,200,store.backup(),{'Content-Disposition':'attachment; filename="salmon-review-backup.json"'});
      if(req.method==='GET'&&url.pathname==='/data.js'){
        res.writeHead(200,{'Content-Type':types['.js']});return res.end('window.SALMON_DATA = '+JSON.stringify(store.snapshot()).replace(/</g,'\\u003c')+';');
      }
      if(req.method==='POST'&&['/api/import','/api/restore'].includes(url.pathname)){
        if(tasks.active||tasks.authBusy)throw new Error('busy');
        const body=await readBody(req);const result=url.pathname.endsWith('restore')?store.restore(body):store.import(body.documents);return send(res,200,result);
      }
      if(req.method==='POST'&&url.pathname==='/api/sync')return send(res,202,tasks.start());
      if(req.method==='POST'&&url.pathname==='/api/settings'){
        const body=await readBody(req);if(![0,15,30,60,120].includes(body.autoMinutes))throw new Error('invalid_import');
        store.set('autoMinutes',body.autoMinutes);return send(res,200,state());
      }
      if(req.method==='POST'&&url.pathname==='/api/auth/start'){
        if(tasks.active||tasks.authBusy)throw new Error('busy');
        tasks.authBusy=true;try{return send(res,200,await account.start())}finally{tasks.authBusy=false}
      }
      if(req.method==='POST'&&url.pathname==='/api/auth/complete'){
        if(tasks.active||tasks.authBusy)throw new Error('busy');const body=await readBody(req);
        tasks.authBusy=true;
        try{await account.complete(body.url);tasks.reconnected();return send(res,200,state())}finally{tasks.authBusy=false}
      }
      if(req.method==='POST'&&url.pathname==='/api/auth/logout'){
        if(tasks.active||tasks.authBusy)throw new Error('busy');await account.clear();store.set('autoMinutes',0);store.set('paused',null);return send(res,200,state());
      }
      if(req.method==='GET'&&/^\/assets\/[a-f0-9]{64}$/.test(url.pathname)){
        try{const body=await image(url.pathname.split('/').at(-1));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, max-age=86400'});return res.end(body)}catch{res.writeHead(404);return res.end()}
      }
      const file=staticFiles.get(url.pathname==='/'?'/index.html':url.pathname);
      if(file&&req.method==='GET'){res.writeHead(200,{'Content-Type':types[path.extname(file)]??'text/plain; charset=utf-8'});return res.end(await readFile(file))}
      send(res,404,{message:'Not found'});
    }catch(error){const e=publicError(error);send(res,e.code==='busy'?409:e.code==='internal'||e.code==='disk'?500:400,e)}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;tasks.schedule();
  return {server,store,account,tasks,close:async()=>{tasks.stop();await account.cancel();await new Promise(resolve=>server.close(resolve));if(tasks.completion)await tasks.completion;store.close()}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createApp(),port=Number(process.env.PORT??8787);app.server.listen(port,process.env.BIND_ADDRESS??'127.0.0.1',()=>console.log(`Salmon Review listening on port ${port}`));
  let closing=false;const stop=()=>{if(closing)return;closing=true;app.close().then(()=>process.exit(0));setTimeout(()=>process.exit(0),8000).unref()};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
