(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else Object.defineProperty(root,'TokenAtlasUsage',{value:api,configurable:true});})(globalThis,function(){
  const valid=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
  function normalize(u){
    if(!u||u.estimated===true||u.is_estimated===true)return null;
    let input,output,read=0,write=0;
    if(valid(u.prompt_tokens)&&valid(u.completion_tokens)){
      read=u.prompt_cache_hit_tokens??u.prompt_tokens_details?.cached_tokens??0;
      if(!valid(read)||read>u.prompt_tokens)return null;
      input=u.prompt_tokens-read;output=u.completion_tokens;
    }else if(valid(u.input_tokens)&&valid(u.output_tokens)){
      output=u.output_tokens;
      if('cache_read_input_tokens'in u||'cache_creation_input_tokens'in u){
        input=u.input_tokens;read=u.cache_read_input_tokens??0;write=u.cache_creation_input_tokens??0;
      }else{read=u.input_tokens_details?.cached_tokens??0;if(!valid(read)||read>u.input_tokens)return null;input=u.input_tokens-read;}
    }else return null;
    if(![input,output,read,write].every(valid))return null;
    const total=input+output+read+write;
    if(!valid(total)||!total||(u.total_tokens!==undefined&&(!valid(u.total_tokens)||u.total_tokens!==total)))return null;
    return {input,output,cacheRead:read,cacheWrite:write,total};
  }
  function extract(object,context={},depth=0){
    if(!object||typeof object!=='object'||depth>8||object.estimated===true)return [];
    const records=[];
    const current={...context,model:typeof object.model==='string'?object.model:context.model,responseId:typeof object.id==='string'?object.id:context.responseId,created:object.created??context.created};
    const usage=normalize(object.usage);
    if(usage)records.push({...current,...usage});
    for(const key of ['data','response','result','message','output']){
      const value=object[key];if(value&&typeof value==='object')for(const child of Array.isArray(value)?value:[value])records.push(...extract(child,current,depth+1));
    }
    return records;
  }
  function streamParser(callback){
    let buffer='';
    function event(block){const text=block.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!text||text==='[DONE]')return;try{for(const r of extract(JSON.parse(text)))callback(r);}catch{}}
    return {push(text){buffer+=text;let match;while((match=/\r?\n\r?\n/.exec(buffer))){event(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}if(buffer.length>2*1024*1024)buffer='';},end(){if(buffer.trim())event(buffer);buffer='';}};
  }
  const DOMAINS={
    'chat.deepseek.com':'deepseek','www.doubao.com':'doubao','doubao.com':'doubao',
    'www.kimi.com':'moonshot','kimi.com':'moonshot','kimi.moonshot.cn':'moonshot',
    'www.qianwen.com':'qwen','qianwen.com':'qwen','tongyi.aliyun.com':'qwen','chat.qwen.ai':'qwen',
    'chatglm.cn':'zhipu','www.chatglm.cn':'zhipu','yiyan.baidu.com':'ernie','yuanbao.tencent.com':'hunyuan','xinghuo.xfyun.cn':'spark'
  };
  return {normalize,extract,streamParser,DOMAINS};
});
