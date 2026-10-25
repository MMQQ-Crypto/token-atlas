import {aggregate,dayOffset,selectRecords} from './analytics.mjs';
import {matchesProvider} from './providers.mjs';

// Usage metadata only: no paths, request IDs, chat content or credentials.
export function reconcileUsage(snapshot,{source='',provider='',days=7,now=new Date()}={}){
  const matching=(snapshot.records||[]).filter(r=>(!source||r.source===source)&&matchesProvider(r,provider));
  const lifetime=selectRecords(matching,'',0,now),current=selectRecords(matching,'',days,now);
  const summary=aggregate(current),times=lifetime.map(r=>r.timestamp).sort();
  return {
    generatedAt:now.toISOString(),scope:{source,provider,days,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,
      start:days?dayOffset(now,1-days).toISOString():null,endExclusive:dayOffset(now,1).toISOString()},
    periods:Object.fromEntries([['today',1],['week',7],['month',30],['lifetime',0]].map(([key,n])=>[key,selectRecords(matching,'',n,now).reduce((sum,r)=>sum+r.total,0)])),
    current:{records:current.length,...summary.totals},coverage:{records:lifetime.length,first:times[0]||null,last:times.at(-1)||null},
    sources:(snapshot.sources||[]).filter(s=>source?s.id===source:s.detected||s.records||s.errors?.length).map(s=>({
      id:s.id,name:s.name,enabled:s.enabled!==false,files:s.files||0,records:s.records||0,total:s.total||0,
      readWarnings:s.errors?.length||0,...(s.diagnostics?{diagnostics:{...s.diagnostics}}:{})})),
    system:{...summary.system},
    models:summary.models.filter(m=>!m.system).map(m=>({source:m.source,model:m.name,records:m.count,input:m.input,output:m.output,cacheRead:m.cacheRead,cacheWrite:m.cacheWrite,total:m.total})),
    systemUsage:summary.models.filter(m=>m.system).map(m=>({source:m.source,label:m.label,logModel:m.name,model:null,records:m.count,input:m.input,output:m.output,cacheRead:m.cacheRead,cacheWrite:m.cacheWrite,total:m.total})),
    daily:[...summary.daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,total])=>({date,total})),
    notes:[
      '统计范围为本机及已连接/导入记录，不是智谱等平台的账号额度或跨设备完整账单。',
      'OpenAI 是模型供应商汇总，可包括 Codex 等应用；不等于 ChatGPT 网页或客户端单独的用量。',
      'Codex 是来源应用，GPT 等名称是日志中的模型。codex-auto-review 单列为系统审核记录，实际模型未披露，不计入已识别模型数；其 Token 保留在总量内。',
      '四个时间范围均采用同一应用和供应商筛选；累计为仍可读取的记录，按本机时区截止今天。',
      '总 Token 含缓存读写，已包含的推理不再相加。ZCode 以 computed_total_tokens 与其用量界面保持一致。',
      '来源读取与跳过计数覆盖整个来源，不受当前供应商或日期筛选；跳过的记录未计入用量。',
      'ZCode 官方实现保留最近 30 天的逐请求记录；清理掉的历史和其他电脑的记录需要另行提供。'
    ]
  };
}

export function reconciliationText(report){
  const n=value=>value.toLocaleString('zh-CN'),when=value=>value?new Date(value).toLocaleString('zh-CN'):'无记录';
  const r=report.current,p=report.periods;
  return [
    `今日：${n(p.today)} tokens`, `近 7 天：${n(p.week)} tokens`, `近 30 天：${n(p.month)} tokens`, `累计可读记录：${n(p.lifetime)} tokens`,
    '',`当前筛选：${n(r.records)} 条记录 / ${n(r.total)} tokens`,
    `非缓存输入 ${n(r.input)} + 输出 ${n(r.output)} + 缓存读取 ${n(r.cacheRead)} + 缓存写入 ${n(r.cacheWrite)}`,
    `其中系统审核：${n(report.system.records)} 条 / ${n(report.system.total)} tokens（已含在总量中；实际模型未披露）`,
    '',`累计记录起点：${when(report.coverage.first)}`,`累计记录终点：${when(report.coverage.last)}`,`时区：${report.scope.timeZone}`,
    '', '来源读取情况（整个来源）：',
    ...report.sources.map(s=>`${s.name}：${s.enabled?'已启用':'已停用'} / ${n(s.files)} 个文件 / ${n(s.records)} 条记录 / ${n(s.total)} tokens / ${n(s.readWarnings)} 项读取提示${s.diagnostics?('skippedComputedTokens'in s.diagnostics?`\n  跳过 ${n(s.diagnostics.skippedRows)} 条，涉及数据库计算总数 ${n(s.diagnostics.skippedComputedTokens)} tokens；两类总数不同 ${n(s.diagnostics.totalsDisagreeRows)} 条`:`\n  原始用量行 ${n(s.diagnostics.usageRows)} 条；接受 ${n(s.diagnostics.acceptedRows)} 条；跳过无效用量 ${n(s.diagnostics.skippedRows)} 条`):''}`),
    '',...report.notes
  ].join('\n');
}
