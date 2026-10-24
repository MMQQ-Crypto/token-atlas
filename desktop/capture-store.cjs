const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {makeRecord}=require('./parsers.cjs');
const {extract,streamParser,DOMAINS}=require('../extension/usage.js');
class CaptureStore{
  records=new Map();queue=Promise.resolve();
  constructor(directory){this.file=path.join(directory,'captured-usage.jsonl');}
  async load(){try{for(const line of (await fs.readFile(this.file,'utf8')).split('\n')){try{const r=JSON.parse(line);if(r.id&&['browser','imported'].includes(r.source)&&r.total>0)this.records.set(r.id,r);}catch{}}}catch(e){if(e.code!=='ENOENT')throw e;}}
  list(){return [...this.records.values()];}
  async add(raw,source='browser'){
    // Re-validate all counters. No conversation or authentication fields are persisted.
    const write=raw.cacheWrite??0;
    if(![raw.input,raw.output,raw.cacheRead,write,raw.total].every(x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0)||raw.total!==raw.input+raw.output+raw.cacheRead+write||raw.total===0)throw new Error('Token 构成与总数不符');
    if(typeof raw.responseId!=='string'||!raw.responseId||raw.responseId.length>500)throw new Error('缺少请求标识');
    if(typeof raw.timestamp!=='string'||!raw.timestamp.trim()||!Number.isFinite(Date.parse(raw.timestamp)))throw new Error('缺少有效时间');
    const host=String(raw.host||'').toLowerCase();
    if(source==='browser'&&!DOMAINS[host])throw new Error('未支持的网页来源');
    if(!['browser','imported'].includes(source))throw new Error('未知采集来源');
    const hint=DOMAINS[host];
    const id='response:'+crypto.createHash('sha256').update(`${host}:${raw.responseId}`).digest('hex');
    const r=makeRecord({id,source,session:id,timestamp:raw.timestamp,model:typeof raw.model==='string'?raw.model.slice(0,200):'未知模型',input:raw.input,output:raw.output,cacheRead:raw.cacheRead,cacheWrite:write});
    if(!r)throw new Error('缺少有效时间');
    r.providerHint=hint||'';r.evidence='response.usage';
    const operation=this.queue.then(async()=>{const old=this.records.get(id);if(old&&old.total>=r.total)return false;await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.appendFile(this.file,JSON.stringify(r)+'\n');this.records.set(id,r);return true;});
    this.queue=operation.catch(()=>{});
    return operation;
  }
  async importFile(file){
    const stat=await fs.stat(file);if(stat.size>64*1024*1024)throw new Error('导入文件超过 64 MB，请拆分后导入');
    const text=await fs.readFile(file,'utf8');let document;
    try{document=JSON.parse(text.replace(/^\ufeff/,''));}catch{}
    let added=0,found=0,skipped=0;
    const accept=async(object,context)=>{for(const u of extract(object)){found++;const created=typeof u.created==='number'?new Date(u.created*1000).toISOString():undefined;try{if(await this.add({...u,...context,responseId:u.responseId||context.responseId,timestamp:created||context.timestamp},'imported'))added++;}catch{skipped++;}}};
    if(document?.log?.entries){
      for(const e of document.log.entries){let host='';try{host=new URL(e.request?.url).hostname;}catch{}
        const c=e.response?.content;if(!c?.text)continue;
        const body=c.encoding==='base64'?Buffer.from(c.text,'base64').toString('utf8'):c.text;
        const context={host,timestamp:e.startedDateTime,responseId:'har:'+crypto.createHash('sha256').update(`${e.startedDateTime}:${e.request?.url}:${body}`).digest('hex')};
        let json;try{json=JSON.parse(body);}catch{}
        if(json)await accept(json,context);
        else {const items=[];const parser=streamParser(r=>items.push(r));parser.push(body);parser.end();const last=new Map();for(const r of items)last.set(r.responseId||context.responseId,r);for(const r of last.values()){found++;try{if(await this.add({...r,...context,responseId:r.responseId||context.responseId,timestamp:context.timestamp},'imported'))added++;}catch{skipped++;}}}
      }
    }else{
      const rows=document?(Array.isArray(document)?document:[document]):text.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{skipped++;return null;}}).filter(Boolean);
      for(const object of rows)await accept(object,{host:object.host||'',timestamp:object.timestamp});
    }
    return {added,found,skipped};
  }
}
module.exports={CaptureStore};
