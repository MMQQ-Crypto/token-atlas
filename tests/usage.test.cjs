const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createCodexParser,parseClaude,parseCline,deduplicate}=require('../desktop/parsers.cjs');
const {Scanner}=require('../desktop/scanner.cjs');
const time='2026-10-23T08:00:00.000Z';
function token(input,output,cached=0){return{type:'event_msg',timestamp:time,payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,output_tokens:output,cached_input_tokens:cached}}}};}
test('Codex cumulative usage: exclude duplicate snapshots, cache and reasoning are not double counted',()=>{
  const parse=createCodexParser('test');
  parse({type:'session_meta',payload:{id:'session'}});
  parse({type:'turn_context',payload:{model:'gpt-test'}});
  const a=parse(token(100,20,60));
  assert.deepEqual([a.input,a.output,a.cacheRead,a.total,a.model],[40,20,60,120,'gpt-test']);
  assert.equal(parse(token(100,20,60)),null);
  const b=parse(token(250,50,160));
  assert.deepEqual([b.input,b.output,b.cacheRead,b.total],[50,30,100,180]);
  assert.equal(a.total+b.total,300);
});
test('Codex cumulative counter reset and model switch',()=>{
  const parse=createCodexParser('test');
  parse(token(1000,100,500));
  parse({type:'turn_context',payload:{model:'second-model'}});
  const a=parse(token(100,10,50));
  assert.equal(a.total,110);assert.equal(a.model,'second-model');
});
test('Claude: streaming duplicate message keeps largest usage and accounts for all cache categories',()=>{
  const row={type:'assistant',timestamp:time,requestId:'req',sessionId:'s',message:{id:'msg',model:'claude-test',usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:80,cache_creation_input_tokens:20}}};
  const a=parseClaude(row,'f',0);row.message.usage.output_tokens=15;
  const b=parseClaude(row,'f',1);
  const result=deduplicate([a,b,b]);assert.equal(result.length,1);assert.equal(result[0].total,125);
  assert.equal(parseClaude({type:'user'},'f',0),null);
});
test('Cline-compatible API entries: ignore incomplete requests, retain usage and model uncertainty',()=>{
  const rows=parseCline([{say:'api_req_started',ts:Date.parse(time),text:JSON.stringify({tokensIn:100,tokensOut:30,cacheReads:50,cacheWrites:20})},{say:'api_req_started',ts:Date.parse(time)+1,text:'{}'},{say:'text',text:'hello'}],'f','cline');
  assert.equal(rows.length,1);assert.equal(rows[0].total,200);assert.equal(rows[0].model,'未知模型');
});
test('Scanner: re-read appended records, recover from partial JSONL, cache safely and respect disabled sources',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'token-atlas-test-'));
  try {
    const file=path.join(dir,'session.jsonl');
    await fs.writeFile(file,JSON.stringify(token(100,10))+'\n'+ '{"partial":');
    const scanner=new Scanner(),settings={paths:{codex:dir},enabled:{deepseek_desktop:false,claude:false,cline:false,roo:false,kilo:false}};
    const a=await scanner.scan(settings);assert.equal(a.records.length,1);assert.equal(a.sources.find(s=>s.id==='codex').errors.length,1);
    await fs.writeFile(file,JSON.stringify(token(100,10))+'\n'+JSON.stringify(token(200,30))+'\n');
    const b=await scanner.scan(settings);assert.equal(b.records.length,2);assert.equal(b.records.reduce((s,r)=>s+r.total,0),230);
    assert.equal(b.sources.find(s=>s.id==='codex').errors.length,0);
    const c=await scanner.scan({...settings,enabled:{...settings.enabled,codex:false}});assert.equal(c.records.length,0);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('Local calendar filters include full first day and exclude future records; aggregation tracks streaks',async()=>{
  const {selectRecords,aggregate,dayKey,dayOffset}=await import('../ui/analytics.mjs');
  const now=new Date(2026,9,24,12),make=(offset,total=10)=>({id:String(offset),source:'codex',session:'s',model:'test',timestamp:dayOffset(now,offset).toISOString(),input:total,output:0,cacheRead:0,cacheWrite:0,total});
  const rows=[make(-7),make(-6),make(-1),make(0),make(1)];
  const selected=selectRecords(rows,'codex',7,now);assert.equal(selected.length,3);
  const summary=aggregate(selected);assert.equal(summary.longest,2);assert.equal(summary.totals.total,30);assert.equal(summary.sessions,1);
  assert.equal(dayKey(dayOffset(now,-1)),'2026-10-23');
});
test('Domestic model classification recognises routed model names and leaves opaque IDs unassigned',async()=>{
  const {providerFor}=await import('../ui/providers.mjs');
  const examples=[['deepseek-v4-flash','deepseek'],['deepseek-ai/DeepSeek-V3','deepseek'],['Qwen/Qwen3.8-Flash','qwen'],['qwen3-coder','qwen'],['qwq-32b','qwen'],['ZHIPU/GLM-5.3-FlashX','zhipu'],['THUDM/chatglm3-6b','zhipu'],['moonshot-v1-128k','moonshot'],['kimi-k2','moonshot'],['doubao-seed-1.6','doubao'],['bytedance/seed-1.6','doubao'],['ernie-4.5','ernie'],['MiniMax-M2','minimax'],['hunyuan-turbo','hunyuan'],['spark-max','spark'],['step-3','stepfun'],['baichuan2-13b','baichuan'],['yi-lightning','yi'],['openrouter/anthropic/claude-sonnet-4','anthropic'],['gpt-6.1-sol','openai'],['gemini-2.5-pro','google'],['ep-202610241234-test','unknown'],['my-custom-model','unknown'],['sparkles-test','unknown'],['seedling','unknown'],['','unknown']];
  for(const [model,expected] of examples)assert.equal(providerFor(model),expected,model);
});
test('Domestic filtering and totals use only supplied real records, without creating usage for unsupported clients',async()=>{
  const {providerUsage,matchesProvider}=await import('../ui/providers.mjs');
  const rows=[{model:'deepseek-chat',total:130,source:'cline'},{model:'deepseek-reasoner',total:210,source:'roo'},{model:'qwen3-coder',total:80,source:'kilo'},{model:'gpt-6.1-sol',total:500,source:'codex'},{model:'ep-custom',total:100,source:'cline'}];
  const domestic=rows.filter(r=>matchesProvider(r,'domestic'));
  assert.equal(domestic.length,3);assert.equal(domestic.reduce((s,r)=>s+r.total,0),420);
  assert.equal(rows.filter(r=>matchesProvider(r,'deepseek')).reduce((s,r)=>s+r.total,0),340);
  assert.equal(rows.filter(r=>matchesProvider(r,'unknown')).length,1);
  const totals=providerUsage(rows);assert.equal(totals.length,12);
  assert.equal(totals.find(p=>p.id==='deepseek').count,2);
  assert.equal(totals.find(p=>p.id==='moonshot').count,0);
  assert.equal(rows.length,5);
});
