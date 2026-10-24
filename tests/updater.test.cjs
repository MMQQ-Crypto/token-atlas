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
test('Updater: semantic version ordering and project-specific manifest validation',()=>{
  assert.equal(compareVersions('1.10.0','1.9.9'),1);assert.equal(compareVersions('1.3.0','1.3.0'),0);
  assert.throws(()=>compareVersions('1.3.0-beta','1.3.0'));
  assert.equal(validateManifest(manifest,release.tag_name).version,'1.4.0');
  assert.throws(()=>validateManifest({...manifest,url:'https://evil.example/app.exe'},release.tag_name));
  assert.throws(()=>validateManifest({...manifest,appId:'android.archive'},release.tag_name));
  assert.throws(()=>validateManifest({...manifest,sha256:''},release.tag_name));
});
test('Updater: ignore unrelated releases, choose stable project release, verify complete download and hash',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-update-'));
  try{
    const statuses=[];const updater=new Updater({version:'1.3.0',directory:dir,portableFile:'C:\\Token Atlas.exe',onChange:s=>statuses.push(s.status),fetchImpl:async url=>url.includes('/releases?')?json([{tag_name:'android-v99.0.0',assets:[]},{...release,tag_name:config.tagPrefix+'9.0.0',prerelease:true},release]):url.endsWith('.json')?json(manifest):new Response(bytes)});
    assert.equal((await updater.check()).status,'available');assert.equal((await updater.download()).status,'ready');
    assert.equal((await fs.readFile(updater.downloaded)).toString(),bytes.toString());assert.ok(statuses.includes('downloading'));assert.equal(updater.status().progress,100);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Updater: reject tampered binary and remove partial download',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-update-bad-'));
  try{
    const updater=new Updater({version:'1.3.0',directory:dir,fetchImpl:async url=>url.includes('/releases?')?json([release]):url.endsWith('.json')?json(manifest):new Response(Buffer.alloc(bytes.length,0))});
    await updater.check();assert.equal((await updater.download()).status,'error');assert.ok(updater.status().error.includes('SHA-256'));assert.equal((await fs.readdir(dir)).length,0);
    await assert.rejects(()=>updater.install());
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Updater: same version does not downgrade, unavailable releases and offline errors remain recoverable',async()=>{
  const updater=new Updater({version:'1.4.0',directory:os.tmpdir(),fetchImpl:async()=>json([release])});assert.equal((await updater.check()).status,'current');
  const empty=new Updater({version:'1.3.0',directory:os.tmpdir(),fetchImpl:async()=>json([{tag_name:'android-v8.0',assets:[]}])});assert.equal((await empty.check()).status,'unpublished');
  const offline=new Updater({version:'1.3.0',directory:os.tmpdir(),fetchImpl:async()=>{throw Error('offline');}});assert.equal((await offline.check()).status,'error');assert.equal(offline.status().error,'offline');
});
