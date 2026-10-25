const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {parseWorkBuddy,normalizeBuddyUsage}=require('../desktop/workbuddy.cjs');
const {deduplicate}=require('../desktop/parsers.cjs');
const {Scanner}=require('../desktop/scanner.cjs');
const timestamp=new Date(2026,9,25,12).getTime();
const row=(id,type='model-usage',extra={})=>({id:'entry-'+id,sessionId:'session-1',timestamp,type,...(type==='message'?{role:'assistant'}:{}),content:'PRIVATE CHAT',providerData:{messageId:id,model:'hy3',requestModelId:'auto',usage:{inputTokens:1000,outputTokens:50,totalTokens:1050,inputTokensDetails:[{cached_tokens:900}],outputTokensDetails:[{reasoning_tokens:20}]},...extra}});

test('WorkBuddy: raw and normalized server usage split cache once, preserve reasoning totals and actual model',()=>{
  const r=parseWorkBuddy(row('r'),'session.jsonl',0);assert.equal(r.model,'hy3');assert.equal(r.source,'workbuddy');
  assert.deepEqual([r.input,r.output,r.cacheRead,r.cacheWrite,r.total],[100,50,900,0,1050]);
  const raw=parseWorkBuddy(row('r','function_call',{rawUsage:{prompt_tokens:1000,completion_tokens:50,total_tokens:1050,prompt_cache_hit_tokens:0,prompt_tokens_details:{cached_tokens:900}}}),'session.jsonl',1);
  assert.deepEqual([raw.input,raw.cacheRead,raw.total],[100,900,1050]);
  assert.deepEqual(normalizeBuddyUsage({input_tokens:100,output_tokens:20,cache_read_input_tokens:50,cache_creation_input_tokens:10,total_tokens:180}),{input:100,output:20,cacheRead:50,cacheWrite:10,total:180});
  assert.deepEqual(normalizeBuddyUsage({inputTokens:100,outputTokens:20,totalTokens:120,inputTokensDetails:[{cached_tokens:30},{cached_tokens:20}],cacheCreationInputTokens:10}),{input:40,output:20,cacheRead:50,cacheWrite:10,total:120});
  assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});

test('WorkBuddy: final settlements override duplicate tool records and copied/inherited history without merging new calls',()=>{
  const tool=parseWorkBuddy(row('same','function_call'),'one.jsonl',1);
  const final=parseWorkBuddy({...row('same'),timestamp:timestamp+1000,providerData:{...row('same').providerData,usage:{inputTokens:900,outputTokens:50,totalTokens:950}}},'one.jsonl',2);
  const copy=parseWorkBuddy(row('same','message'),'copy.jsonl',0);
  const next=parseWorkBuddy(row('different','function_call',{conversationRequestId:'same-turn'}),'child.jsonl',3);
  const result=deduplicate([final,tool,copy,next]);assert.equal(result.length,2);assert.equal(result.find(r=>r.id===final.id).total,950);
  assert.equal(result.reduce((sum,r)=>sum+r.total,0),2000);
  assert.equal(deduplicate([parseWorkBuddy(row('legacy','function_call',{messageId:undefined}),'a.jsonl',0),parseWorkBuddy(row('legacy','function_call',{messageId:undefined}),'copy.jsonl',50)]).length,1);
});

test('WorkBuddy: estimates, context watermarks, credit-only records and inconsistent counters never become tokens',()=>{
  assert.equal(parseWorkBuddy(null,'s.jsonl',0),null);assert.equal(normalizeBuddyUsage('invalid'),null);
  assert.equal(parseWorkBuddy({type:'credit-usage',timestamp,providerData:{credit:1.2}},'s.jsonl',0),null);
  assert.equal(parseWorkBuddy({...row('context'),type:'summary'},'s.jsonl',0),null);
  assert.equal(parseWorkBuddy({...row('estimate'),estimated:true},'s.jsonl',0),null);
  assert.equal(normalizeBuddyUsage({inputTokens:100,outputTokens:20,totalTokens:999}),null);
  assert.equal(normalizeBuddyUsage({inputTokens:100,outputTokens:20,inputTokensDetails:[{cached_tokens:101}]}),null);
  const diagnostics={usageRows:0,acceptedRows:0,skippedRows:0};
  assert.equal(parseWorkBuddy(row('bad','model-usage',{rawUsage:{prompt_tokens:100,completion_tokens:20,total_tokens:999}}),'s.jsonl',0,diagnostics),null);
  assert.deepEqual(diagnostics,{usageRows:1,acceptedRows:0,skippedRows:1});
});

test('WorkBuddy: copied remote projects scan read-only, skip tool output, classify Hy3 and support scoped reconciliation',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-workbuddy-'));
  try{
    const project=path.join(directory,'projects','workspace'),tools=path.join(project,'tool-results');await fs.mkdir(tools,{recursive:true});
    const bytes=[row('hy','function_call'),row('hy'),row('other','model-usage',{model:'glm-5.3'})].map(r=>JSON.stringify(r)).join('\n');
    const file=path.join(project,'s.jsonl');await fs.writeFile(file,bytes);await fs.writeFile(path.join(project,'copied.jsonl'),bytes);await fs.writeFile(path.join(tools,'generated.jsonl'),JSON.stringify(row('must-ignore')));
    await fs.writeFile(path.join(directory,'models.json'),'PRIVATE API KEY');const before=await fs.stat(file);
    const result=await new Scanner().scan({paths:{workbuddy:directory},enabled:{deepseek_desktop:false,codex:false,zcode:false,claude:false,cline:false,roo:false,kilo:false}});
    assert.equal(result.records.length,2);assert.equal(result.sources.find(s=>s.id==='workbuddy').files,2);assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);
    const {providerFor}=await import('../ui/providers.mjs'),{applicationUsage,scopedRecords}=await import('../ui/applications.mjs');
    assert.equal(providerFor('Hy3'),'hunyuan');assert.equal(providerFor('tencent/hy3-preview'),'hunyuan');assert.equal(providerFor('hybrid-model'),'unknown');
    assert.equal(scopedRecords(result.records,{source:'workbuddy',provider:'hunyuan',days:1,now:new Date(timestamp)}).reduce((sum,r)=>sum+r.total,0),1050);
    assert.equal(applicationUsage(result.sources,result.records,new Date(timestamp)).find(a=>a.id==='workbuddy').today,2100);
    const {reconcileUsage,reconciliationText}=await import('../ui/reconciliation.mjs');const report=reconcileUsage(result,{source:'workbuddy',days:1,now:new Date(timestamp)});
    assert.ok(reconciliationText(report).includes('原始用量行'));assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
