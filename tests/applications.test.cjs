const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {parseZCodeUsage,readZCode}=require('../desktop/zcode.cjs');
const now=new Date(2026,9,24,12);
const base={id:'r',session_id:'s',model_id:'glm-5.3',started_at:now.getTime(),input_tokens:100,output_tokens:20,cache_read_input_tokens:70,cache_creation_input_tokens:10,computed_total_tokens:120};

test('ZCode: inclusive cache breakdown, legacy exclusive inputs, retries and reasoning preserve real totals',()=>{
  assert.deepEqual([parseZCodeUsage(base).input,parseZCodeUsage(base).total],[20,120]);
  const exclusive=parseZCodeUsage({...base,computed_total_tokens:200});assert.equal(exclusive.input,100);assert.equal(exclusive.total,200);
  assert.equal(parseZCodeUsage({...base,reasoning_tokens:15}).total,120);
  assert.equal(parseZCodeUsage({...base,computed_total_tokens:999}),null);
  assert.equal(parseZCodeUsage({...base,input_tokens:-1}),null);
  assert.notEqual(parseZCodeUsage({...base,id:'retry'}).id,parseZCodeUsage(base).id);
});

test('ZCode: real SQLite/WAL read selects usage columns only and never modifies source database',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-zcode-')),file=path.join(dir,'db.sqlite');
  const db=new DatabaseSync(file);
  try{
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE model_usage(id TEXT PRIMARY KEY,session_id TEXT,model_id TEXT,started_at INTEGER,input_tokens INTEGER,output_tokens INTEGER,cache_read_input_tokens INTEGER,cache_creation_input_tokens INTEGER,computed_total_tokens INTEGER,secret_conversation TEXT);');
    db.prepare('INSERT INTO model_usage VALUES(?,?,?,?,?,?,?,?,?,?)').run('r','s','glm-5.3',now.getTime(),100,20,70,10,120,'PRIVATE CHAT');
    const before=await fs.stat(file),result=readZCode(file);assert.equal(result.records.length,1);assert.equal(result.records[0].total,120);assert.equal(result.skipped,0);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);
    db.prepare('INSERT INTO model_usage VALUES(?,?,?,?,?,?,?,?,?,?)').run('r2','s','gpt-4.1',now.getTime(),10,5,0,0,15,'PRIVATE CHAT');
    assert.equal(readZCode(file).records.length,2);
  }finally{db.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('Application detection: unused catalog entries remain hidden, installed apps without usage stay unknown',async()=>{
  const {applicationUsage}=await import('../ui/applications.mjs');
  const sources=[{id:'codex',name:'Codex',detected:true},{id:'claude',name:'Claude',detected:false},{id:'zcode',name:'ZCode',detected:true}];
  const rows=[{source:'codex',model:'gpt-4.1',timestamp:now.toISOString(),total:100}];
  const apps=applicationUsage(sources,rows,now);assert.equal(apps.length,2);assert.equal(apps[0].id,'codex');assert.equal(apps[1].hasUsage,false);assert.equal(apps[0].today,100);
});

test('Application drilldown: today, 7/30 days and lifetime totals consistently partition by app, provider and model',async()=>{
  const {applicationUsage,scopedRecords,usageCounts}=await import('../ui/applications.mjs');
  const {dayOffset}=await import('../ui/analytics.mjs');
  const make=(source,model,offset,total)=>({source,model,timestamp:dayOffset(now,offset).toISOString(),total});
  const rows=[make('codex','gpt-4.1',0,10),make('zcode','glm-5.3',0,20),make('zcode','claude-sonnet-4',-6,30),make('zcode','glm-5.3',-29,40),make('zcode','glm-5.3',-30,50),make('zcode','glm-5.3',1,999)];
  const apps=applicationUsage([],rows,now),z=apps.find(a=>a.id==='zcode');assert.deepEqual([z.today,z.week,z.month,z.total],[20,50,90,140]);
  for(const [days,total] of [[1,20],[7,50],[30,90],[0,140]])assert.equal(scopedRecords(rows,{source:'zcode',days,now}).reduce((s,r)=>s+r.total,0),total);
  assert.equal(scopedRecords(rows,{source:'zcode',provider:'zhipu',days:30,now}).reduce((s,r)=>s+r.total,0),60);
  const counts=usageCounts(scopedRecords(rows,{days:30,now}));assert.deepEqual(counts,{models:3,applications:2,providers:3,requests:4});
});
