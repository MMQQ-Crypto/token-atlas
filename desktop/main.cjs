const { app, BrowserWindow, ipcMain, dialog, Menu, session, clipboard, shell, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const { CaptureStore } = require('./capture-store.cjs');
const { CaptureServer } = require('./capture-server.cjs');
const { Updater } = require('./updater.cjs');
const sourceIds=['deepseek_desktop','codex','claude','cline','roo','kilo'];
let captureStore,captureServer,updater;
let win, worker, pending, snapshot, settings = { enabled: {}, paths: {}, autoRefresh: true };
const entry = path.join(__dirname, '..', 'ui', 'index.html');
const smokeRoot = process.env.TOKEN_ATLAS_SMOKE_ROOT || path.join(process.cwd(), '.test-output');
if (process.env.TOKEN_ATLAS_SMOKE) app.setPath('userData', path.join(smokeRoot, 'userData'));
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function scan() {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const finish = msg => { cleanup(); if (msg.error) reject(new Error(msg.error)); else {
      snapshot = msg.data;
      const captured=captureStore.list();snapshot.records.push(...captured);snapshot.records.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
      for(const [id,name] of [['browser','网页响应采集'],['imported','导入的真实用量']]){const rows=captured.filter(r=>r.source===id);snapshot.sources.push({id,name,detail:id==='browser'?'浏览器扩展读取响应 usage；无 usage 不计数':'从 JSON / JSONL / HAR 中提取真实 usage，丢弃正文和请求头',managed:true,enabled:true,paths:[],files:rows.length?1:0,records:rows.length,total:rows.reduce((s,r)=>s+r.total,0),errors:[]});}
      resolve(snapshot);
    } };
    const fail = err => { cleanup(); reject(err); };
    const cleanup = () => { worker.off('message', finish); worker.off('error', fail); pending = null; };
    worker.once('message', finish); worker.once('error', fail); worker.postMessage(settings);
  });
  return pending;
}
function handle(name, fn) {
  ipcMain.handle(name, (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame?.url !== pathToFileURL(entry).href) throw new Error('不允许的请求');
    return fn(...args);
  });
}
app.whenReady().then(async () => {
  try { const stored = JSON.parse(await fs.readFile(settingsFile(), 'utf8')); settings = { ...settings, ...stored }; } catch {}
  captureStore=new CaptureStore(app.getPath('userData'));await captureStore.load();
  captureServer=new CaptureServer(captureStore,()=>win?.webContents.send('capture:updated'));
  updater=new Updater({version:app.getVersion(),directory:path.join(app.getPath('userData'),'updates'),portableFile:process.env.PORTABLE_EXECUTABLE_FILE,fetchImpl:(url,options)=>net.fetch(url,options),onChange:state=>win?.webContents.send('update:changed',state),quit:()=>app.quit()});
  worker = new Worker(path.join(__dirname, 'scan-worker.cjs'));
  worker.on('error', () => { /* Pending requests surface the error in the UI. */ });
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1440, height: 1020, minWidth: 960, minHeight: 720, show: !process.env.TOKEN_ATLAS_SMOKE,
    backgroundColor: '#151515', title: 'Token Atlas · AI 用量统计', icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  handle('scan', scan);
  handle('settings:get', () => settings);
  handle('update:status',()=>updater.status());
  handle('update:check',()=>updater.check());
  handle('update:download',()=>updater.download());
  handle('update:install',()=>updater.install());
  handle('settings:update', async next => {
    if (!next || typeof next.autoRefresh !== 'boolean' || !next.enabled || typeof next.enabled !== 'object') throw new Error('无效设置');
    settings.autoRefresh = next.autoRefresh;
    settings.enabled = Object.fromEntries(sourceIds.map(id => [id, next.enabled[id] !== false]));
    await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2));
    return settings;
  });
  handle('source:folder', async id => {
    if (!sourceIds.includes(id)) throw new Error('无效数据源');
    const result = await dialog.showOpenDialog(win, { title: '选择会话或任务记录文件夹', properties: ['openDirectory'] });
    if (result.canceled) return null;
    settings.paths[id] = result.filePaths[0];
    await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2));
    return settings;
  });
  handle('source:reset', async id => {
    if (!sourceIds.includes(id)) throw new Error('无效数据源');
    delete settings.paths[id];
    await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2));
    return settings;
  });
  handle('capture:status',()=>captureServer.status());
  handle('capture:start',()=>captureServer.start());
  handle('capture:stop',async()=>{await captureServer.stop();return captureServer.status();});
  handle('capture:copy',()=>{clipboard.writeText(captureServer.key);return true;});
  handle('capture:import',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'导入真实用量响应（JSON、JSONL 或 HAR）',properties:['openFile','multiSelections'],filters:[{name:'用量响应 / 网络记录',extensions:['json','jsonl','har']}]});
    if(result.canceled)return null;
    const total={added:0,found:0,skipped:0};
    for(const file of result.filePaths){const r=await captureStore.importFile(file);for(const key of Object.keys(total))total[key]+=r[key];}
    return total;
  });
  handle('capture:extension',async()=>{
    const directory=path.join(app.getPath('userData'),'browser-extension');
    await fs.cp(path.join(app.getAppPath(),'extension'),directory,{recursive:true});
    const error=await shell.openPath(directory);if(error)throw new Error(error);return directory;
  });
  handle('export', async filter => {
    const { matchesProvider, providerFor, providerName } = await import('../ui/providers.mjs');
    const data = snapshot || await scan();
    const rows = data.records.filter(r => matchesProvider(r, filter?.provider) && (!filter?.source || r.source === filter.source) && (!filter?.start || r.timestamp >= filter.start) && (!filter?.end || r.timestamp < filter.end));
    const result = await dialog.showSaveDialog(win, { defaultPath: `Token-Atlas-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: 'CSV 表格', extensions: ['csv'] }] });
    if (result.canceled) return false;
    const csv = v => { let s = String(v ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return `"${s.replaceAll('"', '""')}"`; };
    const keys = ['timestamp', 'source', 'model', 'providerName', 'input', 'output', 'cacheRead', 'cacheWrite', 'total'];
    await fs.writeFile(result.filePath, '\ufeff' + ['时间,工具,模型,模型厂商（按模型或响应来源识别）,非缓存输入,输出,缓存读取,缓存写入,总 Token', ...rows.map(r => keys.map(k => csv(k === 'providerName' ? providerName(providerFor(r.model,r.providerHint)) : r[k])).join(','))].join('\r\n'));
    return true;
  });
  await win.loadFile(entry);
  if(!process.env.TOKEN_ATLAS_SMOKE)setTimeout(()=>updater.check(),4000);
  if (process.env.TOKEN_ATLAS_SMOKE) {
    win.webContents.on('console-message', event => console.log('renderer:', event.message));
    setTimeout(async () => {
      try {
        const result = await win.webContents.executeJavaScript('({ready:!!window.tokenAtlas, title:document.title, cards:document.querySelectorAll(".stat").length, error:!document.querySelector("#notice").hidden, status:document.querySelector("#sync-status").textContent, text:document.body.innerText.slice(0,900)})');
        console.log(JSON.stringify(result));
        if (!result.ready || result.cards !== 5 || result.error || !result.status.includes('条用量记录')) throw new Error('桌面用量读取检查未通过');
        const image = await win.webContents.capturePage();
        await fs.mkdir(smokeRoot, { recursive: true });
        await fs.writeFile(path.join(smokeRoot, 'desktop.png'), image.toPNG());
        const domestic = await win.webContents.executeJavaScript('document.querySelector("[data-page=sources]").click(); ({cards:document.querySelectorAll(".domestic-card").length,evidence:document.querySelectorAll(".capture-evidence").length})');
        if (domestic.cards !== 12 || domestic.evidence !== 12) throw new Error('国内平台状态检查未通过');
        const exportPath = path.join(smokeRoot, 'export-check.csv');
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
        const exported = await win.webContents.executeJavaScript('window.tokenAtlas.exportCSV({provider:"openai"})');
        const csv = await fs.readFile(exportPath, 'utf8');
        if (!exported || !csv.includes('模型厂商') || !csv.includes('OpenAI')) throw new Error('桌面 CSV 导出检查未通过');
        const {providerUsage}=await import('../ui/providers.mjs');
        const realDomestic=providerUsage(snapshot.records).filter(p=>p.count>0);
        if(realDomestic.length){
          await win.webContents.executeJavaScript('window.tokenAtlas.exportCSV({provider:"domestic"})');
          const domesticCSV=await fs.readFile(exportPath,'utf8');
          if(!domesticCSV.includes('DeepSeek')||domesticCSV.includes('"OpenAI"'))throw new Error('国内真实用量导出检查未通过');
        }
        const extensionCheck=path.join(smokeRoot,'extension-check');await fs.cp(path.join(app.getAppPath(),'extension'),extensionCheck,{recursive:true});
        const manifest=JSON.parse(await fs.readFile(path.join(extensionCheck,'manifest.json'),'utf8'));if(manifest.manifest_version!==3)throw new Error('扩展打包检查未通过');
        const bridgeStatus=await captureServer.start(0);
        const health=await fetch(bridgeStatus.url+'/health',{headers:{Authorization:'Bearer '+bridgeStatus.key}});
        if(!health.ok)throw new Error('网页采集通道检查未通过');await captureServer.stop();
        await fs.writeFile(path.join(smokeRoot,'smoke-result.json'),JSON.stringify({...result,domestic,exportPassed:true,bridgePassed:true,realDomestic},null,2));
        console.log('PASS: packaged desktop, real domestic usage, browser capture bridge, provider-filtered CSV export.');
      } catch (e) { console.error(e); app.exit(1); return; }
      app.quit();
    }, 12000);
  }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {worker?.terminate();captureServer?.stop();});
