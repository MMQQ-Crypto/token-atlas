import {NAMES,selectRecords,isSystemUsage} from './analytics.mjs';
import {providerFor,matchesProvider} from './providers.mjs';
const modelCount=records=>new Set(records.filter(r=>!isSystemUsage(r)).map(r=>r.model).filter(m=>m&&m!=='未知模型')).size;
export function applicationUsage(sources,records,now=new Date()){
  const catalog=new Map(sources.map(s=>[s.id,s]));
  for(const r of records)if(!catalog.has(r.source))catalog.set(r.source,{id:r.source,name:NAMES[r.source]||r.source,detected:true,enabled:true,managed:true});
  return [...catalog.values()].filter(s=>s.detected||s.files>0||s.records>0||records.some(r=>r.source===s.id)).map(s=>{
    const rows=records.filter(r=>r.source===s.id),sum=days=>selectRecords(rows,'',days,now).reduce((n,r)=>n+r.total,0);
    return {...s,records:s.records??rows.length,paths:s.paths??[],errors:s.errors??[],hasUsage:rows.length>0,today:sum(1),week:sum(7),month:sum(30),total:sum(0),models:modelCount(rows)};
  }).sort((a,b)=>Number(b.hasUsage)-Number(a.hasUsage)||b.total-a.total||a.name.localeCompare(b.name));
}
export function scopedRecords(records,{source='',provider='',days=7,now=new Date()}={}){
  return selectRecords(records,source,days,now).filter(r=>matchesProvider(r,provider));
}
export function usageCounts(records){return {models:modelCount(records),applications:new Set(records.map(r=>r.source)).size,providers:new Set(records.map(r=>providerFor(r.model,r.providerHint)).filter(p=>p!=='unknown')).size,requests:records.length};}
