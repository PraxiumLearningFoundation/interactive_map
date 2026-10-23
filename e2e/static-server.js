// Minimal static file server for the Playwright suite. The real deployment
// (Azure Static Web Apps) adds auth and the /api functions; tests mock both.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (error, body) => {
    if (error) {
      // Mirror SWA: /admin -> /admin/
      if (!path.extname(pathname) && fs.existsSync(path.join(filePath, 'index.html'))) {
        res.writeHead(301, { Location: `${pathname}/` }).end();
        return;
      }
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(PORT, '127.0.0.1');
