/*
 * 로컬 개발 서버 (외부 패키지 없이 Node 18+)
 * 정적 파일 + /api/* 를 Vercel과 같은 구조로 제공합니다.
 * 실행: npm start  →  http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// 루트의 .env를 환경변수로 읽기 (SUPABASE_SERVICE_ROLE_KEY 등). 이미 설정된 값은 덮어쓰지 않는다
try {
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch (e) { /* .env가 없으면 무시 */ }

const { ordersHandler, confirmHandler, failHandler, cancelHandler } = require('../lib/payment.js');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIRS = ['css', 'js'];
// 루트에서 공개하는 검색엔진·AI 크롤러용 파일
const PUBLIC_FILES = ['robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.svg'];
const API = {
  '/api/orders': ordersHandler,
  '/api/confirm': confirmHandler,
  '/api/fail': failHandler,
  '/api/cancel': cancelHandler
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
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
  // 루트의 .html·PUBLIC_FILES와 css/, js/ 폴더만 공개
  const allowed = !rel.startsWith('..') && (PUBLIC_DIRS.includes(top) || PUBLIC_FILES.includes(rel) || (!rel.includes(path.sep) && rel.endsWith('.html')));
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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('⚠ SUPABASE_SERVICE_ROLE_KEY가 없어 주문·결제 API가 동작하지 않습니다. .env에 넣어 주세요.');
});
