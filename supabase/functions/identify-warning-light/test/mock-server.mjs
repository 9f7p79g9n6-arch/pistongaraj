// Sahte Supabase (auth, PostgREST) ve sahte Anthropic API. Senaryo MOCK_SCENARIO ile seçilir.
import http from 'node:http';
const port = Number(process.argv[2] ?? 54400);
const state = { scenario: 'ok', anthropicRequests: [], usageInserts: 0 };
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const body = await readBody(req);
  const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  if (url.pathname === '/__scenario') { state.scenario = url.searchParams.get('s'); state.anthropicRequests = []; state.usageInserts = 0; return send(res, 200, {}); }
  if (url.pathname === '/__state') return send(res, 200, state);
  if (url.pathname === '/auth/v1/user') {
    if (!(req.headers.authorization ?? '').includes('good-token')) return send(res, 401, { msg: 'bad jwt' });
    return send(res, 200, { id: '00000000-0000-0000-0000-00000000000a', aud: 'authenticated', role: 'authenticated', email: 'a@example.test' });
  }
  if (url.pathname === '/rest/v1/consents') {
    const rows = state.scenario === 'no_consent' ? [] : [{ granted: true }];
    return single ? (rows.length ? send(res, 200, rows[0]) : send(res, 406, { code: 'PGRST116', message: 'no rows' })) : send(res, 200, rows);
  }
  if (url.pathname === '/rest/v1/rpc/ai_quota') {
    const row = state.scenario === 'quota' ? { used: 10, monthly_limit: 10 } : { used: 2, monthly_limit: 10 };
    return send(res, 200, single ? row : [row]);
  }
  if (url.pathname === '/rest/v1/ai_usage' && req.method === 'POST') { state.usageInserts++; return send(res, 201, null); }
  if (url.pathname === '/v1/messages') {
    state.anthropicRequests.push({ headers: req.headers, body: JSON.parse(body) });
    if (state.scenario === 'refusal') return send(res, 200, { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: null }, usage: { input_tokens: 10, output_tokens: 0 } });
    const result = state.scenario === 'unknown_enum'
      ? { image_quality: 'ok', lights: [{ catalog_id: 'not_a_light', color: 'red', blinking: 'no', confidence: 'high', description: 'x', meaning_if_unknown: '' }] }
      : { image_quality: 'ok', lights: [
          { catalog_id: 'check_engine', color: 'amber', blinking: 'unknown', confidence: 'high', description: 'Motor silüeti', meaning_if_unknown: 'yok sayılmalı' },
          { catalog_id: 'unknown', color: 'red', blinking: 'unknown', confidence: 'low', description: 'Ünlemli dişli', meaning_if_unknown: 'Şanzıman arızası olabilir.' } ] };
    return send(res, 200, { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify(result) }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 150 } });
  }
  send(res, 404, { error: 'mock: ' + req.method + ' ' + url.pathname });
}).listen(port, () => console.log('mock on', port));
