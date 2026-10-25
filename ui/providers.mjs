// Classifies the model's developer, not the service that billed the request.
// Opaque endpoint IDs and arbitrary aliases remain unknown.
export const DOMESTIC_PROVIDERS = [
  {id:'deepseek',name:'DeepSeek',models:'DeepSeek 系列',pattern:/^deepseek(?:[-_.]|$)/i},
  {id:'qwen',name:'通义千问',models:'Qwen / QwQ / QVQ 系列',pattern:/^(?:qwen|qwq|qvq)(?:\d|[-_.]|$)/i},
  {id:'zhipu',name:'智谱 GLM',models:'GLM / ChatGLM 系列',pattern:/^(?:glm|chatglm)(?:\d|[-_.]|$)/i},
  {id:'moonshot',name:'Kimi / 月之暗面',models:'Kimi / Moonshot 系列',pattern:/^(?:kimi|moonshot)(?:\d|[-_.]|$)/i},
  {id:'doubao',name:'豆包 / 字节跳动',models:'Doubao / Seed 系列',pattern:/^(?:doubao|seed)(?:\d|[-_.]|$)/i},
  {id:'ernie',name:'文心一言 / 百度',models:'ERNIE 系列',pattern:/^ernie(?:\d|[-_.]|$)/i},
  {id:'minimax',name:'MiniMax',models:'MiniMax 系列',pattern:/^minimax(?:\d|[-_.]|$)/i},
  {id:'hunyuan',name:'腾讯混元',models:'Hunyuan / Hy 系列',pattern:/^(?:hunyuan(?:\d|[-_.]|$)|hy\d+(?:[-_.]|$))/i},
  {id:'spark',name:'讯飞星火',models:'Spark 系列',pattern:/^spark(?:\d|[-_.]|$)/i},
  {id:'stepfun',name:'阶跃星辰',models:'Step 系列',pattern:/^step(?:\d|[-_.]|$)/i},
  {id:'baichuan',name:'百川智能',models:'Baichuan 系列',pattern:/^baichuan(?:\d|[-_.]|$)/i},
  {id:'yi',name:'零一万物',models:'Yi 系列',pattern:/^yi(?:\d|[-_.]|$)/i}
];
export const FOREIGN_PROVIDERS = [
  {id:'openai',name:'OpenAI',models:'GPT / o 系列（含 Codex），按应用分别统计',pattern:/^(?:gpt(?:\d|[-_.])|chatgpt(?:[-_.]|$)|codex(?:[-_.]|$)|o[134](?:[-_.]|$))/i},
  {id:'anthropic',name:'Anthropic / Claude',models:'Claude 系列',pattern:/^claude(?:[-_.]|$)/i},
  {id:'google',name:'Google / Gemini',models:'Gemini / Gemma 系列',pattern:/^(?:gemini|gemma)(?:\d|[-_.]|$)/i},
  {id:'xai',name:'xAI / Grok',models:'Grok 系列',pattern:/^grok(?:\d|[-_.]|$)/i},
  {id:'meta',name:'Meta / Llama',models:'Llama 系列',pattern:/^(?:meta[-_.])?llama(?:\d|[-_.]|$)/i},
  {id:'mistral',name:'Mistral / Le Chat',models:'Mistral / Mixtral / Codestral 等系列',pattern:/^(?:mistral|mixtral|codestral|magistral|ministral|devstral|pixtral|voxtral)(?:\d|[-_.]|$)/i},
  {id:'cohere',name:'Cohere',models:'Command / Aya 系列',pattern:/^(?:command|aya)(?:\d|[-_.]|$)/i},
  {id:'perplexity',name:'Perplexity / Sonar',models:'Sonar 系列',pattern:/^sonar(?:\d|[-_.]|$)/i},
  {id:'amazon',name:'Amazon / Nova',models:'Nova / Titan 系列',pattern:/^(?:amazon\.)?(?:nova|titan)(?:\d|[-_.]|$)/i},
  {id:'microsoft',name:'Microsoft / Copilot',models:'Phi 系列；Copilot 按网页来源归类',pattern:/^phi(?:\d|[-_.]|$)/i}
];
export const ALL_PROVIDERS = [...FOREIGN_PROVIDERS.map(p=>({...p,region:'foreign'})),...DOMESTIC_PROVIDERS.map(p=>({...p,region:'domestic'}))];
export function providerFor(model,hint) {
  const parts=String(model || '').trim().split('/');
  const name=parts.at(-1);
  return ALL_PROVIDERS.find(p=>p.pattern.test(name))?.id || (ALL_PROVIDERS.some(p=>p.id===hint)?hint:'unknown');
}
export function providerName(id) {return id==='domestic'?'国内模型':id==='foreign'?'国外模型':ALL_PROVIDERS.find(p=>p.id===id)?.name || '未识别厂商';}
export function matchesProvider(record, filter) {
  if(!filter)return true;
  const id=providerFor(record.model,record.providerHint);
  return ['domestic','foreign'].includes(filter)?ALL_PROVIDERS.some(p=>p.id===id&&p.region===filter):id===filter;
}
export function providerUsage(records,region='all') {
  return ALL_PROVIDERS.filter(p=>region==='all'||p.region===region).map(p=>{
    const rows=records.filter(r=>providerFor(r.model,r.providerHint)===p.id);
    return {id:p.id,name:p.name,models:p.models,region:p.region,count:rows.length,total:rows.reduce((sum,r)=>sum+r.total,0),applications:[...new Set(rows.map(r=>r.source))]};
  });
}
