const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
async function main(){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 const {dayOffset}=await import('../ui/analytics.mjs');const now=new Date();
 const make=(id,source,model,offset,total)=>({id,session:id,source,model,timestamp:dayOffset(now,offset).toISOString(),input:total-10,output:10,cacheRead:0,cacheWrite:0,total});
 const data={updatedAt:now.toISOString(),sources:[{id:'codex',name:'Codex',detected:true,enabled:true,paths:[],files:3,records:3,total:600,errors:[],detail:'Fixture'},{id:'zcode',name:'ZCode',detected:true,enabled:true,paths:[],files:1,records:4,total:7500,errors:[],detail:'Fixture'},{id:'claude',name:'Claude Code',detected:false,enabled:true,paths:[],files:0,records:0,total:0,errors:[],detail:'Unused fixture'}],records:[make('c1','codex','gpt-fixture',0,100),make('c2','codex','gpt-fixture',-8,200),make('c3','codex','gpt-fixture',-40,300),make('z1','zcode','glm-5.3',0,1000),make('z2','zcode','claude-sonnet-4',-3,500),make('z3','zcode','glm-5.3',-10,2000),make('z4','zcode','glm-5.3',-45,4000)]};
 const root=path.resolve(__dirname,'../ui'),output=path.resolve(__dirname,'../.test-output');await fs.mkdir(output,{recursive:true});
 const server=http.createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!/^[\w.-]+$/.test(name))throw Error();res.setHeader('Content-Type',name.endsWith('.mjs')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,name)));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});const page=await browser.newPage({viewport:{width:1440,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(data=>{let settings={autoRefresh:true,enabled:{},paths:{}};window.tokenAtlas={scan:async()=>data,getSettings:async()=>settings,updateSettings:async next=>(settings=next),chooseFolder:async()=>null,captureStatus:async()=>({running:false,url:'http://127.0.0.1:46137'}),startCapture:async()=>({running:true,url:'http://127.0.0.1:46137'}),stopCapture:async()=>({running:false,url:'http://127.0.0.1:46137'}),importUsage:async()=>({found:1,added:1}),exportCSV:async filter=>{window.lastExportFilter=filter;return true;},openRelease:async()=>{window.releaseOpened=true;},checkUpdate:async()=>({currentVersion:'1.4.0',status:'error',error:'GitHub 拒绝访问（403）',progress:0})};},data);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.includes('条用量记录'));
  const stat=()=>page.locator('.stat-value').first().innerText();
  assert.equal(await page.locator('.application-card').count(),2);assert.equal(await page.locator('[data-application="claude"]').count(),0);assert.equal(await stat(),'1,600');
  assert.ok((await page.locator('[data-application="zcode"]').innerText()).includes('7,500'));
  await page.screenshot({path:path.join(output,'applications-overview.png'),fullPage:true});
  await page.locator('[data-application="zcode"]').click();assert.ok((await page.locator('#page-title').innerText()).includes('ZCode'));assert.equal(await stat(),'1,500');assert.equal(await page.locator('.provider-card').count(),2);
  await page.screenshot({path:path.join(output,'application-drilldown.png'),fullPage:true});
  await page.locator('[data-provider-card="zhipu"]').click();assert.equal(await page.locator('#model-table tr').count(),1);assert.ok((await page.locator('#model-table').innerText()).includes('1,000'));assert.ok(!(await page.locator('#model-table').innerText()).includes('claude'));
  await page.locator('[data-days="30"]').click();assert.ok((await page.locator('#model-table').innerText()).includes('3,000'));await page.locator('#export').click();assert.equal(await page.evaluate(()=>window.lastExportFilter.source),'zcode');assert.equal(await page.evaluate(()=>window.lastExportFilter.provider),'zhipu');
  await page.locator('#audit-open').click();assert.ok((await page.locator('#audit-scope').innerText()).includes('智谱 GLM'));
  const audit=await page.locator('#audit-detail').innerText();assert.ok(audit.includes('当前筛选：2 条记录 / 3,000 tokens'));assert.ok(audit.includes('累计可读记录：7,000 tokens'));await page.locator('#audit-close').click();
  await page.locator('#application-back').click();assert.equal(await stat(),'3,800');
  for(const [days,total] of [['1','1,100'],['7','1,600'],['30','3,800'],['0','8,100']]){await page.locator('[data-days="'+days+'"]').click();assert.equal(await stat(),total);}
  await page.locator('#provider-region [data-region="foreign"]').click();assert.equal(await page.locator('.provider-card').count(),2);assert.equal(await page.locator('[data-provider-card="zhipu"]').count(),0);await page.locator('#provider-region [data-region="all"]').click();
  await page.locator('[data-page="sources"]').click();assert.equal(await page.locator('.source-card').count(),2);
  await page.locator('#capture-toggle').click();assert.ok((await page.locator('#capture-state').innerText()).includes('采集中'));await page.locator('#capture-toggle').click();
  await page.locator('[data-page="overview"]').click();await page.locator('#updates-open').click();assert.ok((await page.locator('#updates-detail').innerText()).includes('403'));await page.locator('#updates-release').click();assert.equal(await page.evaluate(()=>window.releaseOpened),true);
  await page.evaluate(()=>{const s={currentVersion:'1.4.0',availableVersion:'1.5.0',notes:'Fixture',progress:0,error:'',canInstall:true};window.tokenAtlas.checkUpdate=async()=>({...s,status:'available'});window.tokenAtlas.downloadUpdate=async()=>({...s,status:'ready',progress:100});});
  await page.locator('#updates-check').click();assert.ok((await page.locator('#updates-message').innerText()).includes('1.5.0'));await page.locator('#updates-download').click();assert.equal(await page.locator('#updates-install').isEnabled(),true);await page.locator('#updates-close').click();
  await page.locator('#demo').click();assert.equal(await page.locator('#demo-banner').isVisible(),true);assert.equal(await page.locator('#export').isDisabled(),true);await page.locator('#exit-demo').click();
  await page.setViewportSize({width:960,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'applications-compact.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: detected apps only; today/7/30/lifetime exact totals; app > supplier > model drilldown; scoped CSV export; foreign providers; update error recovery and release link; 960px layout.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
