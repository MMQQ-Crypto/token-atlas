const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

async function verifyFile(file,asset){
  try{
    const stat=await fs.stat(file);if(!stat.isFile()||stat.size!==asset.size)return false;
    const hash=crypto.createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);
    return hash.digest('hex').toLowerCase()===asset.sha256.toLowerCase();
  }catch{return false;}
}
async function lengthOf(file,maximum){
  try{const stat=await fs.stat(file);if(stat.isFile()&&stat.size<=maximum)return stat.size;await fs.rm(file,{force:true});}catch(e){if(e.code!=='ENOENT')throw e;}return 0;
}
function checkRange(response,start,end,total){
  if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end}/${total}`)throw new Error('服务器返回的下载范围不匹配，请重新下载');
}
async function consume(response,file,offset,expected,onBytes){
  if(!response.body)throw new Error('更新下载没有响应正文');
  const handle=await fs.open(file,offset?'a':'w');let length=offset;
  try{
    for await(const bytes of response.body){
      if(length+bytes.length>expected)throw new Error('更新包大小超出清单，已停止下载');
      await handle.writeFile(bytes);length+=bytes.length;onBytes(bytes.length);
    }
    if(length!==expected)throw new Error('下载连接提前结束，已保存进度，可重试继续');
  }finally{await handle.close();}
}

// Every cached byte is untrusted until the complete EXE passes its published hash.
// Ranges share one immutable asset identity; a server ignoring Range gets one full download.
async function downloadAsset({asset,directory,request,onProgress=()=>{},rangeThreshold=8*1024*1024}){
  await fs.mkdir(directory,{recursive:true});
  const destination=path.join(directory,`Token-Atlas-${asset.version}-Windows-x64.exe`);
  if(await verifyFile(destination,asset)){onProgress({phase:'cached',loaded:asset.size,total:asset.size,mode:'cached',bytesPerSecond:0,remainingSeconds:0});return {file:destination,mode:'cached'};}
  const prefix=`${destination}.${asset.sha256.toLowerCase().slice(0,16)}`,temporary=prefix+'.part',chunkDirectory=prefix+'.chunks';
  const started=Date.now();let loaded=0,initial=0,lastUpdate=0,mode='single';
  const progress=(force=false,phase='downloading')=>{
    const now=Date.now();if(!force&&now-lastUpdate<150&&loaded<asset.size)return;lastUpdate=now;
    const elapsed=(now-started)/1000,speed=elapsed>.2?Math.max(0,loaded-initial)/elapsed:0;
    onProgress({phase,loaded,total:asset.size,mode,bytesPerSecond:Math.round(speed),remainingSeconds:speed>0?Math.ceil((asset.size-loaded)/speed):null});
  };
  const add=n=>{loaded+=n;progress();};
  const cleanChunks=async()=>{for(let i=0;i<4;i++)await fs.rm(path.join(chunkDirectory,`${i}.part`),{force:true});await fs.rmdir(chunkDirectory).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e;});};
  const finish=async()=>{
    progress(true,'verifying');
    if(!await verifyFile(temporary,asset)){
      await fs.rm(temporary,{force:true});await cleanChunks();
      throw new Error('更新包 SHA-256 校验失败，请重新下载');
    }
    await fs.rm(destination,{force:true});await fs.rename(temporary,destination);await cleanChunks();return {file:destination,mode};
  };
  if(asset.size<rangeThreshold){
    let offset=await lengthOf(temporary,asset.size);initial=loaded=offset;mode=offset?'resume':'single';progress(true);
    if(offset===asset.size)return finish();
    const response=await request(asset.url,600000,offset?{headers:{Range:`bytes=${offset}-${asset.size-1}`}}:{});
    if(response.status===206)checkRange(response,offset,asset.size-1,asset.size);
    else{offset=0;initial=loaded=0;mode='single';progress(true);}
    await consume(response,temporary,offset,asset.size,add);return finish();
  }
  await fs.mkdir(chunkDirectory,{recursive:true});
  const span=Math.ceil(asset.size/4),chunks=[];
  for(let i=0;i<4;i++){
    const start=i*span,end=Math.min(asset.size,(i+1)*span)-1,file=path.join(chunkDirectory,`${i}.part`);
    const size=end-start+1,offset=await lengthOf(file,size);chunks.push({start,end,file,size,offset});loaded+=offset;
  }
  initial=loaded;mode=initial?'resume':'parallel';progress(true);
  const pending=chunks.filter(c=>c.offset<c.size),controller=new AbortController();
  if(pending.length){
    const first=pending[0];
    const options=c=>({headers:{Range:`bytes=${c.start+c.offset}-${c.end}`},signal:controller.signal});
    const firstResponse=await request(asset.url,600000,options(first));
    if(firstResponse.status===200){
      initial=loaded=0;mode='single';progress(true);
      await consume(firstResponse,temporary,0,asset.size,add);return finish();
    }
    let failure;
    const results=await Promise.allSettled(pending.map(async(c,i)=>{
      let response;
      try{
        response=i===0?firstResponse:await request(asset.url,600000,options(c));
        checkRange(response,c.start+c.offset,c.end,asset.size);
        await consume(response,c.file,c.offset,c.size,add);
      }catch(e){failure??=e;controller.abort();await response?.body?.cancel().catch(()=>{});throw e;}
    }));
    if(results.some(r=>r.status==='rejected'))throw failure;
  }
  const handle=await fs.open(temporary,'w');
  try{for(const c of chunks)for await(const bytes of createReadStream(c.file))await handle.writeFile(bytes);}finally{await handle.close();}
  return finish();
}
module.exports={downloadAsset,verifyFile};
