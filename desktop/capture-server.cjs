const http=require('node:http');
const crypto=require('node:crypto');
class CaptureServer{
  constructor(store,onCapture=()=>{}){this.store=store;this.onCapture=onCapture;this.key=crypto.randomBytes(24).toString('hex');this.server=null;}
  status(){return {running:!!this.server?.listening,url:this.server?`http://127.0.0.1:${this.server.address()?.port||46137}`:'http://127.0.0.1:46137',key:this.key};}
  async start(port=46137){
    if(this.server)return this.status();
    const server=http.createServer(async(req,res)=>{
      const origin=req.headers.origin;
      if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){res.writeHead(403).end();return;}
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
      if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.writeHead(204).end();return;}
      const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+this.key);
      if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected)){res.writeHead(401).end(JSON.stringify({error:'配对码不匹配'}));return;}
      if(req.url==='/health'&&req.method==='GET'){res.end(JSON.stringify({ok:true,app:'Token Atlas'}));return;}
      if(req.url!=='/usage'||req.method!=='POST'){res.writeHead(404).end();return;}
      try{
        let size=0,chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413).end();return;}chunks.push(chunk);}
        const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const added=await this.store.add(raw);
        if(added)this.onCapture();res.end(JSON.stringify({ok:true,added}));
      }catch{if(!res.headersSent)res.writeHead(400);res.end(JSON.stringify({error:'未接收到有效的服务端 usage 数据'}));}
    });
    server.requestTimeout=15000;server.headersTimeout=10000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    this.server=server;return this.status();
  }
  async stop(){if(!this.server)return;const server=this.server;this.server=null;server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={CaptureServer};
