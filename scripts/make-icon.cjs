const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
  const sharp=require(process.env.SHARP_MODULE || 'sharp');
  const svg=await fs.readFile(path.join(__dirname,'../assets/icon.svg'));
  const sizes=[16,32,48,64,128,256];
  const images=await Promise.all(sizes.map(s=>sharp(svg).resize(s,s).png().toBuffer()));
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  images.forEach((image,i)=>{const p=6+i*16;header[p]=sizes[i]===256?0:sizes[i];header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(image.length,p+8);header.writeUInt32LE(offset,p+12);offset+=image.length;});
  await fs.writeFile(path.join(__dirname,'../assets/icon.ico'),Buffer.concat([header,...images]));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
