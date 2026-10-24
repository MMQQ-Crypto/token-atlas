const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const zlib=require('node:zlib');
const {createDeepSeekParser}=require('../desktop/parsers.cjs');
const {Scanner}=require('../desktop/scanner.cjs');
const {normalize,extract,streamParser}=require('../extension/usage.js');
const {CaptureStore}=require('../desktop/capture-store.cjs');
const {CaptureServer}=require('../desktop/capture-server.cjs');
const timestamp='2026-10-24T01:00:00.000Z';
const usage={inputTokens:10,outputTokens:20,cacheReadTokens:70,cacheWriteTokens:0,totalTokens:100};
const event=(type='assistant/message',u=usage)=>({type,time:Date.parse(timestamp),seq:3,data:{turn:1,step:1,message:{id:'message-1',source:{model:'deepseek-flash'}},usage:u}});
test('DeepSeek desktop settlement: four buckets, lower corrections replace previous attempt, retries add independently',()=>{
  const parse=createDeepSeekParser('file');parse({type:'session',id:'session'});
  const first=parse(event());assert.equal(first.total,100);
  assert.equal(parse(event('assistant/message',{...usage,inputTokens:5,totalTokens:95})),null);
  assert.equal(first.total,95);
  parse({type:'llm/retry-started',data:{turn:1,step:1}});
  const next=event();next.data.message.id='message-2';assert.equal(parse(next).total,100);
  assert.equal(parse({type:'context/estimate',data:{usage}}),null);
});
test('DeepSeek incomplete attempts can read final provider usage chunk without counting surface estimates',()=>{
  const parse=createDeepSeekParser('file');const e=event('assistant/attempt');delete e.data.usage;e.data.stream=[{chunk:{type:'usage',usage}}];
  assert.equal(parse(e).total,100);
});
test('Zstandard DeepSeek logs: stream parsing, corrupt-file error reporting, no content in records',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-dsh-'));
  try{
    const original=[{type:'session',id:'s'},event()];original[1].data.message.content='PRIVATE PROMPT';
    await fs.writeFile(path.join(dir,'session.v4.jsonl.zstd'),zlib.zstdCompressSync(Buffer.from(original.map(JSON.stringify).join('\n')+'\n')));
    const settings={paths:{deepseek_desktop:dir},enabled:{codex:false,claude:false,cline:false,roo:false,kilo:false}};
    const scanner=new Scanner(),a=await scanner.scan(settings);assert.equal(a.records.length,1);assert.equal(a.records[0].total,100);assert.ok(!JSON.stringify(a.records).includes('PRIVATE'));
    await fs.writeFile(path.join(dir,'session.v3.jsonl.zstd'),Buffer.from('corrupt'));
    const b=await scanner.scan(settings);assert.equal(b.records.length,1);assert.equal(b.sources[0].errors.length,1);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Response usage: caches and reasoning do not inflate totals; ambiguous, estimated, context-only data ignored',()=>{
  assert.deepEqual(normalize({prompt_tokens:100,completion_tokens:20,prompt_cache_hit_tokens:70,total_tokens:120,completion_tokens_details:{reasoning_tokens:10}}),{input:30,output:20,cacheRead:70,cacheWrite:0,total:120});
  assert.equal(normalize({prompt_tokens:100,completion_tokens:20,total_tokens:999}),null);
  assert.equal(normalize({input_tokens:20,output_tokens:3,estimated:true}),null);
  assert.equal(normalize({context_tokens:1024}),null);
  assert.equal(normalize({prompt_tokens:null,completion_tokens:20}),null);
  assert.equal(normalize({prompt_tokens:1,completion_tokens:20,prompt_cache_hit_tokens:70}),null);
  assert.equal(normalize({input_tokens:10,output_tokens:20,cache_read_input_tokens:70,cache_creation_input_tokens:5}).total,105);
  assert.equal(extract({data:{response:{id:'r',model:'glm-4',usage:{prompt_tokens:100,completion_tokens:20}}}})[0].model,'glm-4');
});
test('Streaming response parser handles split SSE and ignores DONE and text-only chunks',()=>{
  const records=[],parser=streamParser(r=>records.push(r));
  const data='data: {"id":"r","choices":[{"delta":{"content":"PRIVATE"}}]}\r\n\r\ndata: {"id":"r","model":"deepseek-chat","usage":{"prompt_tokens":100,"completion_tokens":20}}\r\n\r\ndata: [DONE]\r\n\r\n';
  for(let i=0;i<data.length;i+=7)parser.push(data.slice(i,i+7));parser.end();
  assert.equal(records.length,1);assert.equal(records[0].total,120);assert.ok(!JSON.stringify(records).includes('PRIVATE'));
});
test('Capture persistence: concurrent duplicates, restart, no chat or auth storage, stable official origin hint',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-store-'));
  try{
    const store=new CaptureStore(dir);await store.load();
    const r={responseId:'r',host:'www.doubao.com',timestamp,input:30,output:20,cacheRead:70,cacheWrite:0,total:120,content:'PRIVATE',authorization:'SECRET'};
    const results=await Promise.all([store.add(r),store.add(r)]);assert.equal(results.filter(Boolean).length,1);
    assert.equal(store.list()[0].providerHint,'doubao');
    const text=await fs.readFile(store.file,'utf8');assert.ok(!text.includes('PRIVATE'));assert.ok(!text.includes('SECRET'));
    const reloaded=new CaptureStore(dir);await reloaded.load();assert.equal(reloaded.list().length,1);
    await assert.rejects(()=>store.add({...r,host:'evil.example'}));
    await assert.rejects(()=>store.add({...r,total:300}));
    await assert.rejects(()=>store.add({...r,timestamp:null}));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('HAR/JSONL import: exact-only, missing dates skipped, repeated HAR does not double count',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-import-'));
  try{
    const store=new CaptureStore(dir),file=path.join(dir,'capture.har');
    const body={id:'response-1',model:'deepseek-chat',usage:{prompt_tokens:100,completion_tokens:20,prompt_cache_hit_tokens:50,total_tokens:120}};
    const har={log:{entries:[{startedDateTime:timestamp,request:{url:'https://chat.deepseek.com/api/test',headers:[{name:'Authorization',value:'SECRET'}]},response:{content:{text:JSON.stringify(body)}}}]}};
    await fs.writeFile(file,JSON.stringify(har));assert.equal((await store.importFile(file)).added,1);assert.equal((await store.importFile(file)).added,0);
    const jsonl=path.join(dir,'usage.jsonl');await fs.writeFile(jsonl,JSON.stringify({...body,id:'response-2'})+'\n'+JSON.stringify({model:'glm-4',timestamp,usage:{context_tokens:20}}));
    const r=await store.importFile(jsonl);assert.equal(r.added,0);assert.equal(r.skipped,1);
    assert.ok(!(await fs.readFile(store.file,'utf8')).includes('SECRET'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Local capture bridge: auth required, hostile website blocked, valid usage persisted, no key exposure in health',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-bridge-')),store=new CaptureStore(dir),server=new CaptureServer(store);
  try{
    const s=await server.start(0),headers={Authorization:'Bearer '+s.key,'Content-Type':'application/json'};
    assert.equal((await fetch(s.url+'/health')).status,401);
    assert.equal((await fetch(s.url+'/health',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(s.url+'/health',{headers})).status,200);
    const body={responseId:'r',host:'chat.deepseek.com',model:'deepseek-chat',timestamp,input:30,output:20,cacheRead:70,cacheWrite:0,total:120};
    assert.equal((await fetch(s.url+'/usage',{method:'POST',headers,body:JSON.stringify(body)})).status,200);
    assert.equal(store.list().length,1);
    assert.equal((await fetch(s.url+'/usage',{method:'POST',headers,body:JSON.stringify({...body,total:121})})).status,400);
    const health=await (await fetch(s.url+'/health',{headers})).text();assert.ok(!health.includes(s.key));
  }finally{await server.stop();await fs.rm(dir,{recursive:true,force:true});}
});
