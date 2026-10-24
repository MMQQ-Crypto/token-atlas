export const COLORS = ['#6b9df7', '#75c498', '#a18aee', '#edaa6a', '#df788b', '#71c3d5', '#c5bb78', '#a3a9b5'];
export const NAMES = { deepseek_desktop:'DeepSeek 桌面端',browser:'网页响应采集',imported:'导入的真实用量',codex: 'Codex', claude: 'Claude Code', cline: 'Cline', roo: 'Roo Code', kilo: 'Kilo Code' };
export const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const modelKey=r=>`${r.source}::${r.model}::${r.providerHint||''}`;
export function dayOffset(date, offset) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()+offset); return d; }
export function compact(n) { return n >= 1e8 ? (n/1e8).toLocaleString('zh-CN',{maximumFractionDigits:2})+' 亿' : n >= 1e4 ? (n/1e4).toLocaleString('zh-CN',{maximumFractionDigits:1})+' 万' : n.toLocaleString('zh-CN'); }
export function aggregate(records) {
  const daily = new Map(), models = new Map(), sessions = new Set();
  const totals = {input:0,output:0,cacheRead:0,cacheWrite:0,total:0};
  for (const r of records) {
    const key = dayKey(r.timestamp);
    daily.set(key, (daily.get(key)||0)+r.total);
    sessions.add(`${r.source}:${r.session}`);
    const mk = modelKey(r);
    if (!models.has(mk)) models.set(mk, {key:mk, source:r.source, name:r.model,providerHint:r.providerHint, count:0, input:0,output:0,cacheRead:0,cacheWrite:0,total:0});
    const m = models.get(mk); m.count++;
    for (const field of Object.keys(totals)) { totals[field] += r[field]; m[field] += r[field]; }
  }
  const sortedDays = [...daily.keys()].sort();
  let longest = 0, run = 0, previous;
  for (const day of sortedDays) { const d = new Date(day+'T00:00:00'); run = previous && dayKey(dayOffset(d,-1))===previous ? run+1 : 1; longest=Math.max(longest,run); previous=day; }
  let current = 0, cursor = dayOffset(new Date(),0);
  if (!daily.has(dayKey(cursor))) cursor=dayOffset(cursor,-1);
  while (daily.has(dayKey(cursor))) { current++; cursor=dayOffset(cursor,-1); }
  const list = [...models.values()].sort((a,b)=>b.total-a.total).map((m,i)=>({...m,color:COLORS[i%COLORS.length]}));
  return {daily, models:list, totals, sessions:sessions.size, longest, current, peak:Math.max(0,...daily.values())};
}
export function selectRecords(records, source, days, now=new Date()) {
  const start = days ? dayOffset(now,1-days).getTime() : -Infinity;
  const end = dayOffset(now,1).getTime();
  return records.filter(r=>(!source||r.source===source)&&new Date(r.timestamp).getTime()>=start&&new Date(r.timestamp).getTime()<end);
}
export function demoData() {
  const records=[], today=dayOffset(new Date(),0);
  const models=[['codex','gpt-6.1-sol'],['claude','claude-sonnet-4-6'],['cline','deepseek-chat'],['roo','glm-4.7'],['kilo','qwen3-coder'],['cline','kimi-k2'],['roo','doubao-seed-1.6'],['kilo','ernie-4.5'],['cline','MiniMax-M2'],['roo','hunyuan-turbo'],['kilo','spark-max']];
  for (let i=364;i>=0;i--) {
    if ((i*13)%17<5 && i>2) continue;
    models.forEach(([source,model],j)=>{
      if ((i+j*3)%7===0) return;
      const total=Math.round((Math.sin(i*1.17+j)+1.3)*Math.max(0.4,5-j*0.4)*240000*(i<30?2:0.5));
      const input=Math.floor(total*0.23),output=Math.floor(total*0.09),cacheRead=Math.floor(total*0.66),cacheWrite=total-input-output-cacheRead;
      const date=dayOffset(today,-i);date.setHours(12,j*5);
      records.push({id:`demo:${i}:${j}`,source,model,session:`demo-${i}-${j}`,timestamp:date.toISOString(),input,output,cacheRead,cacheWrite,total});
    });
  }
  return records;
}
