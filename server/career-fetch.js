// Reuse nxapi's selected account, refresh and rate-limit handling. Never print credentials.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {loadOfficialCareer} from './career.js';
import {classify} from './errors.js';
const require=createRequire(import.meta.url);
const base=path.resolve(path.dirname(require.resolve('nxapi')),'..');
try{
  const {initStorage}=await import(pathToFileURL(path.join(base,'util/storage.js')));
  const {getBulletToken}=await import(pathToFileURL(path.join(base,'common/auth/splatnet3.js')));
  const storage=await initStorage(process.env.NXAPI_DATA_PATH);
  const selected=await storage.getItem('SelectedUser');
  const token=await storage.getItem('NintendoAccountToken.'+selected);
  if(!token)throw new Error('auth_required');
  const {splatnet}=await getBulletToken(storage,token,undefined,true);
  const query=JSON.parse(await readFile(new URL('./career-query.json',import.meta.url),'utf8'));
  const nso=await storage.getItem('NsoToken.'+token);
  const value=await loadOfficialCareer(splatnet,query.sha256Hash,nso?.nsoAccount?.user?.imageUri);
  process.stdout.write(JSON.stringify(value));
}catch(error){process.stdout.write(JSON.stringify({error:classify(error)}));process.exitCode=1}
