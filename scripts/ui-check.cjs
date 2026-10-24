const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {Scanner}=require('../desktop/scanner.cjs');
async function main(){
  const playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const data=await new Scanner().scan();
  const root=path.resolve(__dirname,'../ui');
  const server=http.createServer(async(req,res)=>{
    try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!/^[\w.-]+$/.test(name))throw Error();const file=path.join(root,name);res.setHeader('Content-Type',name.endsWith('.mjs')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));}
    catch{res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await playwright.chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
    const page=await browser.newPage({viewport:{width:1440,height:1180},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(data=>{let settings={autoRefresh:true,enabled:{},paths:{}};window.tokenAtlas={scan:async()=>data,getSettings:async()=>settings,updateSettings:async next=>(settings=next),chooseFolder:async()=>null,resetFolder:async()=>settings,captureStatus:async()=>({running:false,url:'http://127.0.0.1:46137'}),startCapture:async()=>({running:true,url:'http://127.0.0.1:46137'}),stopCapture:async()=>({running:false,url:'http://127.0.0.1:46137'}),importUsage:async()=>({found:2,added:1,skipped:0}),exportCSV:async filter=>{window.lastExportFilter=filter;return true;}};},data);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.includes('条用量记录'));
    assert.equal(await page.locator('.stat').count(),5);
    await page.evaluate(()=>{const state={currentVersion:'1.3.0',availableVersion:'1.4.0',notes:'Fixture update notes',progress:0,error:'',canInstall:true};window.tokenAtlas.checkUpdate=async()=>({...state,status:'available'});window.tokenAtlas.downloadUpdate=async()=>({...state,status:'ready',progress:100});});
    await page.locator('#updates-open').click();assert.ok((await page.locator('#updates-message').innerText()).includes('1.4.0'));
    await page.locator('#updates-download').click();assert.ok((await page.locator('#updates-message').innerText()).includes('校验已通过'));
    assert.equal(await page.locator('#updates-install').isEnabled(),true);await page.locator('#updates-close').click();
    await fs.mkdir(path.resolve(__dirname,'../.test-output'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../.test-output/overview.png'),fullPage:true});
    await page.locator('[data-days="30"]').click();
    const paths=await page.locator('#trend-chart polyline').count();assert.ok(paths>0);
    const first=page.locator('#chart-legend button').first();await first.click();
    assert.equal(await page.locator('#trend-chart polyline').count(),paths-1);await first.click();
    await page.locator('[data-mode="weekly"]').click();assert.equal(await page.locator('[data-mode="weekly"]').getAttribute('class'),'selected');
    await page.locator('[data-mode="cumulative"]').click();
    await page.locator('[data-page="models"]').click();assert.ok(await page.locator('#model-table tr').count()>0);
    await page.locator('[data-page="sources"]').click();assert.equal(await page.locator('.source-card').count(),data.sources.length);
    assert.equal(await page.locator('.domestic-card').count(),12);
    assert.equal(await page.locator('.capture-evidence').count(),12);
    await page.locator('.domestic-panel').screenshot({path:path.resolve(__dirname,'../.test-output/domestic-platforms.png')});
    await page.locator('#capture-toggle').click();assert.ok((await page.locator('#capture-state').innerText()).includes('采集中'));
    await page.locator('#capture-toggle').click();assert.ok((await page.locator('#capture-state').innerText()).includes('未启动'));
    await page.locator('#capture-import').click();assert.ok((await page.locator('#toast').innerText()).includes('已新增 1 条'));
    await page.locator('#auto-refresh').uncheck();assert.equal(await page.locator('#auto-refresh').isChecked(),false);
    await page.locator('[data-page="overview"]').click();
    await page.locator('#provider-filter').selectOption('deepseek');
    await page.locator('#export').click();
    assert.equal(await page.evaluate(()=>window.lastExportFilter.provider),'deepseek');
    await page.locator('#demo').click();assert.equal(await page.locator('#demo-banner').isVisible(),true);assert.equal(await page.locator('#export').isDisabled(),true);
    await page.locator('#provider-filter').selectOption('domestic');
    assert.ok(await page.locator('.legend-item').count()>=9);
    assert.equal(await page.locator('.legend-item').filter({hasText:'gpt-'}).count(),0);
    await page.locator('#provider-filter').selectOption('doubao');
    assert.equal(await page.locator('.legend-item').count(),1);
    assert.ok((await page.locator('.legend-item').innerText()).includes('doubao'));
    await page.locator('[data-page="sources"]').click();
    const domesticText=await page.locator('.domestic-panel').innerText();
    assert.ok(domesticText.includes('真实 Token'));assert.ok(!domesticText.includes('示例'));
    await page.locator('[data-page="overview"]').click();
    await page.locator('#provider-filter').selectOption('');
    await page.locator('#source-filter').selectOption('claude');
    await page.locator('[data-days="90"]').click();
    assert.equal(await page.locator('.legend-item').count(),1);
    await page.locator('#exit-demo').click();assert.equal(await page.locator('#demo-banner').isVisible(),false);
    await page.setViewportSize({width:960,height:800});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:path.resolve(__dirname,'../.test-output/compact.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: real-data dashboard, domestic provider cards, capture controls, usage import, export provider filter, demo isolation, range, legend, activity, model table, sources, 960px layout; no renderer exceptions.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
