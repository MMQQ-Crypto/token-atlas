(()=>{
  const api=globalThis.TokenAtlasUsage;if(!api)return;
  let enabled=false;
  window.addEventListener('message',event=>{if(event.source===window&&event.data?.channel==='token-atlas-control')enabled=event.data.enabled===true;});
  const send=(records,id)=>{
    const byId=new Map();for(const r of records)byId.set(r.responseId||id,r);
    for(const r of byId.values())window.postMessage({channel:'token-atlas-usage',record:{...r,responseId:r.responseId||id,host:location.hostname,timestamp:new Date().toISOString()}},location.origin);
    window.postMessage({channel:'token-atlas-observed',hasUsage:byId.size>0},location.origin);
  };
  const original=window.fetch;
  window.fetch=function(...args){const result=Reflect.apply(original,this,args);if(enabled)result.then(response=>{
    if(!response.ok)return;
    const type=response.headers.get('content-type')||'';
    if(!type.includes('json')&&!type.includes('event-stream'))return;
    const copy=response.clone(),id=crypto.randomUUID();
    (async()=>{
      const records=[];let size=0;
      if(type.includes('event-stream')&&copy.body){
        const reader=copy.body.getReader(),decoder=new TextDecoder(),parser=api.streamParser(r=>records.push(r));
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32*1024*1024){await reader.cancel();return;}parser.push(decoder.decode(value,{stream:true}));}parser.push(decoder.decode());parser.end();}finally{reader.releaseLock();}
      }else{const reader=copy.body?.getReader();if(!reader)return;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();return;}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const v of chunks){bytes.set(v,offset);offset+=v.length;}records.push(...api.extract(JSON.parse(new TextDecoder().decode(bytes))));}finally{reader.releaseLock();}}
      send(records,id);
    })().catch(()=>{});
  }).catch(()=>{});return result;};
  const open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(...args){this.addEventListener('load',()=>{if(!enabled||this.status<200||this.status>=300)return;try{let data;if(this.responseType==='json')data=this.response;else if(!this.responseType||this.responseType==='text'){if(this.responseText.length>8*1024*1024)return;try{data=JSON.parse(this.responseText);}catch{const records=[],parser=api.streamParser(r=>records.push(r));parser.push(this.responseText);parser.end();send(records,crypto.randomUUID());return;}}if(data)send(api.extract(data),crypto.randomUUID());}catch{}});return Reflect.apply(open,this,args);};
})();
