const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const config=require('./update-config.json');
const versionParts=value=>{const m=typeof value==='string'&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);if(!m)throw new Error('无效的正式版本号');return m.slice(1).map(Number);};
function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
function validateManifest(manifest,tag){
  if(!manifest||manifest.appId!==config.appId||manifest.platform!=='win32-x64')throw new Error('更新包不属于 Token Atlas Windows 版');
  versionParts(manifest.version);
  if(tag!==config.tagPrefix+manifest.version)throw new Error('版本号与发布标签不一致');
  if(!/^[a-f0-9]{64}$/i.test(manifest.sha256)||!Number.isSafeInteger(manifest.size)||manifest.size<1||manifest.size>500*1024*1024)throw new Error('更新校验信息无效');
  const expected=`https://github.com/${config.repository}/releases/download/${tag}/Token-Atlas-${manifest.version}-Windows-x64.exe`;
  if(manifest.url!==expected)throw new Error('更新下载地址不属于本项目');
  return {...manifest,notes:String(manifest.notes||'').slice(0,10000)};
}
class Updater{
  constructor({version,directory,portableFile,fetchImpl=fetch,onChange=()=>{},quit=()=>{}}){
    this.version=version;this.directory=directory;this.portableFile=portableFile;this.fetchImpl=fetchImpl;this.onChange=onChange;this.quit=quit;
    this.state={status:'idle',currentVersion:version,availableVersion:null,notes:'',progress:0,error:'',canInstall:!!portableFile,repository:config.repository};
  }
  status(){return {...this.state};}
  set(next){this.state={...this.state,...next};this.onChange(this.status());return this.status();}
  async request(url,timeout=20000){
    const response=await this.fetchImpl(url,{headers:{'User-Agent':`Token-Atlas/${this.version}`,Accept:'application/json, application/octet-stream'},signal:AbortSignal.timeout(timeout),redirect:'follow',credentials:'omit',cache:'no-store'});
    if(!response.ok){const error=new Error(response.status===403?'GitHub 拒绝访问（403），请稍后重试或打开发布页':response.status===429?'GitHub 访问过于频繁，请稍后重试或打开发布页':`GitHub 访问失败（${response.status}），可打开发布页手动下载`);error.status=response.status;throw error;}
    return response;
  }
  async check(){
    if(['checking','downloading','installing'].includes(this.state.status))return this.status();
    this.manifest=null;this.downloaded=null;
    this.set({status:'checking',availableVersion:null,notes:'',progress:0,error:''});
    try{
      // The public latest-release asset avoids the shared unauthenticated REST API quota.
      const response=await this.request(`https://github.com/${config.repository}/releases/latest/download/${config.manifestAsset}`);
      let raw;try{raw=await response.json();}catch{throw new Error('更新清单不是有效 JSON，可打开发布页手动下载');}
      const manifest=validateManifest(raw,config.tagPrefix+raw?.version),version=manifest.version;
      if(compareVersions(version,this.version)<=0)return this.set({status:'current',availableVersion:null,notes:'当前已是最新版本',progress:0});
      this.manifest=manifest;
      return this.set({status:'available',availableVersion:version,notes:this.manifest.notes,progress:0});
    }catch(e){if(e.status===404)return this.set({status:'unpublished',notes:'尚未提供可用的 Token Atlas 更新清单，可打开发布页查看'});return this.set({status:'error',error:e.name==='TimeoutError'?'连接 GitHub 超时，请重试或打开发布页':e.message});}
  }
  async download(){
    if(this.state.status==='downloading')return this.status();
    if(!this.manifest||compareVersions(this.manifest.version,this.version)<=0)throw new Error('请先检查是否有新版本');
    const m=this.manifest;await fs.mkdir(this.directory,{recursive:true});
    const destination=path.join(this.directory,`Token-Atlas-${m.version}-Windows-x64.exe`),temporary=destination+'.part';
    this.set({status:'downloading',progress:0,error:''});let handle;
    try{
      const response=await this.request(m.url,10*60*1000);
      if(!response.body)throw new Error('更新下载没有响应正文');
      handle=await fs.open(temporary,'w');const hash=crypto.createHash('sha256');let size=0,lastProgress=-1;
      for await(const chunk of response.body){size+=chunk.length;if(size>m.size)throw new Error('更新包大小超出清单，已停止下载');hash.update(chunk);await handle.writeFile(chunk);const progress=Math.floor(size/m.size*100);if(progress!==lastProgress){this.set({progress});lastProgress=progress;}}
      await handle.close();handle=null;
      if(size!==m.size||hash.digest('hex').toLowerCase()!==m.sha256.toLowerCase())throw new Error('更新包 SHA-256 校验失败，请重新下载');
      await fs.rm(destination,{force:true});await fs.rename(temporary,destination);this.downloaded=destination;
      return this.set({status:'ready',progress:100});
    }catch(e){await handle?.close();await fs.rm(temporary,{force:true});return this.set({status:'error',error:e.message});}
  }
  async install(){
    if(this.state.status!=='ready'||!this.downloaded||!this.portableFile)throw new Error('请从免安装 EXE 运行，并先完成更新下载');
    const target=path.resolve(this.portableFile);
    if(!path.isAbsolute(this.portableFile)||path.extname(target).toLowerCase()!=='.exe')throw new Error('无法确认当前免安装程序的位置');
    const helper=path.join(this.directory,'apply-update.ps1'),settings=path.join(this.directory,'apply-update.json');
    const launcher=path.join(this.directory,'launch-update.ps1'),readyFile=path.join(this.directory,'helper-ready.json'),launchedFile=path.join(this.directory,'helper-launched.json');
    await fs.copyFile(path.join(__dirname,'apply-update.ps1'),helper);
    await fs.copyFile(path.join(__dirname,'launch-update.ps1'),launcher);
    await fs.rm(readyFile,{force:true});
    await fs.rm(launchedFile,{force:true});
    await fs.writeFile(settings,JSON.stringify({appId:config.appId,processToWait:process.pid,target,downloaded:this.downloaded,sha256:this.manifest.sha256,version:this.manifest.version,result:path.join(this.directory,'update-result.json')}));
    // DETACHED_PROCESS can make Windows PowerShell exit without running -File.
    // Wait for its startup acknowledgment before closing Electron, and retain logs.
    const log=await fs.open(path.join(this.directory,'apply-update.log'),'a');let child;
    this.set({status:'installing',error:''});
    try{
      child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',launcher,'-ConfigFile',settings],{stdio:['ignore',log.fd,log.fd],windowsHide:true});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
      const deadline=Date.now()+15000;
      while(true){
        let ready,launched;try{ready=JSON.parse((await fs.readFile(readyFile,'utf8')).replace(/^\uFEFF/,''));launched=JSON.parse((await fs.readFile(launchedFile,'utf8')).replace(/^\uFEFF/,''));}catch{}
        if(launched?.pid&&ready?.pid===launched.pid&&ready.status==='ready')break;
        if((child.exitCode!==null&&child.exitCode!==0)||Date.now()>deadline)throw new Error('更新助手未能启动，请打开发布页手动下载；诊断信息已保存在 updates/apply-update.log');
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      child.unref();await log.close();this.quit();return this.status();
    }catch(e){child?.unref();await log.close().catch(()=>{});this.set({status:'ready',error:e.message});throw e;}
  }
}
module.exports={Updater,compareVersions,validateManifest};
