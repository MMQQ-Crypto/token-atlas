const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const config=require('./update-config.json');
const versionParts=value=>{const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);if(!m)throw new Error('无效的正式版本号');return m.slice(1).map(Number);};
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
    const response=await this.fetchImpl(url,{headers:{'User-Agent':`Token-Atlas/${this.version}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(timeout),redirect:'follow'});
    if(!response.ok)throw new Error(response.status===403||response.status===429?'GitHub 请求受限，请稍后重试':`GitHub 访问失败（${response.status}）`);
    return response;
  }
  async check(){
    if(['checking','downloading','installing'].includes(this.state.status))return this.status();
    this.set({status:'checking',error:''});
    try{
      const response=await this.request(`https://api.github.com/repos/${config.repository}/releases?per_page=100`);
      const releases=await response.json();if(!Array.isArray(releases))throw new Error('GitHub 返回了无效发布列表');
      const candidates=releases.filter(r=>!r.draft&&!r.prerelease&&typeof r.tag_name==='string'&&r.tag_name.startsWith(config.tagPrefix)&&/^\d+\.\d+\.\d+$/.test(r.tag_name.slice(config.tagPrefix.length))).sort((a,b)=>compareVersions(b.tag_name.slice(config.tagPrefix.length),a.tag_name.slice(config.tagPrefix.length)));
      if(!candidates.length)return this.set({status:'unpublished',availableVersion:null,notes:'尚未发布 Token Atlas 更新',progress:0});
      const latest=candidates[0],version=latest.tag_name.slice(config.tagPrefix.length);
      if(compareVersions(version,this.version)<=0)return this.set({status:'current',availableVersion:null,notes:'当前已是最新版本',progress:0});
      const asset=latest.assets?.find(a=>a.name===config.manifestAsset);
      const expected=`https://github.com/${config.repository}/releases/download/${latest.tag_name}/${config.manifestAsset}`;
      if(!asset||asset.browser_download_url!==expected)throw new Error('新版尚未提供有效的更新清单');
      const raw=await this.request(expected);this.manifest=validateManifest(await raw.json(),latest.tag_name);
      return this.set({status:'available',availableVersion:version,notes:this.manifest.notes,progress:0});
    }catch(e){return this.set({status:'error',error:e.message});}
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
    await fs.copyFile(path.join(__dirname,'apply-update.ps1'),helper);
    await fs.writeFile(settings,JSON.stringify({appId:config.appId,processToWait:process.pid,target,downloaded:this.downloaded,sha256:this.manifest.sha256,version:this.manifest.version,result:path.join(this.directory,'update-result.json')}));
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-ConfigFile',settings],{detached:true,stdio:'ignore',windowsHide:true});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();this.set({status:'installing'});this.quit();return this.status();
  }
}
module.exports={Updater,compareVersions,validateManifest};
