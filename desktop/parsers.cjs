const number = v => Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : 0;
function makeRecord({ id, source, session, timestamp, model, input, output, cacheRead, cacheWrite }) {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return null;
  const r = { id, source, session, timestamp: new Date(time).toISOString(), model: String(model || '未知模型'),
    input: number(input), output: number(output), cacheRead: number(cacheRead), cacheWrite: number(cacheWrite) };
  r.total = r.input + r.output + r.cacheRead + r.cacheWrite;
  return r.total > 0 ? r : null;
}
function createCodexParser(file) {
  let model = '未知模型', session = file, previous = {}, sequence = 0;
  return obj => {
    const p = obj.payload || {};
    if (obj.type === 'session_meta') session = p.id || file;
    if (obj.type === 'turn_context') model = p.model || model;
    if (obj.type !== 'event_msg' || p.type !== 'token_count' || !p.info) return null;
    const cumulative = p.info.total_token_usage;
    const last = p.info.last_token_usage;
    let u;
    if (cumulative) {
      const fields = ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_write_input_tokens'];
      // The total is cumulative; repeated rate-limit events carry the same total.
      const reset = fields.some(k => number(cumulative[k]) < number(previous[k]));
      u = Object.fromEntries(fields.map(k => [k, Math.max(0, number(cumulative[k]) - (reset ? 0 : number(previous[k])))]));
      previous = cumulative;
    } else if (last) u = last;
    else return null;
    const read = Math.min(number(u.cached_input_tokens), number(u.input_tokens));
    // Codex input_tokens already includes cached reads. Reasoning is part of output.
    return makeRecord({ id: `codex:${session}:${sequence++}`, source: 'codex', session,
      timestamp: obj.timestamp, model, input: Math.max(0, number(u.input_tokens) - read),
      output: u.output_tokens, cacheRead: read, cacheWrite: u.cache_write_input_tokens });
  };
}
function parseClaude(obj, file, index) {
  const msg = obj.message;
  if (obj.type !== 'assistant' || !msg?.usage) return null;
  const u = msg.usage;
  return makeRecord({ id: `claude:${obj.requestId || ''}:${msg.id || obj.uuid || `${file}:${index}`}`,
    source: 'claude', session: obj.sessionId || file, timestamp: obj.timestamp, model: msg.model,
    input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens,
    cacheWrite: u.cache_creation_input_tokens });
}
function parseCline(messages, file, source) {
  const records = [];
  if (!Array.isArray(messages)) throw new Error('用量文件应为 JSON 数组');
  messages.forEach((message, i) => {
    if (message.say !== 'api_req_started' || typeof message.text !== 'string') return;
    let u;
    try { u = JSON.parse(message.text); } catch { return; }
    // ui_messages does not reliably store the model used for each request.
    const r = makeRecord({ id: `${source}:${file}:${message.ts || i}`, source, session: file,
      timestamp: message.ts, model: u.model || u.modelId || '未知模型', input: u.tokensIn,
      output: u.tokensOut, cacheRead: u.cacheReads, cacheWrite: u.cacheWrites });
    if (r) records.push(r);
  });
  return records;
}
function deduplicate(records) {
  const map = new Map();
  for (const r of records) {
    // Streaming Claude entries may repeat the same message with a newer usage.
    const old = map.get(r.id);
    if (!old || r.total >= old.total) map.set(r.id, r);
  }
  return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
function createDeepSeekParser(file) {
  let session=file,model='未知模型',lastSlot=null,attempts=new Map();
  return obj=>{
    const d=obj.data||{};
    if(obj.type==='session'){session=obj.id||file;return null;}
    if(obj.type==='request/header')model=d.header?.config?.model||model;
    if(obj.type==='request/context')model=d.model||model;
    const step=`${d.turn}:${d.step}`;
    if(obj.type==='llm/retry-started'){attempts.set(step,(attempts.get(step)||0)+1);lastSlot=null;return null;}
    if(!['assistant/message','assistant/attempt'].includes(obj.type))return null;
    // Read provider settlement usage only. Surface/context token estimates are ignored.
    const u=d.usage || [...(Array.isArray(d.stream)?d.stream:[])].reverse().find(s=>s.chunk?.type==='usage')?.chunk?.usage;
    if(!u || !Number.isSafeInteger(u.inputTokens) || !Number.isSafeInteger(u.outputTokens))return null;
    const slot=`${session}:${step}:${attempts.get(step)||0}`;
    const r=makeRecord({id:`dsh:${d.message?.id||slot}`,source:'deepseek_desktop',session,timestamp:obj.time,
      model:d.message?.source?.model||model,input:u.inputTokens,output:u.outputTokens,cacheRead:u.cacheReadTokens,cacheWrite:u.cacheWriteTokens});
    if(!r)return null;
    // A repeated settlement replaces the same attempt, even if the correction is lower.
    if(lastSlot?.key===slot){Object.assign(lastSlot.record,r);return null;}
    lastSlot={key:slot,record:r};return r;
  };
}
module.exports = { createCodexParser, createDeepSeekParser, parseClaude, parseCline, deduplicate, makeRecord };
