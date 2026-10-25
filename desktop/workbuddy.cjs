const path=require('node:path');
const {createHash}=require('node:crypto');
const {makeRecord}=require('./parsers.cjs');
const valid=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
function cacheCounts(u){
  const details=Array.isArray(u.inputTokensDetails)?u.inputTokensDetails:u.inputTokensDetails?[u.inputTokensDetails]:[];
  const detailed=details.reduce((sum,d)=>sum+(d?.cached_tokens??0),0);
  const reads=[u.cache_read_input_tokens,u.cacheReadInputTokens,details.length?detailed:undefined,u.prompt_tokens_details?.cached_tokens,u.prompt_cache_hit_tokens];
  const writes=[u.cache_creation_input_tokens,u.cacheCreationInputTokens,u.prompt_cache_write_tokens];
  if([...reads,...writes].some(n=>n!==undefined&&!valid(n)))return null;
  return {read:reads.find(n=>n>0)||0,write:writes.find(n=>n>0)||0};
}
function normalizeBuddyUsage(u,cacheFallback){
  if(!u||typeof u!=='object'||Array.isArray(u)||u.estimated===true||u.is_estimated===true)return null;
  const cache=cacheCounts(u);if(!cache)return null;
  const read=cache.read||cacheFallback?.read||0,write=cache.write||cacheFallback?.write||0;
  let input,output,total,exclusive=false;
  if('prompt_tokens'in u||'completion_tokens'in u){input=u.prompt_tokens;output=u.completion_tokens;total=u.total_tokens;}
  else if('inputTokens'in u||'outputTokens'in u){input=u.inputTokens;output=u.outputTokens;total=u.totalTokens;}
  else if('input_tokens'in u||'output_tokens'in u){input=u.input_tokens;output=u.output_tokens;total=u.total_tokens;exclusive='cache_read_input_tokens'in u||'cache_creation_input_tokens'in u;}
  else return null;
  if(!valid(input)||!valid(output)||(total!==undefined&&!valid(total)))return null;
  const inclusive=input+output,withCache=inclusive+read+write;
  if(exclusive){if(total!==undefined&&total!==withCache)return null;}
  else if(total===withCache&&withCache!==inclusive)exclusive=true;
  else if(total!==undefined&&total!==inclusive)return null;
  if(!exclusive&&read+write>input)return null;
  input=exclusive?input:input-read-write;
  const sum=input+output+read+write;if(!valid(sum)||sum===0)return null;
  return {input,output,cacheRead:read,cacheWrite:write,total:sum};
}
function parseWorkBuddy(obj,file,index,diagnostics){
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
  const p=obj.providerData||obj.message?.providerData||{};
  const eligible=obj.type==='model-usage'||obj.type==='function_call'||obj.type==='message'&&obj.role==='assistant'||obj.type==='assistant';
  if(!eligible||(!p.usage&&!p.rawUsage&&!obj.message?.usage))return null;
  if(diagnostics)diagnostics.usageRows++;
  const raw=p.rawUsage&&typeof p.rawUsage==='object'&&!Array.isArray(p.rawUsage)?p.rawUsage:null,hasRawTokens=raw&&['prompt_tokens','completion_tokens','input_tokens','output_tokens','inputTokens','outputTokens'].some(k=>k in raw);
  const usage=hasRawTokens?normalizeBuddyUsage(raw):normalizeBuddyUsage(p.usage||obj.message?.usage,raw?cacheCounts(raw):null);
  const invalid=()=>{if(diagnostics)diagnostics.skippedRows++;return null;};
  if(!usage||obj.estimated===true||obj.is_estimated===true||p.estimated===true||p.usage?.estimated===true||p.usage?.is_estimated===true||raw?.estimated===true||raw?.is_estimated===true)return invalid();
  const session=String(obj.sessionId||obj.session_id||path.basename(file,'.jsonl'));
  // A response may occur in tool messages, a final model-usage row and inherited history.
  // The provider message ID identifies that response across copied/forked transcripts.
  const identity=p.messageId?['response',p.messageId]:obj.message?.id||obj.id||obj.uuid?['entry',obj.message?.id||obj.id||obj.uuid]:['line',path.basename(file),index,obj.timestamp];
  const key=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const record=makeRecord({id:'workbuddy:'+key,source:'workbuddy',session,timestamp:obj.timestamp,
    model:p.model||p.requestModelId||obj.message?.model||p.requestModelName||'未知模型',...usage});
  if(!record)return invalid();
  record.usageSettled=obj.type==='model-usage';
  if(diagnostics)diagnostics.acceptedRows++;
  return record;
}
module.exports={parseWorkBuddy,normalizeBuddyUsage};
