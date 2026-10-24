const path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const page=await browser.newPage();
    const body='data: {"id":"request-test","choices":[{"delta":{"content":"PRIVATE TEXT"}}]}\n\ndata: {"id":"request-test","model":"deepseek-chat","usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_cache_hit_tokens":70,"total_tokens":120}}\n\ndata: [DONE]\n\n';
    await page.route('https://chat.deepseek.com/**',async route=>{if(route.request().url().endsWith('/fixture'))await route.fulfill({status:200,contentType:'text/event-stream',body});else await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Isolated network fixture</title>'});});
    await page.goto('https://chat.deepseek.com/');
    await page.addScriptTag({path:path.resolve(__dirname,'../extension/usage.js')});
    await page.addScriptTag({path:path.resolve(__dirname,'../extension/network.js')});
    await page.evaluate(()=>{window.captured=[];window.addEventListener('message',e=>{if(e.data?.channel==='token-atlas-usage')window.captured.push(e.data.record);});});
    await page.evaluate(()=>new Promise(resolve=>{const listener=e=>{if(e.data?.channel==='token-atlas-control'){window.removeEventListener('message',listener);resolve();}};window.addEventListener('message',listener);window.postMessage({channel:'token-atlas-control',enabled:true},location.origin);}));
    const original=await page.evaluate(()=>fetch('/fixture').then(r=>r.text()));assert.equal(original,body);
    await page.waitForFunction(()=>window.captured.length===1);
    const records=await page.evaluate(()=>window.captured);assert.equal(records[0].total,120);assert.equal(records[0].cacheRead,70);assert.ok(!JSON.stringify(records).includes('PRIVATE TEXT'));
    console.log('PASS: browser Fetch/SSE response capture, original response preserved, exact usage only, no chat text relayed. No real chat requests were made.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
