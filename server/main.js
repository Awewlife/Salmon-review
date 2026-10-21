import http from 'node:http';
import {version} from './version.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {readDiagnostics} from './diagnostics.js';
import {internalUpdater,updaterRequest,updateDirectory} from './update-client.js';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {Store} from './store.js';
import {CliAccount} from './account.js';
import {Tasks,workerCall} from './tasks.js';
import {publicError} from './errors.js';
import {safeAssetUrl} from './normalize.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map(['index.html','i18n.js','i18n-catalog.js','byname-catalog.js','i18n.css','career.js','preferences.js','personal-records.js','player-card.js','kill-details.js','release-notes.js','view-data.js','app.js','radar.js','radar-export.js','radar-view.js','metrics.js','chart-dialog.js','grade-chart.js','score-export.js','style.css','manage.js','manage.css','update.js','diagnostics.js'].map(name=>['/'+name,path.join(root,'../dist',name)]));
staticFiles.set('/LICENSE',path.join(root,'../LICENSE'));
for(const name of ['MPLUSRounded1c-ExtraBold.ttf','OFL.txt','INKLING-NOTICE.txt'])staticFiles.set('/fonts/'+name,path.join(root,'../dist/fonts',name));
const imageType=body=>body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':body[0]===255&&body[1]===216&&body[2]===255?'image/jpeg':body.toString('ascii',0,4)==='RIFF'&&body.toString('ascii',8,12)==='WEBP'?'image/webp':null;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
export async function createApp({directory=process.env.DATA_DIR??path.join(root,'../data'),runner=workerCall,accountOptions}={}){
  const store=new Store(directory),account=new CliAccount(directory,accountOptions),tasks=new Tasks(store,account,runner);
  if(process.env.SALMON_UPDATE_TRIAL==='1'){
    let installed=null;try{installed=JSON.parse(await readFile(updateDirectory+'/installed.json','utf8'))}catch{}
    tasks.updateLocked=installed?.version!==version;
  }
  const csrf=randomBytes(32).toString('hex');const assetJobs=new Map();
  await mkdir(path.join(directory,'assets'),{recursive:true,mode:0o700});
  const send=(res,status,value,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value))};
  // SQLite tracks commits from other connections as well as local writes. Cache
  // only serialized display data, never account/status responses or credentials.
  const dataVersion=store.db.prepare('PRAGMA data_version'),localChanges=store.db.prepare('SELECT total_changes() AS n');
  const displayVersion=()=>`${dataVersion.get().data_version}:${localChanges.get().n}`;
  let displayCache;
  const displayJson=()=>{const version=displayVersion();if(displayCache?.version===version)return displayCache.json;const json=JSON.stringify(store.snapshot()),after=displayVersion();displayCache=version.split(':')[0]===after.split(':')[0]?{version:after,json}:null;return json};
  const state=()=>({version,csrf,connected:!!account.read(),authBackend:'nxapi-cli',records:store.db.prepare('SELECT count(*) AS n FROM records').get().n,owner:!!store.get('owner'),lastImport:store.get('lastImport'),sync:tasks.status()});
  const validation=()=>({version:state().version,records:state().records,jobs:store.snapshot().jobs.length,connected:state().connected,fingerprint:createHash('sha256').update(JSON.stringify(store.backup().documents)).digest('hex')});
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
      const body=Buffer.concat(chunks);if(!imageType(body))throw new Error('not_found');
      await writeFile(file+'.tmp',body);await rename(file+'.tmp',file);return body;
    })();assetJobs.set(id,task);try{return await task}finally{assetJobs.delete(id)}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net/gh/frozenpandaman/frozenpandaman.github.io@70f9b936a841672da15d1342ad99db63d3c50229/Inkling_v2.otf; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try{
      const host=req.headers.host??'',url=new URL(req.url,'http://'+host);
      // Fetch Metadata is browser-controlled and cannot be set by page JavaScript.
      // Some browser configurations rewrite Origin without the local port; an
      // explicit same-origin classification still identifies a local request.
      // Without that classification, retain the exact Origin check. Cross-site
      // requests and unrecognized hosts are always rejected; writes also need CSRF.
      const site=req.headers['sec-fetch-site'];
      if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||site==='cross-site'||(site!=='same-origin'&&req.headers.origin&&req.headers.origin!=='http://'+host))return send(res,403,publicError(new Error('forbidden')));
      if(req.method==='POST'&&['/api/update/prepare','/api/update/validate','/api/update/activate','/api/update/cancel'].includes(url.pathname)){
        if(!await internalUpdater(req))return send(res,403,publicError(new Error('forbidden')));
        if(url.pathname.endsWith('/prepare')){if(tasks.active||tasks.authBusy||account.pending)throw new Error('busy');tasks.updateLocked=true}
        if(url.pathname.endsWith('/activate')||url.pathname.endsWith('/cancel'))tasks.updateLocked=false;
        return send(res,200,validation());
      }
      const mutation=req.method!=='GET'&&req.method!=='HEAD';
      if(mutation){const value=Buffer.from(String(req.headers['x-salmon-csrf']??'')),expected=Buffer.from(csrf);if(value.length!==expected.length||!timingSafeEqual(value,expected))return send(res,403,publicError(new Error('forbidden')))}
      if(mutation&&tasks.updateLocked)return send(res,409,{code:'busy',message:'正在更新程序，请等待页面自动重新连接。'});
      if(req.method==='GET'&&url.pathname==='/api/update/status')return send(res,200,await updaterRequest('status'));
      if(req.method==='POST'&&url.pathname==='/api/update/authorize'){
        const body=await readBody(req);
        if(typeof body.token!=='string'||body.token.length>255)return send(res,400,{message:'GitHub 凭据格式不正确。'});
        return send(res,200,await updaterRequest('authorize',{token:body.token}));
      }
      if(req.method==='POST'&&url.pathname==='/api/update/disconnect')return send(res,200,await updaterRequest('disconnect',{}));
      if(req.method==='POST'&&url.pathname==='/api/update/check')return send(res,202,await updaterRequest('check',{}));
      if(req.method==='POST'&&url.pathname==='/api/update/cancel-install')return send(res,202,await updaterRequest('cancel-install',{}));
      if(req.method==='POST'&&url.pathname==='/api/update/install'){
        if(tasks.active||tasks.authBusy)throw new Error('busy');const body=await readBody(req);
        if(typeof body.version!=='string'||!/^\d+\.\d+\.\d+$/.test(body.version))return send(res,400,{message:'版本号无效。'});
        return send(res,202,await updaterRequest('install',{version:body.version}));
      }
      if(req.method==='GET'&&url.pathname==='/api/diagnostics')return send(res,200,await readDiagnostics(store,{updaterConfigured:!!updateDirectory}));
      if(req.method==='GET'&&url.pathname==='/api/status')return send(res,200,state());
      if(req.method==='GET'&&url.pathname==='/api/career')return send(res,200,store.career());
      if(req.method==='POST'&&url.pathname==='/api/career/refresh'){try{return send(res,200,await tasks.refreshCareer())}catch(error){const e=publicError(error);if(e.code==='upstream')e.message='官方生涯纪录获取失败，请稍后重试；已有战绩和纪录仍保留。';return send(res,e.code==='busy'?409:400,e)}}
      if(req.method==='GET'&&url.pathname==='/api/data'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(displayJson())}
      if(req.method==='GET'&&url.pathname==='/api/backup')return send(res,200,store.backup(),{'Content-Disposition':'attachment; filename="salmon-review-backup.json"'});
      if(req.method==='GET'&&url.pathname==='/data.js'){
        res.writeHead(200,{'Content-Type':types['.js']});return res.end('window.SALMON_DATA = '+displayJson().replace(/</g,'\\u003c')+';');
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
        try{const body=await image(url.pathname.split('/').at(-1));res.writeHead(200,{'Content-Type':imageType(body)??'application/octet-stream','Cache-Control':'private, max-age=86400'});return res.end(body)}catch{res.writeHead(404);return res.end()}
      }
      const file=staticFiles.get(url.pathname==='/'?'/index.html':url.pathname);
      if(file&&req.method==='GET'){res.writeHead(200,{'Content-Type':types[path.extname(file)]??'text/plain; charset=utf-8'});return res.end(await readFile(file))}
      send(res,404,{message:'Not found'});
    }catch(error){const e=publicError(error);send(res,e.code==='busy'?409:e.code==='internal'||e.code==='disk'?500:400,e)}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;tasks.schedule();
  return {server,store,account,tasks,close:async()=>{tasks.stop();await account.cancel();await new Promise(resolve=>server.close(resolve));if(tasks.completion)await tasks.completion.catch(()=>{});store.close()}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createApp(),port=Number(process.env.PORT??8787);app.server.listen(port,process.env.BIND_ADDRESS??'127.0.0.1',()=>console.log(`Salmon Review listening on port ${port}`));
  let closing=false;const stop=()=>{if(closing)return;closing=true;app.close().then(()=>process.exit(0));setTimeout(()=>process.exit(0),8000).unref()};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
