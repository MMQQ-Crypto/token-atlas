const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {Updater}=require('../desktop/updater.cjs');
const root=path.resolve(process.argv[2]);
app.setPath('userData',path.join(root,'driver-data'));
app.whenReady().then(async()=>{
  try{
    const fixture=JSON.parse(await fs.readFile(path.join(root,'fixture-driver.json'),'utf8'));
    const updater=new Updater({version:'1.0.0',directory:root,portableFile:fixture.target,quit:()=>app.quit()});
    updater.manifest={version:'9.9.9',sha256:fixture.sha256};updater.downloaded=fixture.downloaded;
    updater.set({status:'ready',progress:100});await updater.install();
  }catch(e){console.error(e);app.exit(1);}
});
