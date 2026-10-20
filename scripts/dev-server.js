/*
 * 로컬 개발 서버 (외부 패키지 없이 Node 18+)
 * 정적 파일 + /api/* 를 Vercel과 같은 구조로 제공합니다.
 * 실행: npm start  →  http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ordersHandler, confirmHandler } = require('../lib/payment.js');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIRS = ['css', 'js'];
const API = { '/api/orders': ordersHandler, '/api/confirm': confirmHandler };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  const rel = path.relative(ROOT, file);
  const top = rel.split(path.sep)[0];
  // 루트의 .html과 css/, js/ 폴더만 공개
  const allowed = !rel.startsWith('..') && (PUBLIC_DIRS.includes(top) || (!rel.includes(path.sep) && rel.endsWith('.html')));
  if (!allowed) return notFound(res);

  fs.readFile(file, (err, content) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  if (API[pathname]) return API[pathname](req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
  res.writeHead(405);
  res.end();
}).listen(PORT, () => {
  console.log('STYLEHAUS → http://localhost:' + PORT);
});
