const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {downloadAsset,verifyFile}=require('../desktop/update-download.cjs');
const payload=crypto.randomBytes(64*1024+3),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(handler,run){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-ranges-'));
  const server=http.createServer((req,res)=>{Promise.resolve(handler(req,res)).catch(()=>res.destroy());});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const asset={version:'9.8.7',url:`http://127.0.0.1:${server.address().port}/app.exe`,size:payload.length,sha256:crypto.createHash('sha256').update(payload).digest('hex')};
  const request=async(url,timeout,options={})=>{const response=await fetch(url,options);if(!response.ok)throw Error('HTTP '+response.status);return response;};
  try{await run({directory,asset,request,download:opts=>downloadAsset({directory,asset,request,rangeThreshold:1024,...opts})});}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true});}
}
function range(req){const m=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');return m?m.slice(1).map(Number):[0,payload.length-1];}
function headers(res,start,end,total=payload.length){res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${total}`,'Content-Length':end-start+1});}

test('Update ranges: concurrent transfers reconstruct exactly the published bytes and report progress',async()=>{
  let active=0,peak=0,calls=0;
  await fixture(async(req,res)=>{
    calls++;active++;peak=Math.max(peak,active);res.once('close',()=>active--);
    const [start,end]=range(req);headers(res,start,end);
    for(let offset=start;offset<=end&&!res.destroyed;offset+=1024){res.write(payload.subarray(offset,Math.min(end+1,offset+1024)));await pause(2);}res.end();
  },async({download,asset})=>{
    const progress=[],result=await download({onProgress:p=>progress.push(p)});
    assert.ok(peak>1&&peak<=4);assert.equal(calls,4);assert.equal(result.mode,'parallel');
    assert.ok((await fs.readFile(result.file)).equals(payload));assert.equal(await verifyFile(result.file,asset),true);
    assert.equal(progress.at(-1).phase,'verifying');assert.equal(progress.at(-1).loaded,asset.size);
  });
});

test('Update ranges: a restarted download resumes partial bytes and skips completed chunks',async()=>{
  let interrupted=true;const requests=[];const span=Math.ceil(payload.length/4);
  await fixture(async(req,res)=>{
    const [start,end]=range(req);requests.push([start,end]);headers(res,start,end);
    if(interrupted&&start===span){res.write(payload.subarray(start,start+4096));await pause(100);res.destroy();}
    else res.end(payload.subarray(start,end+1));
  },async({download,directory,asset})=>{
    await assert.rejects(download());assert.equal(await verifyFile(path.join(directory,`Token-Atlas-${asset.version}-Windows-x64.exe`),asset),false);
    const before=requests.length;interrupted=false;const progress=[];
    const result=await download({onProgress:p=>progress.push(p)});
    assert.equal(result.mode,'resume');assert.ok(progress[0].loaded>0);
    assert.deepEqual(requests.slice(before),[[span+4096,2*span-1]]);
    assert.ok((await fs.readFile(result.file)).equals(payload));
  });
});

test('Update ranges: servers ignoring Range use one full response without duplicate whole-file requests',async()=>{
  let calls=0;
  await fixture((req,res)=>{calls++;res.writeHead(200,{'Content-Length':payload.length});res.end(payload);},async({download})=>{
    const result=await download();assert.equal(calls,1);assert.equal(result.mode,'single');assert.ok((await fs.readFile(result.file)).equals(payload));
  });
});

test('Update ranges: incorrect Content-Range never becomes an installable EXE',async()=>{
  await fixture((req,res)=>{const [start,end]=range(req);headers(res,start,end,payload.length+1);res.end(payload.subarray(start,end+1));},async({download,directory,asset})=>{
    await assert.rejects(download(),/范围/);
    assert.equal(await verifyFile(path.join(directory,`Token-Atlas-${asset.version}-Windows-x64.exe`),asset),false);
  });
});

test('Update ranges: bad assembled hashes discard poisoned chunks so retry can recover',async()=>{
  let bad=true;
  await fixture((req,res)=>{const [start,end]=range(req);headers(res,start,end);const body=Buffer.from(payload.subarray(start,end+1));if(bad)body[0]^=255;res.end(body);},async({download,directory})=>{
    await assert.rejects(download(),/SHA-256/);assert.deepEqual(await fs.readdir(directory),[]);
    bad=false;const result=await download();assert.ok((await fs.readFile(result.file)).equals(payload));
  });
});
