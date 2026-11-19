import http from 'node:http';
const port = Number(process.argv[2]);
const st = { pushes: [], deleted: [], marked: [] };
const send = (res, c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
const read = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const body = await read(req);
  if (u.pathname === '/__state') return send(res, 200, st);
  if (u.pathname === '/rest/v1/notifications' && req.method === 'GET') return send(res, 200, [
    { id: 'n1', user_id: 'u1', kind: 'service_new', title: 'Yeni servis kaydı', body: 'Yıldız Oto', data: { url: '/servis-kaydi/r1' } },
    { id: 'n2', user_id: 'u1', kind: 'social_comment', title: 'Yeni yorum', body: 'Can: güzel', data: { url: '/sosyal/p1' } },
    { id: 'n3', user_id: 'u2', kind: 'quote_offer', title: 'Yeni teklif', body: 'x', data: { url: '/teklif/q1' } },
    { id: 'n4', user_id: 'u3', kind: 'maintenance_due', title: 'Bakım', body: 'y', data: { url: '/vehicle/v1/maintenance' } }]);
  if (u.pathname === '/rest/v1/notifications' && req.method === 'PATCH') { st.marked.push(u.searchParams.get('id'), JSON.parse(body)); return send(res, 204, null); }
  if (u.pathname === '/rest/v1/profiles') return send(res, 200, [
    { id: 'u1', notify_reminders: true, notify_service: true, notify_quotes: true, notify_social: false },
    { id: 'u2', notify_reminders: true, notify_service: true, notify_quotes: true, notify_social: true }]);
  if (u.pathname === '/rest/v1/device_tokens' && req.method === 'GET') return send(res, 200, [
    { token: 'ExponentPushToken[ok1]', user_id: 'u1' }, { token: 'ExponentPushToken[dead]', user_id: 'u2' }, { token: 'ExponentPushToken[ok2]', user_id: 'u2' }]);
  if (u.pathname === '/rest/v1/device_tokens' && req.method === 'DELETE') { st.deleted.push(u.searchParams.get('token')); return send(res, 204, null); }
  if (u.pathname === '/push') {
    const msgs = JSON.parse(body); st.pushes.push(...msgs);
    return send(res, 200, { data: msgs.map((m) => m.to.includes('dead') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' }) });
  }
  send(res, 404, { error: req.method + ' ' + u.pathname + u.search });
}).listen(port);
