const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { createZstdDecompress } = require('node:zlib');
const { createCodexParser, createDeepSeekParser, parseClaude, parseCline, deduplicate } = require('./parsers.cjs');
const {readZCode}=require('./zcode.cjs');
const {parseWorkBuddy}=require('./workbuddy.cjs');
function definitions() {
  const home = os.homedir(), roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const editors = ['Code', 'Code - Insiders', 'Cursor', 'Windsurf'];
  const storage = (id) => editors.map(e => path.join(roaming, e, 'User', 'globalStorage', id, 'tasks'));
  return [
    { id: 'deepseek_desktop', name: 'DeepSeek Harness 桌面端', detail: '自动读取 .dsh 压缩会话中的服务端结算 usage，含缓存与重试', paths: [path.join(process.env.DSH_HOME || path.join(home,'.dsh'),'sessions')], kind:'dsh' },
    { id: 'codex', name: 'Codex', detail: 'CLI 与桌面端会话日志，含子代理；不等于 ChatGPT 网页或客户端的用量', paths: [path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'sessions'), path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'archived_sessions')], kind: 'jsonl' },
    { id:'workbuddy',name:'WorkBuddy',detail:'读取会话中的实际 Token，覆盖模型结算与工具调用；不是账号跨设备额度或积分余额',paths:process.env.WORKBUDDY_HOME?[path.join(process.env.WORKBUDDY_HOME,'projects')]:[path.join(home,'.workbuddy','projects'),path.join(home,'.workbuddy-ai','projects')],kind:'buddy' },
    { id: 'zcode', name: 'ZCode', detail: '只读逐请求用量数据库，按记录总数消除缓存重叠；累计范围限本机保留的记录', paths:[path.join(process.env.ZCODE_HOME||path.join(home,'.zcode'),'cli','db')],kind:'zcode' },
    { id: 'claude', name: 'Claude Code', detail: '项目会话与子代理用量', paths: [path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects')], kind: 'jsonl' },
    { id: 'cline', name: 'Cline', detail: 'VS Code / Cursor / Windsurf 扩展记录', paths: storage('saoudrizwan.claude-dev'), kind: 'cline' },
    { id: 'roo', name: 'Roo Code', detail: '扩展任务中的 API 用量', paths: storage('rooveterinaryinc.roo-cline'), kind: 'cline' },
    { id: 'kilo', name: 'Kilo Code', detail: '兼容 Cline 格式的扩展任务记录', paths: storage('kilocode.kilo-code'), kind: 'cline' },
    { id: 'cursor', name: 'Cursor', detail: '已发现本机应用数据；内置聊天用量格式尚未接入，可导入服务端 usage', paths: [path.join(roaming,'Cursor')], unsupported: true },
    { id: 'windsurf', name: 'Windsurf', detail: '已发现本机应用数据；内置聊天用量格式尚未接入，可导入服务端 usage', paths: [path.join(roaming,'Windsurf')], unsupported: true },
    { id: 'qoder', name: 'Qoder', detail: '已发现本机应用数据；逐请求 Token 格式尚未接入', paths: [path.join(roaming,'Qoder'),path.join(roaming,'com.qodercn.app.stable')], unsupported: true },
    { id: 'trae', name: 'TRAE', detail: '已发现本机应用数据；逐请求 Token 格式尚未接入', paths: [path.join(roaming,'TRAE'),path.join(roaming,'TRAE CN'),path.join(roaming,'TRAE SOLO CN')], unsupported: true },
    { id: 'chatgpt', name: 'ChatGPT', detail: '已发现本机应用数据；消费者客户端没有稳定的逐请求 Token 日志，可用扩展采集实际返回的 usage', paths:[path.join(roaming,'ChatGPT')],unsupported:true }
  ];
}
async function walk(dir, kind, errors, files = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch (e) { if (e.code !== 'ENOENT') errors.push(`${dir}：${e.code || e.message}`); return files; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {if(kind!=='buddy'||e.name!=='tool-results')await walk(p, kind, errors, files);}
    else if (e.isFile() && (kind==='zcode'?e.name==='db.sqlite':kind === 'dsh' ? /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(e.name) : kind === 'jsonl'||kind==='buddy' ? e.name.endsWith('.jsonl') : /^(ui_messages|claude_messages)\.json$/.test(e.name))) files.push(p);
  }
  return files;
}
class Scanner {
  cache = new Map();
  async scan(settings = {}) {
    const all = [], sources = [], seen = new Set();
    for (const def of definitions()) {
      const custom = settings.paths?.[def.id];
      const roots = custom ? [custom] : def.paths;
      const detected=(await Promise.all(roots.map(root=>fsp.access(root).then(()=>true,()=>false)))).some(Boolean);
      const source = { ...def, paths: roots, detected, enabled: settings.enabled?.[def.id] !== false, files: 0, records: 0, total: 0, errors: [] };
      sources.push(source);
      if (def.unsupported || !source.enabled) continue;
      const files = new Set();
      for (const root of roots) for (const f of await walk(root, def.kind, source.errors)) files.add(f);
      source.files = files.size;
      const records = [];
      for (const file of files) {
        seen.add(file);
        try {
          const stat = await fsp.stat(file);let fingerprint = `${stat.size}:${stat.mtimeMs}`;
          if(def.kind==='zcode'){const wal=await fsp.stat(file+'-wal').catch(()=>null);fingerprint+=`:${wal?.size||0}:${wal?.mtimeMs||0}`;}
          let parsed = this.cache.get(file);
          if (parsed?.fingerprint !== fingerprint) {
            const rows = [];
            let malformed = 0;
            let diagnostics;
            if(def.kind==='zcode'){const result=readZCode(file);rows.push(...result.records);malformed=result.skipped;diagnostics=result.diagnostics;}
            else if (def.kind === 'jsonl' || def.kind==='dsh'||def.kind==='buddy') {
              if(def.kind==='buddy')diagnostics={usageRows:0,acceptedRows:0,skippedRows:0};
              const parse = def.kind==='buddy'?(obj,i)=>parseWorkBuddy(obj,file,i,diagnostics):def.kind==='dsh' ? createDeepSeekParser(file) : def.id === 'codex' ? createCodexParser(file) : (obj, i) => parseClaude(obj, file, i);
              const input=fs.createReadStream(file);
              const decoded=file.endsWith('.zstd')?input.pipe(createZstdDecompress()):input;
              if(decoded!==input)input.on('error',err=>decoded.destroy(err));
              decoded.setEncoding('utf8');
              const lines = readline.createInterface({ input: decoded, crlfDelay: Infinity });
              let i = 0;
              for await (const line of lines) {
                if (!line.trim()) continue;
                let obj;
                try { obj = JSON.parse(line); } catch { malformed++; continue; }
                const r = parse(obj, i++);
                if (r) rows.push(r);
              }
              if(def.kind==='buddy')malformed+=diagnostics.skippedRows;
            } else rows.push(...parseCline(JSON.parse(await fsp.readFile(file, 'utf8')), file, def.id));
            parsed = { fingerprint, records: rows, malformed, diagnostics };
            this.cache.set(file, parsed);
          }
          records.push(...parsed.records);
          if(parsed.diagnostics){
            source.diagnostics||={};
            for(const [key,value] of Object.entries(parsed.diagnostics))source.diagnostics[key]=(source.diagnostics[key]||0)+value;
          }
          if (parsed.malformed) source.errors.push(`${path.basename(file)}：跳过 ${parsed.malformed} 行${def.kind==='zcode'||def.kind==='buddy'?'格式、计数或时间无效的用量':'未完成或损坏的'}记录`);
        } catch (e) { source.errors.push(`${path.basename(file)}：${e.code || e.message}`); }
      }
      const unique = deduplicate(records);
      source.records = unique.length;
      source.total = unique.reduce((n, r) => n + r.total, 0);
      all.push(...unique);
    }
    for (const key of this.cache.keys()) if (!seen.has(key)) this.cache.delete(key);
    return { records: deduplicate(all), sources, updatedAt: new Date().toISOString() };
  }
}
module.exports = { Scanner, definitions };
