const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
async function main(){
  const pkg=require('../package.json'),config=require('../desktop/update-config.json');
  const name=`Token-Atlas-${pkg.version}-Windows-x64.exe`,directory=path.join(__dirname,'../release');
  const bytes=await fs.readFile(path.join(directory,name));
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),tag=config.tagPrefix+pkg.version;
  const notes=await fs.readFile(path.join(__dirname,'../RELEASE_NOTES.md'),'utf8');
  const manifest={appId:config.appId,platform:'win32-x64',version:pkg.version,url:`https://github.com/${config.repository}/releases/download/${tag}/${name}`,sha256,size:bytes.length,notes};
  await fs.writeFile(path.join(directory,config.manifestAsset),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(directory,'SHA256.txt'),sha256+'  '+name+'\n');
  console.log(JSON.stringify({tag,name,manifest:config.manifestAsset,size:bytes.length,sha256}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
