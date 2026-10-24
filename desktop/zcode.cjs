const {makeRecord}=require('./parsers.cjs');
const valid=n=>Number.isSafeInteger(n)&&n>=0;
// ZCode normalizes recent input_tokens as inclusive of caches. Older rows can
// be exclusive: use the recorded total to disambiguate, never add caches twice.
function parseZCodeUsage(row){
  if(!row.id||!row.session_id||!valid(row.started_at))return null;
  const input=row.input_tokens,output=row.output_tokens,read=row.cache_read_input_tokens??0,write=row.cache_creation_input_tokens??0;
  if(![input,output,read,write].every(valid))return null;
  const total=valid(row.provider_total_tokens)&&row.provider_total_tokens>0?row.provider_total_tokens:row.computed_total_tokens;
  if(!valid(total)||total===0)return null;
  let uncached;
  if(total===input+output+read+write)uncached=input;
  else if(total===input+output&&input>=read+write)uncached=input-read-write;
  else return null;
  return makeRecord({id:`zcode:${row.id}`,source:'zcode',session:row.session_id,timestamp:row.started_at,model:row.model_id,input:uncached,output,cacheRead:read,cacheWrite:write});
}
function readZCode(file){
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(file,{readOnly:true,allowExtension:false});
  try{
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000;');
    const columns=new Set(db.prepare('PRAGMA table_info(model_usage)').all().map(r=>r.name));
    const required=['id','session_id','model_id','started_at','input_tokens','output_tokens','computed_total_tokens'];
    if(required.some(c=>!columns.has(c)))throw new Error('ZCode 用量表格式不受支持，未读取对话表');
    const optional=['cache_read_input_tokens','cache_creation_input_tokens','provider_total_tokens'];
    const selection=[...required,...optional.filter(c=>columns.has(c))].join(',');
    const records=[];let skipped=0;
    for(const row of db.prepare(`SELECT ${selection} FROM model_usage`).iterate()){
      const r=parseZCodeUsage(row);if(r)records.push(r);else if(row.input_tokens>0||row.output_tokens>0)skipped++;
    }
    return {records,skipped};
  }finally{db.close();}
}
module.exports={parseZCodeUsage,readZCode};
