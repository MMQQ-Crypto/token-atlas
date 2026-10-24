const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { createZstdDecompress } = require('node:zlib');
const { createCodexParser, createDeepSeekParser, parseClaude, parseCline, deduplicate } = require('./parsers.cjs');
function definitions() {
  const home = os.homedir(), roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const editors = ['Code', 'Code - Insiders', 'Cursor', 'Windsurf'];
  const storage = (id) => editors.map(e => path.join(roaming, e, 'User', 'globalStorage', id, 'tasks'));
  return [
    { id: 'deepseek_desktop', name: 'DeepSeek Harness 桌面端', detail: '自动读取 .dsh 压缩会话中的服务端结算 usage，含缓存与重试', paths: [path.join(process.env.DSH_HOME || path.join(home,'.dsh'),'sessions')], kind:'dsh' },
    { id: 'codex', name: 'Codex', detail: 'CLI 与桌面端会话日志', paths: [path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'sessions'), path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'archived_sessions')], kind: 'jsonl' },
    { id: 'claude', name: 'Claude Code', detail: '项目会话与子代理用量', paths: [path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects')], kind: 'jsonl' },
    { id: 'cline', name: 'Cline', detail: 'VS Code / Cursor / Windsurf 扩展记录', paths: storage('saoudrizwan.claude-dev'), kind: 'cline' },
    { id: 'roo', name: 'Roo Code', detail: '扩展任务中的 API 用量', paths: storage('rooveterinaryinc.roo-cline'), kind: 'cline' },
    { id: 'kilo', name: 'Kilo Code', detail: '兼容 Cline 格式的扩展任务记录', paths: storage('kilocode.kilo-code'), kind: 'cline' },
    { id: 'cursor', name: 'Cursor / Windsurf 内置聊天', detail: '本地聊天记录缺少稳定的逐请求 Token 字段，需要平台用量导出或官方接口', paths: [], unsupported: true },
    { id: 'web', name: 'ChatGPT / Claude / Gemini 网页聊天', detail: '网页聊天通常不保存可读取的本地 Token 账单，暂不支持自动统计', paths: [], unsupported: true },
    { id: 'api', name: '其他 API 调用', detail: '目前未直接连接平台账单接口。通过受支持工具调用的国内模型，其真实日志用量会自动归入对应模型厂商；不会估算网页或客户端用量', paths: [], unsupported: true }
  ];
}
async function walk(dir, kind, errors, files = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch (e) { if (e.code !== 'ENOENT') errors.push(`${dir}：${e.code || e.message}`); return files; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, kind, errors, files);
    else if (e.isFile() && (kind === 'dsh' ? /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(e.name) : kind === 'jsonl' ? e.name.endsWith('.jsonl') : /^(ui_messages|claude_messages)\.json$/.test(e.name))) files.push(p);
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
      const source = { ...def, paths: roots, enabled: settings.enabled?.[def.id] !== false, files: 0, records: 0, total: 0, errors: [] };
      sources.push(source);
      if (def.unsupported || !source.enabled) continue;
      const files = new Set();
      for (const root of roots) for (const f of await walk(root, def.kind, source.errors)) files.add(f);
      source.files = files.size;
      const records = [];
      for (const file of files) {
        seen.add(file);
        try {
          const stat = await fsp.stat(file), fingerprint = `${stat.size}:${stat.mtimeMs}`;
          let parsed = this.cache.get(file);
          if (parsed?.fingerprint !== fingerprint) {
            const rows = [];
            let malformed = 0;
            if (def.kind === 'jsonl' || def.kind==='dsh') {
              const parse = def.kind==='dsh' ? createDeepSeekParser(file) : def.id === 'codex' ? createCodexParser(file) : (obj, i) => parseClaude(obj, file, i);
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
            } else rows.push(...parseCline(JSON.parse(await fsp.readFile(file, 'utf8')), file, def.id));
            parsed = { fingerprint, records: rows, malformed };
            this.cache.set(file, parsed);
          }
          records.push(...parsed.records);
          if (parsed.malformed) source.errors.push(`${path.basename(file)}：跳过 ${parsed.malformed} 行未完成或损坏的记录`);
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
