const fs=require('node:fs');
const path=require('node:path');
const roots=['desktop','ui','extension','assets','scripts','tests'];
const files=['package.json','pnpm-lock.yaml','README.md','RELEASE_NOTES.md','.gitignore'];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else files.push(f);}}
roots.forEach(walk);
const entries=files.map(file=>{const content=fs.readFileSync(file),name=file.split(path.sep).join('/');return {path:name,mode:'100644',type:'blob',...(name.endsWith('.ico')?{binary:content.toString('base64')}:{content:content.toString('utf8')})};});
entries.push({path:'.github/workflows/token-atlas-release.yml',mode:'100644',type:'blob',content:fs.readFileSync('.github/workflows/token-atlas-release.yml','utf8')});
const buckets=[];let group=[],size=0;
for(const e of entries){const length=Buffer.byteLength(JSON.stringify(e));if(group.length&&size+length>60000){buckets.push(group);group=[];size=0;}group.push(e);size+=length;}if(group.length)buckets.push(group);
const arg=process.argv.find(x=>x.startsWith('--bucket='));
if(arg)console.log(JSON.stringify({elements:buckets[Number(arg.split('=')[1])]}));
else console.log(JSON.stringify({count:entries.length,buckets:buckets.length,paths:entries.map(e=>e.path)}));
