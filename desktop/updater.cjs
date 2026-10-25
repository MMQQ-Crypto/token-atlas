const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const config=require('./update-config.json');
const {downloadAsset,verifyFile}=require('./update-download.cjs');
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
    this.checkedAt=0;
    this.state={status:'idle',currentVersion:version,availableVersion:null,notes:'',progress:0,error:'',canInstall:!!portableFile,repository:config.repository};
  }
  status(){return {...this.state};}
  set(next){this.state={...this.state,...next};this.onChange(this.status());return this.status();}
  async request(url,timeout=20000,{headers={},signal}={}){
    const deadline=AbortSignal.timeout(timeout);
    const response=await this.fetchImpl(url,{headers:{'User-Agent':`Token-Atlas/${this.version}`,Accept:'application/json, application/octet-stream',...headers},signal:signal?AbortSignal.any([deadline,signal]):deadline,redirect:'follow',credentials:'omit',cache:'no-store'});
    if(!response.ok){const error=new Error(response.status===403?'GitHub 拒绝访问（403），请稍后重试或打开发布页':response.status===429?'GitHub 访问过于频繁，请稍后重试或打开发布页':`GitHub 访问失败（${response.status}），可打开发布页手动下载`);error.status=response.status;throw error;}
    return response;
  }
  async check({force=false}={}){
    if(['checking','downloading','installing'].includes(this.state.status))return this.status();
    if(!force&&Date.now()-this.checkedAt<30000&&['current','available','ready'].includes(this.state.status)){
      if(this.state.status!=='ready'||await verifyFile(this.downloaded,this.manifest))return this.status();
      this.downloaded=null;return this.set({status:'available',progress:0,downloadMode:'',downloadedBytes:0});
    }
    const previousManifest=this.manifest,previousDownload=this.downloaded;
    this.manifest=null;this.downloaded=null;
    this.set({status:'checking',availableVersion:null,notes:'',progress:0,error:'',downloadedBytes:0,totalBytes:0,bytesPerSecond:0,remainingSeconds:null,downloadMode:'',phase:'',canResume:false});
    try{
      // The public latest-release asset avoids the shared unauthenticated REST API quota.
      const response=await this.request(`https://github.com/${config.repository}/releases/latest/download/${config.manifestAsset}`);
      let raw;try{raw=await response.json();}catch{throw new Error('更新清单不是有效 JSON，可打开发布页手动下载');}
      const manifest=validateManifest(raw,config.tagPrefix+raw?.version),version=manifest.version;
      this.checkedAt=Date.now();
      if(compareVersions(version,this.version)<=0)return this.set({status:'current',availableVersion:null,notes:'当前已是最新版本',progress:0});
      this.manifest=manifest;
      if(previousDownload&&previousManifest?.sha256===manifest.sha256&&previousManifest.version===manifest.version&&await verifyFile(previousDownload,manifest)){
        this.downloaded=previousDownload;return this.set({status:'ready',availableVersion:version,notes:manifest.notes,progress:100,downloadedBytes:manifest.size,totalBytes:manifest.size,downloadMode:'cached'});
      }
      return this.set({status:'available',availableVersion:version,notes:this.manifest.notes,progress:0});
    }catch(e){this.checkedAt=0;if(e.status===404)return this.set({status:'unpublished',notes:'尚未提供可用的 Token Atlas 更新清单，可打开发布页查看'});return this.set({status:'error',error:e.name==='TimeoutError'?'连接 GitHub 超时，请重试或打开发布页':e.message});}
  }
  async download(){
    if(this.state.status==='downloading')return this.status();
    if(!this.manifest||compareVersions(this.manifest.version,this.version)<=0)throw new Error('请先检查是否有新版本');
    const m=this.manifest;
    this.set({status:'downloading',progress:0,error:'',downloadedBytes:0,totalBytes:m.size,bytesPerSecond:0,remainingSeconds:null,downloadMode:'',phase:'downloading',canResume:false});
    try{
      const result=await downloadAsset({asset:m,directory:this.directory,request:(...args)=>this.request(...args),onProgress:p=>this.set({progress:Math.floor(p.loaded/p.total*100),downloadedBytes:p.loaded,totalBytes:p.total,bytesPerSecond:p.bytesPerSecond,remainingSeconds:p.remainingSeconds,downloadMode:p.mode,phase:p.phase})});
      this.downloaded=result.file;
      this.checkedAt=Date.now();
      return this.set({status:'ready',progress:100});
    }catch(e){this.downloaded=null;const canResume=this.state.downloadedBytes>0&&this.state.downloadedBytes<m.size;return this.set({status:'error',canResume,error:(e.name==='TimeoutError'?'下载超时，请重试':e.message)+(canResume?'；已保留下载进度，可继续下载':'')});}
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
