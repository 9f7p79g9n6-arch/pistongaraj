// docs/site klasörünü yerelde sunar (yalnızca önizleme için): node scripts/serve-site.cjs → http://localhost:5055
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'docs', 'site');
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.css': 'text/css' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(dir, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(path.normalize(dir))) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end('yok'); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(b);
  });
}).listen(5055);
