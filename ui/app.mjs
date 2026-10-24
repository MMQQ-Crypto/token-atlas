import { COLORS, NAMES, modelKey, aggregate, compact, dayKey, dayOffset, selectRecords, demoData } from './analytics.mjs';
import { DOMESTIC_PROVIDERS, providerFor, providerName, matchesProvider, providerUsage } from './providers.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exact = n => n.toLocaleString('zh-CN');
let snapshot={records:[],sources:[]}, settings={autoRefresh:true,enabled:{},paths:{}}, demo=false, days=7, source='', mode='daily', hiddenModels=new Set(), busy=false;
let page='overview', provider='', toastTimer;
const bridge = window.tokenAtlas;
function toast(text) { $('#toast').textContent=text; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,3500); }
function records() { return demo ? demoData() : snapshot.records; }
function unit(n) { const text=compact(n), match=text.match(/^(.*) (万|亿)$/); return match ? `${escape(match[1])}<small>${match[2]}</small>` : escape(text); }
function renderStats(all) {
  const a=aggregate(all);
  const items=[[unit(a.totals.total),'累计 Token 数'],[unit(a.peak),'单日峰值 Token'],[`${exact(a.sessions)}<small>个</small>`,'累计会话'],[`${a.current}<small>天</small>`,'当前连续天数'],[`${a.longest}<small>天</small>`,'最长连续天数']];
  $('#stats').innerHTML=items.map(([value,label])=>`<div class="stat"><div class="stat-value">${all.length?value:'—'}</div><div class="stat-label">${label}</div></div>`).join('');
}
function renderHeatmap(all) {
  const daily=aggregate(all).daily, today=dayOffset(new Date(),0), start=dayOffset(today,-364);
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  const sums=new Map(); let running=0;
  for(let w=0;w<53;w++) {
    let weekly=0;
    for(let d=0;d<7;d++) weekly+=daily.get(dayKey(dayOffset(start,w*7+d)))||0;
    sums.set(w,weekly);
  }
  const amounts=[];
  for(let i=0;i<371;i++){const d=dayOffset(start,i); const v=daily.get(dayKey(d))||0;running+=v;amounts.push(mode==='cumulative'?running:mode==='weekly'?sums.get(Math.floor(i/7)):v);}
  const max=Math.max(1,...amounts), palette=['#2d2d2e','#2e4260','#416390','#5986c1','#81acf2'];
  let months='',weeks='',lastMonth=-1;
  for(let w=0;w<53;w++){
    const first=dayOffset(start,w*7);
    if(first.getMonth()!==lastMonth){months+=`<span style="left:${w/53*100}%">${first.getMonth()+1}月</span>`;lastMonth=first.getMonth();}
    let cells='';
    for(let d=0;d<7;d++){
      const i=w*7+d,date=dayOffset(start,i),key=dayKey(date),value=amounts[i];
      const level=value===0?0:Math.min(4,Math.max(1,Math.ceil(Math.sqrt(value/max)*4)));
      const text=`${key}\n${exact(daily.get(key)||0)} tokens${mode==='weekly'?`\n本周：${exact(value)} tokens`:mode==='cumulative'?`\n图中累计：${exact(value)} tokens`:''}`;
      cells+=date>today?'<span class="heat-cell blank"></span>':`<button class="heat-cell" style="background:${palette[level]}" data-tooltip="${escape(text)}" aria-label="${escape(text)}"></button>`;
    }
    weeks+=`<div class="heat-week">${cells}</div>`;
  }
  $('#heatmap').innerHTML=`<div class="heat-months">${months}</div><div class="heat-days"><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span></div><div class="heat-body">${weeks}</div>`;
  const active=[...daily.keys()].filter(k=>k>=dayKey(start)&&k<=dayKey(today)).length;
  $('#activity-summary').textContent=`过去一年活跃 ${active} 天${provider?' · '+(provider==='domestic'?'国内模型':providerName(provider)):''}${source?' · '+NAMES[source]:''}`;
}
function renderTrend(selected, models) {
  $('#chart-legend').innerHTML=models.map(m=>`<button class="legend-item ${hiddenModels.has(m.key)?'off':''}" data-model="${escape(m.key)}" aria-pressed="${!hiddenModels.has(m.key)}"><i class="color-dot" style="background:${m.color}"></i>${escape(m.name)}<span class="muted">${escape(NAMES[m.source])}</span></button>`).join('');
  $('#trend-total').textContent=`所选时段 ${compact(selected.reduce((s,r)=>s+r.total,0))} tokens`;
  if(!selected.length){$('#trend-chart').innerHTML='<div class="chart-empty"><strong>这个时段还没有用量记录</strong><span>试试选择更长时段，或到「数据来源」检查日志目录。</span></div>';return;}
  let start=days?dayOffset(new Date(),1-days):dayOffset(selected[0].timestamp,0),end=dayOffset(new Date(),0);
  const dates=[];for(let d=start;d<=end;d=dayOffset(d,1))dates.push(dayKey(d));
  const series=models.filter(m=>!hiddenModels.has(m.key)).map(m=>{const values=new Map();for(const r of selected)if(modelKey(r)===m.key){const k=dayKey(r.timestamp);values.set(k,(values.get(k)||0)+r.total);}return{...m,values};});
  const width=1200,height=250,left=58,right=14,top=13,bottom=33,pw=width-left-right,ph=height-top-bottom;
  let max=1;for(const m of series)for(const v of m.values.values())max=Math.max(max,v);
  max*=1.13;
  const x=i=>left+(dates.length>1?i/(dates.length-1):0.5)*pw,y=n=>top+ph-n/max*ph;
  let svg='';
  for(let i=0;i<4;i++){const val=max*i/3,yy=y(val);svg+=`<line x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}" stroke="#363638" stroke-dasharray="3 5"/><text x="${left-12}" y="${yy+4}" text-anchor="end" fill="#81818a" font-size="10">${escape(compact(Math.round(val)))}</text>`;}
  const count=Math.min(8,dates.length);
  for(let i=0;i<count;i++){const index=count===1?0:Math.round(i*(dates.length-1)/(count-1)),date=new Date(dates[index]+'T00:00:00');svg+=`<text x="${x(index)}" y="${height-7}" text-anchor="${i===0?'start':i===count-1?'end':'middle'}" fill="#8c8c95" font-size="11">${date.getMonth()+1}月${date.getDate()}日</text>`;}
  for(const m of series){const points=dates.map((date,i)=>`${x(i)},${y(m.values.get(date)||0)}`).join(' ');svg+=`<polyline points="${points}" fill="none" stroke="${m.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;if(dates.length===1)svg+=`<circle cx="${x(0)}" cy="${y(m.values.get(dates[0])||0)}" r="4" fill="${m.color}"/>`;}
  for(let i=0;i<dates.length;i++){const tips=`${dates[i]}\n`+series.map(m=>`${m.name}：${exact(m.values.get(dates[i])||0)}`).join('\n');const cellWidth=pw/Math.max(1,dates.length-1);svg+=`<rect x="${Math.max(left,x(i)-cellWidth/2)}" y="${top}" width="${Math.min(cellWidth,width-right-Math.max(left,x(i)-cellWidth/2))}" height="${ph}" fill="transparent" data-tooltip="${escape(tips)}"/>`;}
  $('#trend-chart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="每日各模型 Token 趋势">${svg}</svg>`;
}
function renderDistribution(summary) {
  const total=summary.totals.total,radius=77,circ=2*Math.PI*radius;
  let offset=0;
  const arcs=summary.models.map(m=>{const length=m.total/(total||1)*circ;const segment=`<circle cx="100" cy="100" r="${radius}" fill="none" stroke="${m.color}" stroke-width="27" stroke-dasharray="${Math.max(0,length-2)} ${circ-Math.max(0,length-2)}" stroke-dashoffset="${-offset}" data-tooltip="${escape(m.name+'\n'+exact(m.total)+' tokens')}"/>`;offset+=length;return segment;}).join('');
  $('#donut').innerHTML=`<svg viewBox="0 0 200 200" role="img" aria-label="模型 Token 占比"><circle cx="100" cy="100" r="${radius}" fill="none" stroke="#303033" stroke-width="27"/>${arcs}</svg><div class="donut-center"><strong>${total?escape(compact(total)):'—'}</strong><span>${total?'tokens':'暂无记录'}</span></div>`;
  $('#model-list').innerHTML=summary.models.length?summary.models.map(m=>`<div class="model-item"><i class="color-dot" style="background:${m.color}"></i><div><div class="model-name">${escape(m.name)}</div><div class="model-meta">${escape(providerName(providerFor(m.name,m.providerHint)))} · ${escape(NAMES[m.source])}</div><div class="model-meta">${escape(compact(m.total))} tokens</div></div><span class="model-share">${(m.total/total*100).toFixed(1)}%</span></div>`).join(''):'<p class="muted">读取到用量后，这里会显示模型分布。</p>';
  const fields=[['input','非缓存输入',COLORS[0]],['output','输出',COLORS[1]],['cacheRead','缓存读取',COLORS[2]],['cacheWrite','缓存写入',COLORS[3]]];
  $('#breakdown').innerHTML=fields.map(([field,label,color])=>`<div class="breakdown-row"><div class="breakdown-label"><span>${label}</span><strong>${total?compact(summary.totals[field]):'—'}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${summary.totals[field]/(total||1)*100}%;background:${color}"></div></div></div>`).join('');
}
function renderModels(all) {
  const summary=aggregate(all);
  $('#model-table').innerHTML=summary.models.map(m=>`<tr><td><i class="color-dot" style="background:${m.color}"></i> ${escape(m.name)}<small>${escape(providerName(providerFor(m.name,m.providerHint)))} · ${escape(NAMES[m.source])}</small></td><td>${exact(m.count)}</td><td>${compact(m.input)}</td><td>${compact(m.output)}</td><td>${compact(m.cacheRead)}</td><td>${compact(m.cacheWrite)}</td><td>${compact(m.total)}</td></tr>`).join('')||'<tr><td colspan="7">还没有可统计的记录，请到「数据来源」检查本机日志。</td></tr>';
}
function renderSources() {
  // Always use real records here, even while the overview is in demo mode.
  $('#domestic-platforms').innerHTML=providerUsage(snapshot.records).map(p=>`<article class="domestic-card" data-provider-card="${p.id}"><div class="domestic-card-heading"><h3>${escape(p.name)}</h3><span class="source-badge ${p.count?'':'unavailable'}">${p.count?'已采集真实用量':'等待真实数据'}</span></div><p>${escape(p.models)}</p><div class="domestic-value">${p.count?escape(compact(p.total))+' <small>真实 tokens</small>':'<span class="no-data">暂无真实用量</span>'}</div><div class="domestic-status">已采集：${p.count?exact(p.count)+' 条服务端用量记录':'尚无有效记录'}</div><div class="domestic-status capture-evidence">采集途径：本地日志 / 网页 usage / 导入</div></article>`).join('');
  $('#auto-refresh').checked=settings.autoRefresh;
  $('#sources-list').innerHTML=snapshot.sources.map(s=>{
    const status=s.unsupported?'需其他接入方式':!s.enabled?'已停用':s.errors.length?'读取有提示':s.records?'已读取':s.managed?'等待采集':s.files?'暂无用量':'未发现记录';
    if(s.managed)return `<section class="source-card"><div class="source-top"><h2>${escape(s.name)}</h2><span class="source-badge ${s.records?'':'unavailable'}">${status}</span></div><p>${escape(s.detail)}</p><div class="source-total">${exact(s.records)} 条记录 · ${compact(s.total)} tokens · 通过上方采集面板管理</div></section>`;
    return `<section class="source-card"><div class="source-top"><div class="source-name"><h2>${escape(s.name)}</h2><span class="source-badge ${s.unsupported||!s.records?'unavailable':''}">${status}</span></div>${s.unsupported?'':`<label class="switch"><input type="checkbox" data-source-toggle="${s.id}" ${s.enabled?'checked':''}><span></span><span class="sr-only">启用 ${escape(s.name)}</span></label>`}</div><p>${escape(s.detail)}</p>${s.unsupported?'':`<div class="source-path">${s.paths.map(escape).join('<br>')}</div><div class="source-controls"><button class="button" data-choose="${s.id}">更换文件夹</button>${settings.paths[s.id]?`<button class="button subtle" data-reset="${s.id}">恢复默认</button>`:''}<span class="source-total">${s.files} 个文件 · ${exact(s.records)} 条记录 · ${compact(s.total)} tokens</span></div>`}${s.errors.length?`<div class="source-error">${s.errors.slice(0,8).map(escape).join('\n')}${s.errors.length>8?'\n另有 '+(s.errors.length-8)+' 条提示':''}</div>`:''}</section>`;
  }).join('');
  $('#source-count').textContent=snapshot.sources.filter(s=>s.records>0).length;
}
function render() {
  const vendorRecords=records().filter(r=>matchesProvider(r,provider));
  const all=vendorRecords.filter(r=>!source||r.source===source), selected=selectRecords(vendorRecords,source,days), summary=aggregate(selected);
  renderStats(all);renderHeatmap(all);renderTrend(selected,summary.models);renderDistribution(summary);renderModels(records());renderSources();
  $('#demo-banner').hidden=!demo;
  $('#export').disabled=demo||busy;
  $('#range-caption').textContent=days?`${dayKey(dayOffset(new Date(),1-days))} — ${dayKey(new Date())}`:'全部历史记录';
  const present=Object.keys(NAMES).filter(id=>records().some(r=>r.source===id));
  $('#source-filter').innerHTML='<option value="">全部工具</option>'+present.map(id=>`<option value="${id}" ${source===id?'selected':''}>${NAMES[id]}</option>`).join('');
  $('#provider-filter').innerHTML='<option value="">全部厂商</option><option value="domestic">国内模型</option><optgroup label="国内 AI">'+DOMESTIC_PROVIDERS.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('')+'</optgroup><optgroup label="其他"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="google">Google</option><option value="unknown">未识别厂商</option></optgroup>';
  $('#provider-filter').value=provider;
  $('#provider-empty').hidden=!provider||!!all.length;
  $('#provider-empty').textContent=`${provider==='domestic'?'国内模型':providerName(provider)}：当前条件下尚未采集到真实用量。可在「数据来源」连接网页采集或导入带 usage 的响应记录；缺少用量字段的数据不计数。`;
  $('#sync-status').textContent=demo?'示例数据 · 自动刷新已暂停':snapshot.updatedAt?`上次读取 ${new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN')} · ${exact(snapshot.records.length)} 条用量记录${settings.autoRefresh?' · 每分钟刷新':''}`:'尚未读取本地记录';
}
async function refresh() {
  if(busy)return;
  if(!bridge){$('#notice').hidden=false;$('#notice').textContent='浏览器预览无法访问本地记录。请使用 Windows 桌面程序，或点击「查看示例」预览界面。';render();return;}
  busy=true;$('#refresh').disabled=true;$('#refresh-icon').textContent='⋯';$('#sync-status').textContent='正在读取本地用量记录…';
  try {snapshot=await bridge.scan();$('#notice').hidden=true;render();}
  catch(e){$('#notice').hidden=false;$('#notice').textContent=`读取失败：${e.message}。请在「数据来源」检查目录后重试。`;$('#sync-status').textContent='读取失败';}
  finally{busy=false;$('#refresh').disabled=false;$('#refresh-icon').textContent='↻';$('#export').disabled=demo;}
}
async function saveSettings() {
  if(!bridge)return;
  try{settings=await bridge.updateSettings(settings);await refresh();}catch(e){toast('设置未保存：'+e.message);}
}
function setPage(next){page=next;for(const p of ['overview','models','sources'])$(`#${p}-page`).hidden=p!==next;$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===next));$('#page-title').textContent=next==='sources'?'连接你的 AI 工具。':next==='models'?'看清每个模型的用量。':'每一次使用，都有迹可循。';$('#page-subtitle').textContent=next==='sources'?'从本机记录自动汇总，了解每个数据源的接入状态。':next==='models'?'查看不同模型的输入、输出与缓存，基于全部历史记录。':'把分散在不同 AI 工具中的 Token，汇集在一处。';}
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
$('.brand').addEventListener('click',e=>{e.preventDefault();setPage('overview');});
$('#refresh').addEventListener('click',async()=>{if(demo){demo=false;source='';provider='';hiddenModels.clear();}await refresh();});
$('#demo').addEventListener('click',()=>{demo=!demo;source='';provider='';hiddenModels.clear();render();});
$('#exit-demo').addEventListener('click',()=>{demo=false;source='';provider='';hiddenModels.clear();render();});
$('#range').addEventListener('click',e=>{const b=e.target.closest('[data-days]');if(!b)return;days=Number(b.dataset.days);$$('#range button').forEach(x=>x.classList.toggle('selected',x===b));render();});
$('#activity-mode').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b)return;mode=b.dataset.mode;$$('#activity-mode button').forEach(x=>x.classList.toggle('selected',x===b));render();});
$('#source-filter').addEventListener('change',e=>{source=e.target.value;hiddenModels.clear();render();});
$('#provider-filter').addEventListener('change',e=>{provider=e.target.value;hiddenModels.clear();render();});
$('#chart-legend').addEventListener('click',e=>{const b=e.target.closest('[data-model]');if(!b)return;const key=b.dataset.model;hiddenModels.has(key)?hiddenModels.delete(key):hiddenModels.add(key);render();});
$('#auto-refresh').addEventListener('change',async e=>{settings.autoRefresh=e.target.checked;await saveSettings();});
$('#sources-list').addEventListener('change',async e=>{if(!e.target.dataset.sourceToggle)return;settings.enabled[e.target.dataset.sourceToggle]=e.target.checked;await saveSettings();});
$('#sources-list').addEventListener('click',async e=>{
  const choose=e.target.closest('[data-choose]'),reset=e.target.closest('[data-reset]');if(!choose&&!reset)return;
  if(!bridge){toast('请在桌面程序中选择本机目录');return;}
  try{const next=choose?await bridge.chooseFolder(choose.dataset.choose):await bridge.resetFolder(reset.dataset.reset);if(next){settings=next;await refresh();}}
  catch(err){toast('目录设置失败：'+err.message);}
});
$('#export').addEventListener('click',async()=>{
  if(!bridge||demo){toast('请在桌面程序中导出真实用量');return;}
  const filter=page==='overview'?{source,provider,start:days?dayOffset(new Date(),1-days).toISOString():undefined,end:dayOffset(new Date(),1).toISOString()}:{};
  try{if(await bridge.exportCSV(filter))toast('用量记录已导出');}catch(e){toast('导出失败：'+e.message);}
});
const tooltip=$('#tooltip');
function showUpdate(s){
  $('#app-version').textContent=s.currentVersion;$('#updates-current').textContent=`当前版本 ${s.currentVersion}`;
  const labels={idle:'检查是否有新版本',checking:'正在连接 GitHub…',unpublished:'暂未发布更新',current:'当前已是最新版本',available:`发现新版本 ${s.availableVersion}`,downloading:`正在下载 ${s.progress}%`,ready:'下载完成，校验已通过',installing:'正在更新，应用即将重启',error:'更新未完成'};
  $('#updates-message').textContent=labels[s.status]||'应用更新';
  $('#updates-detail').textContent=s.error||(s.status==='ready'?(s.canInstall?'点击“更新并重启”，将保留使用记录和设置。':'请使用免安装 EXE 运行，才能覆盖更新原程序。'):s.status==='unpublished'?'仓库尚未提供 Token Atlas 的正式发布包。':'');
  $('#updates-notes').textContent=s.notes||'';$('#updates-progress').hidden=s.status!=='downloading';$('#updates-progress').value=s.progress;
  $('#updates-check').disabled=['checking','downloading','installing'].includes(s.status);
  $('#updates-download').hidden=!(['available','error'].includes(s.status)&&s.availableVersion);
  $('#updates-install').hidden=s.status!=='ready';$('#updates-install').disabled=!s.canInstall;
  $('#updates-open').textContent=['available','ready'].includes(s.status)?`有新版本 ${s.availableVersion}`:'检查更新';
}
$('#updates-open').addEventListener('click',async()=>{$('#updates-dialog').showModal();if(!bridge?.checkUpdate){$('#updates-message').textContent='请在桌面应用中检查更新';return;}showUpdate(await bridge.checkUpdate());});
$('#updates-close').addEventListener('click',()=>$('#updates-dialog').close());
$('#updates-check').addEventListener('click',async()=>{if(bridge?.checkUpdate)showUpdate(await bridge.checkUpdate());});
$('#updates-download').addEventListener('click',async()=>{try{showUpdate(await bridge.downloadUpdate());}catch(e){toast('下载失败：'+e.message);}});
$('#updates-install').addEventListener('click',async()=>{try{await bridge.installUpdate();}catch(e){toast('更新失败：'+e.message);}});
let captureRunning=false;
async function updateCapture(status){captureRunning=status.running;$('#capture-state').textContent=status.running?'采集中 · 仅监听本机':'网页采集未启动';$('#capture-toggle').textContent=status.running?'停止网页采集':'启动网页采集';$('#capture-url').value=status.url;}
$('#capture-toggle').addEventListener('click',async()=>{if(!bridge?.startCapture){toast('请在桌面程序中使用采集功能');return;}try{await updateCapture(await (captureRunning?bridge.stopCapture():bridge.startCapture()));}catch(e){toast('采集启动失败：'+e.message);}});
$('#capture-copy').addEventListener('click',async()=>{if(!bridge?.copyPairing)return;await bridge.copyPairing();toast('配对码已复制，只需粘贴到本机采集扩展');});
$('#capture-extension').addEventListener('click',async()=>{if(!bridge?.openExtension)return;try{await bridge.openExtension();toast('扩展文件夹已打开，请在浏览器中加载');}catch(e){toast('打开失败：'+e.message);}});
$('#capture-import').addEventListener('click',async()=>{if(!bridge?.importUsage)return;const button=$('#capture-import');button.disabled=true;try{const r=await bridge.importUsage();if(r){toast(r.found?`已新增 ${r.added} 条真实用量（其余为重复或缺少时间/标识的记录）`:'文件中未找到有效 usage 字段，未产生估算数据');await refresh();}}catch(e){toast('导入失败：'+e.message);}finally{button.disabled=false;}});
function showTip(target,x,y){tooltip.textContent=target.dataset.tooltip;tooltip.hidden=false;tooltip.style.left=Math.min(window.innerWidth-tooltip.offsetWidth-12,Math.max(10,x+12))+'px';tooltip.style.top=Math.min(window.innerHeight-tooltip.offsetHeight-12,Math.max(10,y+15))+'px';}
document.addEventListener('pointermove',e=>{const target=e.target.closest('[data-tooltip]');if(!target){tooltip.hidden=true;return;}showTip(target,e.clientX,e.clientY);});
document.addEventListener('focusin',e=>{const target=e.target.closest('[data-tooltip]');if(target){const rect=target.getBoundingClientRect();showTip(target,rect.x,rect.bottom);}});
document.addEventListener('focusout',()=>tooltip.hidden=true);
document.addEventListener('pointerleave',()=>tooltip.hidden=true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')tooltip.hidden=true;});
$('#today-label').textContent=new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
render();
try{if(bridge){settings=await bridge.getSettings();if(bridge.captureStatus)await updateCapture(await bridge.captureStatus());bridge.onCapture?.(()=>refresh());if(bridge.updateStatus)showUpdate(await bridge.updateStatus());bridge.onUpdate?.(showUpdate);}await refresh();}catch(e){toast('初始化失败：'+e.message);}
setInterval(()=>{if(settings.autoRefresh&&!demo&&!document.hidden)refresh();},60000);
