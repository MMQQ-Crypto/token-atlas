importScripts('usage.js');
let pending=Promise.resolve();
async function flush(){
  const {queue=[],url='http://127.0.0.1:46137',key=''}=await chrome.storage.local.get(['queue','url','key']);
  if(!key)return;
  const remaining=[...queue];let error='';
  while(remaining.length){try{const r=await fetch(url+'/usage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(remaining[0]),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error(r.status===401?'配对码已失效，请重新配对':'桌面端拒绝了用量记录');remaining.shift();}catch(e){error=e.message;break;}}
  await chrome.storage.local.set({queue:remaining,lastError:error});
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  pending=pending.catch(()=>{}).then(async()=>{
    const state=await chrome.storage.local.get(['enabled','queue','observed','withUsage']);
    if(msg.type==='flush'){await flush();return {ok:true};}
    let host;try{host=new URL(sender.tab?.url||'').hostname;}catch{return {ok:false};}
    if(!TokenAtlasUsage.DOMAINS[host]||!state.enabled)return {ok:false};
    if(msg.type==='observed'){await chrome.storage.local.set({observed:(state.observed||0)+1,withUsage:(state.withUsage||0)+(msg.hasUsage?1:0)});return {ok:true};}
    if(msg.type==='usage'){
      const r=msg.record;if(!r||r.host!==host||typeof r.responseId!=='string')return {ok:false};
      const valid=TokenAtlasUsage.normalize({prompt_tokens:r.input+r.cacheRead,completion_tokens:r.output,prompt_cache_hit_tokens:r.cacheRead,total_tokens:r.total-(r.cacheWrite||0)});
      if(!valid||!Number.isSafeInteger(r.cacheWrite||0)||(r.cacheWrite||0)<0)return {ok:false};
      const record={...valid,cacheWrite:r.cacheWrite||0,total:r.total,model:typeof r.model==='string'?r.model.slice(0,200):'未知模型',responseId:r.responseId.slice(0,500),host,timestamp:r.timestamp};
      const queue=state.queue||[];queue.push(record);
      if(queue.length>1000){await chrome.storage.local.set({lastError:'离线记录已达 1000 条，请先连接桌面端',enabled:false});return {ok:false};}
      await chrome.storage.local.set({queue});await flush();return {ok:true};
    }
    return {ok:false};
  });pending.then(reply,e=>reply({ok:false,error:e.message}));return true;
});
chrome.alarms.create('retry',{periodInMinutes:1});chrome.alarms.onAlarm.addListener(()=>{pending=pending.catch(()=>{}).then(flush);});
