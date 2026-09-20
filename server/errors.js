export const messages={
  invalid_record:'记录格式不完整；请导入 nxapi 打工详情 JSON。',invalid_summary:'排班汇总格式无效。',invalid_import:'请选择 nxapi JSON 文件（每批不超过 2000 个）。',invalid_backup:'备份格式或版本不支持。',
  credentials_in_import:'文件包含登录凭据，不是可导入的战绩文件。',account_mismatch:'这些记录属于另一位玩家。一个数据卷只保存一个账号，请使用独立实例。',
  auth_required:'登录已失效，请重新连接任天堂账号。',auth_callback:'授权链接无效或已过期，请重新开始连接。',
  upstream_disabled:'上游暂时禁止认证，已暂停自动同步；可继续浏览或导入记录。',rate_limited:'请求频率受限，已延后同步。',network:'网络暂时不可用，稍后可重试。',upstream:'上游接口异常或版本不兼容，已暂停自动同步。',
  interrupted:'服务重启或任务超时，已保存的记录保留；可重新同步继续。',busy:'已有任务正在运行，请等待完成。',cooldown:'同步间隔过短，请稍后再试。',forbidden:'请求来源无效，请从本机页面操作。',too_large:'文件过大，请分批导入（每批最多 64 MB）。',bad_json:'JSON 内容无效。',internal:'操作未完成，原有数据仍保留。',disk:'数据保存失败，请检查磁盘空间和数据卷权限。'};
export function classify(error){
  if(messages[error?.code])return error.code;
  if(messages[error?.message])return error.message;
  const message=String(error?.message??''),status=error?.httpStatus??error?.response?.status;
  if(status===429||/RATE_LIMIT|rate.?limit/i.test(message))return 'rate_limited';
  if(/Remote configuration prevents/.test(message))return 'upstream_disabled';
  if(status===401||/invalid_grant|invalid.*session|expired.*session|session.*invalid|token expired/i.test(message)||error?.data?.error==='invalid_grant')return 'auth_required';
  if(['ENOSPC','EACCES','SQLITE_FULL'].includes(error?.code))return 'disk';
  if(status>=500||/fetch failed|ECONN|ETIMEDOUT|network|timeout|ENOTFOUND/i.test(message))return 'network';
  return 'upstream';
}
export const publicError=error=>{const code=classify(error);return {code,message:messages[code]}};
