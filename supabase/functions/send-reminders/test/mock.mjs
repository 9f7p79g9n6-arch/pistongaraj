import http from 'node:http';
const port = Number(process.argv[2]);
const st = { notifInserts: [], pushes: [] };
const send = (res, c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
const read = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const body = await read(req);
  if (u.pathname === '/__state') return send(res, 200, st);
  if (u.pathname === '/rest/v1/maintenance_due') return send(res, 200, [
    { rule_id: 'r1', vehicle_id: 'v1', owner_id: 'u1', title: 'Polen filtresi', make: 'Ford', model: 'Focus', km_left: null, days_left: -44, status: 'overdue' },
    { rule_id: 'r2', vehicle_id: 'v1', owner_id: 'u1', title: 'Motor yağı', make: 'Ford', model: 'Focus', km_left: 900, days_left: 40, status: 'due_soon' }]);
  if (u.pathname === '/rest/v1/fine_due') {
    const ok = u.searchParams.get('days_left_for_discount') === 'gte.0' || u.search.includes('gte.0');
    return send(res, 200, ok ? [{ fine_id: 'f1', vehicle_id: 'v1', owner_id: 'u1', make: 'Ford', model: 'Focus', amount: '2000.00', discount_until: '2026-11-16', days_left_for_discount: 2 }] : []);
  }
  if (u.pathname === '/rest/v1/notifications' && req.method === 'GET') return send(res, 200, [{ data: { rule_id: 'r2' } }]);
  if (u.pathname === '/rest/v1/notifications' && req.method === 'POST') { st.notifInserts.push(...JSON.parse(body)); return send(res, 201, null); }
  if (u.pathname === '/rest/v1/device_tokens') return send(res, 200, [{ token: 'ExponentPushToken[x]', user_id: 'u1' }]);
  if (u.pathname === '/push') { st.pushes.push(...JSON.parse(body)); return send(res, 200, { data: [] }); }
  send(res, 404, { error: req.method + ' ' + u.pathname + u.search });
}).listen(port);
