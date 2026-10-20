import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RequestId} from 'splatnet3-types/splatnet3';

test('installed nxapi uses only the reviewed local compatibility contract',()=>{
  const result=execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/check-splatnet-compat.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true});
  assert.match(result,/85 query names; local adapter only/);
});
test('removed and unreviewed queries fail explicitly instead of sending undefined or fabricated IDs',()=>{
  for(const name of ['FestRecordRefetchQuery','WeaponRecordQuery','WeaponRecordsRefetchQuery'])assert.throws(()=>RequestId[name],{code:'ERR_SPLATNET_QUERY_REMOVED'});
  assert.throws(()=>RequestId.FutureUnknownQuery,{code:'ERR_SPLATNET_QUERY_UNREVIEWED'});
  assert.throws(()=>{RequestId.CoopHistoryQuery='bad'},TypeError);
});
