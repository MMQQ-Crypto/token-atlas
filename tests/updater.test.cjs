const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {Updater,compareVersions,validateManifest}=require('../desktop/updater.cjs');
const config=require('../desktop/update-config.json');
const bytes=Buffer.from('verified-update-fixture');
const manifest={appId:config.appId,platform:'win32-x64',version:'1.4.0',url:`https://github.com/${config.repository}/releases/download/${config.tagPrefix}1.4.0/Token-Atlas-1.4.0-Windows-x64.exe`,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'Update notes'};
const release={tag_name:config.tagPrefix+'1.4.0',draft:false,prerelease:false,assets:[{name:config.manifestAsset,browser_download_url:`https://github.com/${config.repository}/releases/download/${config.tagPrefix}1.4.0/${config.manifestAsset}`}]};
const json=x=>new Response(JSON.stringify(x),{status:200});
const latestUrl=`https://github.com/${config.repository}/releases/latest/download/${config.manifestAsset}`;
test('Updater: semantic version ordering and project-specific manifest validation',()=>{
  assert.equal(compareVersions('1.10.0','1.9.9'),1);assert.equal(compareVersions('1.3.0','1.3.0'),0);
  assert.throws(()=>compareVersions('1.3.0-beta','1.3.0'));
  assert.equal(validateManifest(manifest,release.tag_name).version,'1.4.0');
  assert.throws(()=>validateManifest({...manifest,url:'https://evil.example/app.exe'},release.tag_name));
  assert.throws(()=>validateManifest({...manifest,appId:'android.archive'},release.tag_name));
  assert.throws(()=>validateManifest({...manifest,sha256:''},release.tag_name));
});
test('Updater: check and download work with the shared GitHub REST API quota exhausted',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-update-'));
  try{
    const statuses=[],calls=[];const updater=new Updater({version:'1.3.0',directory:dir,portableFile:'C:\\Token Atlas.exe',onChange:s=>statuses.push(s.status),fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.credentials,'omit');if(url.startsWith('https://api.github.com/'))return new Response('API rate limit exceeded',{status:403});if(url===latestUrl)return json(manifest);assert.equal(url,manifest.url);return new Response(bytes);}});
    assert.equal((await updater.check()).status,'available');assert.equal((await updater.download()).status,'ready');
    assert.deepEqual(calls,[latestUrl,manifest.url]);
    assert.equal((await fs.readFile(updater.downloaded)).toString(),bytes.toString());assert.ok(statuses.includes('downloading'));assert.equal(updater.status().progress,100);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Updater: reject tampered binary and remove partial download',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-update-bad-'));
  try{
    const updater=new Updater({version:'1.3.0',directory:dir,fetchImpl:async url=>url===latestUrl?json(manifest):new Response(Buffer.alloc(bytes.length,0))});
    await updater.check();assert.equal((await updater.download()).status,'error');assert.ok(updater.status().error.includes('SHA-256'));assert.equal((await fs.readdir(dir)).length,0);
    await assert.rejects(()=>updater.install());
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Updater: same version does not downgrade, unavailable releases and offline errors remain recoverable',async()=>{
  for(const version of ['1.4.0','1.5.0']){const updater=new Updater({version,directory:os.tmpdir(),fetchImpl:async()=>json(manifest)});assert.equal((await updater.check()).status,'current');await assert.rejects(()=>updater.download());}
  const empty=new Updater({version:'1.3.0',directory:os.tmpdir(),fetchImpl:async()=>new Response('',{status:404})});assert.equal((await empty.check()).status,'unpublished');
  const offline=new Updater({version:'1.3.0',directory:os.tmpdir(),fetchImpl:async()=>{throw Error('offline');}});assert.equal((await offline.check()).status,'error');assert.equal(offline.status().error,'offline');
});

test('Updater: malformed, unrelated and prerelease manifests never become downloads or current-version results',async()=>{
  const wrong=[{...manifest,appId:'another-app'},{...manifest,platform:'android'},{...manifest,version:'1.5.0-beta'},{...manifest,url:'https://github.com/another/repo/releases/download/v1.4.0/app.exe'},[manifest],null];
  for(const raw of wrong){const updater=new Updater({version:'1.4.0',directory:os.tmpdir(),fetchImpl:async()=>json(raw)});assert.equal((await updater.check()).status,'error');await assert.rejects(()=>updater.download());}
  const html=new Updater({version:'1.3.0',directory:os.tmpdir(),fetchImpl:async()=>new Response('<html>proxy error</html>')});assert.equal((await html.check()).status,'error');assert.match(html.status().error,/JSON/);
});

test('Updater: access failures remain recoverable, failed recheck clears stale download metadata',async()=>{
  for(const status of [403,429,500]){let failed=true;const updater=new Updater({version:'1.3.0',directory:os.tmpdir(),fetchImpl:async()=>failed?new Response('',{status}):json(manifest)});assert.equal((await updater.check()).status,'error');failed=false;assert.equal((await updater.check()).status,'available');failed=true;assert.equal((await updater.check()).status,'error');assert.equal(updater.status().availableVersion,null);await assert.rejects(()=>updater.download());await assert.rejects(()=>updater.install());}
});

test('Updater: concurrent checks share a single pending request',async()=>{
  let resolve,calls=0;const updater=new Updater({version:'1.3.0',directory:os.tmpdir(),fetchImpl:()=>{calls++;return new Promise(r=>resolve=r);}});
  const checking=updater.check();assert.equal((await updater.check()).status,'checking');assert.equal(calls,1);resolve(json(manifest));assert.equal((await checking).status,'available');
});
