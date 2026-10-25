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
  async function clickAction(selector){await page.locator('#more-actions > summary').click();await page.locator(selector).click();assert.equal(await page.locator('#more-actions').getAttribute('open'),null);}
  const stat=()=>page.locator('.stat-value').first().innerText();
  const vendors=()=>page.locator('#provider-filter option').evaluateAll(options=>options.map(o=>o.value));
  assert.deepEqual(await vendors(),['','domestic','foreign','openai','anthropic','zhipu']);
  await page.locator('#provider-filter').selectOption('zhipu');assert.equal(await stat(),'1,000');
  await page.locator('#source-filter').selectOption('codex');assert.deepEqual(await vendors(),['','foreign','openai']);assert.equal(await page.locator('#provider-filter').inputValue(),'');assert.equal(await stat(),'100');
  await page.locator('#source-filter').selectOption('zcode');assert.deepEqual(await vendors(),['','domestic','foreign','anthropic','zhipu']);
  await page.locator('[data-days="1"]').click();assert.ok((await vendors()).includes('anthropic'));await page.locator('#provider-filter').selectOption('anthropic');assert.equal(await stat(),'0');
  await page.locator('[data-days="7"]').click();assert.equal(await page.locator('#provider-filter').inputValue(),'anthropic');assert.equal(await stat(),'500');
  await page.locator('#source-filter').selectOption('');await page.locator('#provider-filter').selectOption('');
  assert.equal(await page.locator('.application-card').count(),2);assert.equal(await page.locator('[data-application="claude"]').count(),0);assert.equal(await stat(),'1,600');
  assert.equal(await page.locator('[data-provider-card="openai"] h3').innerText(),'OpenAI');assert.ok((await page.locator('[data-provider-card="openai"]').innerText()).includes('来源：Codex'));
  assert.equal(await page.locator('#nav-back').isHidden(),true);
  async function hoverRing(angle){
    await page.locator('#donut').scrollIntoViewIfNeeded();const b=await page.locator('#donut').boundingBox(),r=b.width*77/200;
    await page.mouse.move(b.x+b.width/2+r*Math.cos(angle-Math.PI/2),b.y+b.height/2+r*Math.sin(angle-Math.PI/2));
  }
  let offset=0;
  for(const [model,total,share] of [['glm-5.3',1000,'62.5'],['claude-sonnet-4',500,'31.3'],['gpt-fixture',100,'6.3']]){
    await hoverRing((offset+total/2)/1600*2*Math.PI);const tip=await page.locator('#tooltip').innerText();
    assert.equal(await page.locator('#tooltip').isVisible(),true);assert.ok(tip.includes(model),tip);assert.ok(tip.includes(total.toLocaleString('zh-CN')+' tokens'));assert.ok(tip.includes('占比 '+share+'%'));assert.ok(tip.includes('缓存读取：0'));offset+=total;
  }
  await page.screenshot({path:path.join(output,'donut-hover.png')});
  const hole=await page.locator('#donut').boundingBox();await page.mouse.move(hole.x+hole.width/2,hole.y+hole.height/2);assert.equal(await page.locator('#tooltip').isHidden(),true);
  await page.locator('.donut-segment').first().focus();assert.equal(await page.locator('#tooltip').isVisible(),true);
  await page.locator('[data-application="codex"]').click();
  assert.equal(await page.locator('.donut-segment').count(),1);
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){await hoverRing(angle);assert.ok((await page.locator('#tooltip').innerText()).includes('100 tokens · 占比 100.0%'));}
  await page.locator('#nav-back').click();assert.equal(await stat(),'1,600');assert.equal(await page.locator('#nav-back').isDisabled(),true);
  assert.ok((await page.locator('[data-application="zcode"]').innerText()).includes('7,500'));
  await page.screenshot({path:path.join(output,'applications-overview.png'),fullPage:true});
  await page.locator('[data-application="zcode"]').click();assert.ok((await page.locator('#page-title').innerText()).includes('ZCode'));assert.equal(await stat(),'1,500');assert.equal(await page.locator('.provider-card').count(),2);
  await page.screenshot({path:path.join(output,'application-drilldown.png'),fullPage:true});
  await page.locator('[data-provider-card="zhipu"]').click();assert.equal(await page.locator('#model-table tr').count(),1);assert.ok((await page.locator('#model-table').innerText()).includes('1,000'));assert.ok(!(await page.locator('#model-table').innerText()).includes('claude'));
  await page.locator('[data-days="30"]').click();assert.ok((await page.locator('#model-table').innerText()).includes('3,000'));await clickAction('#export');assert.equal(await page.evaluate(()=>window.lastExportFilter.source),'zcode');assert.equal(await page.evaluate(()=>window.lastExportFilter.provider),'zhipu');
  await clickAction('#audit-open');assert.ok((await page.locator('#audit-scope').innerText()).includes('智谱 GLM'));
  const audit=await page.locator('#audit-detail').innerText();assert.ok(audit.includes('当前筛选：2 条记录 / 3,000 tokens'));assert.ok(audit.includes('累计可读记录：7,000 tokens'));await page.locator('#audit-close').click();
  await page.locator('#nav-back').click();assert.equal(await page.locator('#source-filter').inputValue(),'zcode');assert.equal(await page.locator('#provider-filter').inputValue(),'');assert.equal(await page.locator('#overview-page').isVisible(),true);assert.equal(await stat(),'3,500');
  await page.locator('#nav-back').click();assert.equal(await stat(),'3,800');assert.equal(await page.locator('#nav-back').isDisabled(),true);
  for(const [days,total] of [['1','1,100'],['7','1,600'],['30','3,800'],['0','8,100']]){await page.locator('[data-days="'+days+'"]').click();assert.equal(await stat(),total);}
  await page.locator('#provider-region [data-region="foreign"]').click();assert.equal(await page.locator('.provider-card').count(),2);assert.equal(await page.locator('[data-provider-card="zhipu"]').count(),0);await page.locator('#provider-region [data-region="all"]').click();
  await page.locator('[data-page="sources"]').click();assert.equal(await page.locator('.source-card').count(),2);
  await page.locator('#capture-toggle').click();assert.ok((await page.locator('#capture-state').innerText()).includes('采集中'));await page.locator('#capture-toggle').click();
  await page.locator('#nav-back').click();assert.equal(await page.locator('#overview-page').isVisible(),true);await page.locator('#updates-open').click();assert.ok((await page.locator('#updates-detail').innerText()).includes('403'));await page.locator('#updates-release').click();assert.equal(await page.evaluate(()=>window.releaseOpened),true);
  await page.evaluate(()=>{const s={currentVersion:'1.4.0',availableVersion:'1.5.0',notes:'Fixture',progress:0,error:'',canInstall:true};window.tokenAtlas.checkUpdate=async options=>{window.lastUpdateCheck=options;return {...s,status:'available'};};window.tokenAtlas.downloadUpdate=async()=>({...s,status:'downloading',progress:25,downloadedBytes:25*1024*1024,totalBytes:100*1024*1024,bytesPerSecond:5*1024*1024,remainingSeconds:15,downloadMode:'parallel'});});
  await page.locator('#updates-check').click();assert.ok((await page.locator('#updates-message').innerText()).includes('1.5.0'));assert.equal(await page.evaluate(()=>window.lastUpdateCheck.force),true);await page.locator('#updates-download').click();assert.ok((await page.locator('#updates-detail').innerText()).includes('5.0 MB/s'));assert.ok((await page.locator('#updates-detail').innerText()).includes('15 秒'));await page.locator('#updates-close').click();
  await page.evaluate(()=>{window.tokenAtlas.checkUpdate=async()=>({currentVersion:'1.4.0',status:'ready',progress:100,canInstall:true,downloadMode:'cached'});});await page.locator('#updates-open').click();assert.equal(await page.locator('#updates-install').isEnabled(),true);assert.ok((await page.locator('#updates-detail').innerText()).includes('复用'));await page.locator('#updates-close').click();
  await clickAction('#demo');assert.equal(await page.locator('#demo-banner').isVisible(),true);assert.equal(await page.locator('#export').isDisabled(),true);await page.locator('#exit-demo').click();
  await page.setViewportSize({width:960,height:680});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>{document.querySelector('#toast').hidden=true;scrollTo(0,0);});await page.screenshot({path:path.join(output,'applications-compact.png')});
  await page.locator('#updates-open').click();assert.equal(await page.locator('#updates-close').isVisible(),true);assert.equal(await page.locator('#updates-check').isVisible(),true);await page.locator('#updates-close').click();
  await clickAction('#audit-open');assert.equal(await page.locator('#audit-close').isVisible(),true);assert.equal(await page.locator('#audit-export').isVisible(),true);await page.locator('#audit-close').click();
  assert.equal(await page.locator('.activity-panel').getAttribute('open'),null);await page.locator('.activity-panel > summary').click();
  await page.locator('[data-mode="weekly"]').click();assert.equal(await page.locator('[data-mode="weekly"]').getAttribute('class'),'selected');assert.equal(await page.locator('#heatmap').isVisible(),true);await page.locator('.activity-panel > summary').click();
  await page.locator('.usage-details > summary').click();assert.equal(await page.locator('#usage-summary').isVisible(),true);await page.locator('.usage-details > summary').click();
  await page.locator('#more-actions > summary').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#more-actions').getAttribute('open'),null);assert.equal(await page.locator('#more-actions > summary').evaluate(e=>e===document.activeElement),true);
  const reviewData={...data,records:[{...make('model','codex','gpt-6.1-sol',0,1000),input:90,cacheRead:900},make('review','codex','codex-auto-review',0,100)]};
  await page.evaluate(data=>{window.tokenAtlas.scan=async()=>data;},reviewData);await page.locator('#refresh').click();
  assert.equal(await stat(),'1,100');assert.equal(await page.locator('.stat-value').nth(1).innerText(),'1个');
  await page.locator('.usage-details > summary').click();
  assert.ok((await page.locator('#usage-summary').innerText()).includes('缓存读取 900 tokens'));assert.ok((await page.locator('#usage-summary').innerText()).includes('系统审核 100 tokens'));
  await page.locator('.usage-details > summary').click();
  assert.ok((await page.locator('#chart-legend').innerText()).includes('自动审核（系统记录）'));assert.ok(!(await page.locator('#chart-legend').innerText()).includes('codex-auto-review'));
  await page.locator('[data-page="models"]').click();assert.equal(await page.locator('#model-table tr').count(),1);
  const modelText=await page.locator('#model-table').innerText();assert.ok(modelText.includes('gpt-6.1-sol'));assert.ok(modelText.includes('供应商：OpenAI · 来源应用：Codex'));assert.ok(!modelText.includes('codex-auto-review'));
  assert.equal(await page.locator('#system-usage-section').isVisible(),true);assert.equal(await page.locator('#system-usage-table tr').count(),1);assert.ok((await page.locator('#system-usage-table').innerText()).includes('实际模型未披露'));await page.evaluate(()=>document.querySelector('#toast').hidden=true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'model-system-separation.png'),fullPage:true});
  await clickAction('#audit-open');assert.ok((await page.locator('#audit-detail').innerText()).includes('其中系统审核：1 条 / 100 tokens'));await page.locator('#audit-close').click();await page.locator('#nav-back').click();
  const buddyData={...data,sources:[{...data.sources[0],id:'workbuddy',name:'WorkBuddy',records:2,total:1500}],records:[make('wb-hy','workbuddy','hy3',0,1000),make('wb-glm','workbuddy','glm-5.3',0,500)]};
  await page.evaluate(data=>{window.tokenAtlas.scan=async()=>data;},buddyData);await page.locator('#refresh').click();
  assert.deepEqual(await vendors(),['','domestic','zhipu','hunyuan']);
  assert.equal(await page.locator('.application-card').count(),1);assert.equal(await stat(),'1,500');assert.equal(await page.locator('#source-add-type option[value="workbuddy"]').count(),1);
  await page.locator('[data-application="workbuddy"]').click();assert.equal(await page.locator('#page-title').innerText(),'WorkBuddy 用量');
  await page.locator('[data-provider-card="hunyuan"]').click();assert.equal(await page.locator('#model-table tr').count(),1);assert.ok((await page.locator('#model-table').innerText()).includes('hy3'));assert.ok((await page.locator('#model-table').innerText()).includes('来源应用：WorkBuddy'));
  await page.locator('#nav-back').click();await page.locator('#nav-back').click();assert.equal(await page.locator('#nav-back').isHidden(),true);
  const curveValues=[5800,2200,1200,1700,4100,2500,8000];
  const curveData={...data,records:curveValues.map((total,i)=>make('curve-'+i,'codex','gpt-fixture',i-6,total))};
  await page.evaluate(data=>{window.tokenAtlas.scan=async()=>data;},curveData);await page.locator('#refresh').click();await page.locator('[data-days="7"]').click();await page.setViewportSize({width:1440,height:1000});
  const checkGeometry=(path,values)=>{
    const d=path.getAttribute('d'),max=Math.max(...values)*1.13,y=v=>217-v/max*204;
    let bounded=true,forward=true,previousX=-Infinity;
    for(let i=0;i<=600;i++){
      const p=path.getPointAtLength(path.getTotalLength()*i/600),segment=Math.max(0,Math.min(values.length-2,Math.floor((p.x-58)/1128*(values.length-1))));
      const low=Math.min(y(values[segment]),y(values[segment+1])),high=Math.max(y(values[segment]),y(values[segment+1]));
      if(p.y<low-.001||p.y>high+.001)bounded=false;if(p.x<previousX-.001)forward=false;previousX=p.x;
    }
    const endpoints=d.split(/\s*C/).map(s=>s.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number).slice(-2));
    return {cubic:d.includes(' C'),finite:!/(NaN|Infinity)/.test(d),bounded,forward,faithful:endpoints.every(([x,yy],i)=>Math.abs(x-(58+i*1128/(values.length-1)))<.001&&Math.abs(yy-y(values[i]))<.001)};
  };
  const geometry=await page.locator('.trend-series').evaluate(checkGeometry,curveValues);
  assert.deepEqual(geometry,{cubic:true,finite:true,bounded:true,forward:true,faithful:true});
  await page.locator('#trend-chart [data-tooltip]').last().hover();assert.ok((await page.locator('#tooltip').innerText()).includes('gpt-fixture：8,000'));
  await page.mouse.move(1,1);await page.locator('.trend-panel').screenshot({path:path.join(output,'smooth-trend.png')});
  const zeroValues=[0,100,0,0,0,100,20],zeroData={...data,records:zeroValues.map((total,i)=>make('zero-'+i,'codex','gpt-fixture',i-6,total)).filter(r=>r.total>0)};
  await page.evaluate(data=>{window.tokenAtlas.scan=async()=>data;},zeroData);await page.locator('#refresh').click();
  assert.deepEqual(await page.locator('.trend-series').evaluate(checkGeometry,zeroValues),{cubic:true,finite:true,bounded:true,forward:true,faithful:true});
  await page.locator('[data-days="1"]').click();assert.equal(await page.locator('#trend-chart circle').count(),1);assert.ok(!(await page.locator('.trend-series').getAttribute('d')).includes(' C'));
  for(const viewport of [{width:960,height:680},{width:390,height:844}]){await page.setViewportSize(viewport);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#more-actions > summary').click();assert.equal(await page.locator('#audit-open').isVisible(),true);await page.keyboard.press('Escape');}
  const unknownData={...data,records:[make('unknown','codex','private-model',0,100),{...make('hint','codex','未知模型',0,200),providerHint:'google'}]};
  await page.evaluate(data=>{window.tokenAtlas.scan=async()=>data;},unknownData);await page.locator('#refresh').click();assert.deepEqual(await vendors(),['','foreign','google','unknown']);
  await page.locator('#provider-filter').selectOption('unknown');assert.equal(await stat(),'100');
  await page.evaluate(()=>{window.tokenAtlas.scan=async()=>({records:[],sources:[],updatedAt:new Date().toISOString()});});await page.locator('#refresh').click();assert.equal(await page.locator('.donut-segment').count(),0);assert.equal(await page.locator('#tooltip').isHidden(),true);
  assert.deepEqual(await vendors(),['']);assert.equal(await page.locator('#provider-filter').inputValue(),'');assert.equal(await stat(),'0');assert.equal(await page.locator('#nav-back').isHidden(),true);
  assert.equal(await page.locator('#system-usage-section').isHidden(),true);assert.equal(await page.locator('#system-usage-table tr').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: only observed providers appear; application/refresh changes clear unavailable suppliers; date changes retain historical suppliers; origin hints/unknown/empty records; smooth trend; back navigation; donut hover; scoped totals; export and audit; updates; compact layout.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
