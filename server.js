/*
 * 정적 파일 서버 + 토스페이먼츠 결제 승인 API (외부 패키지 없이 Node 18+)
 * 실행: node server.js  →  http://localhost:3000
 * 실제 상점 키는 환경변수로: TOSS_SECRET_KEY=test_sk_... node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Shop = require('./js/products.js');

const PORT = Number(process.env.PORT) || 3000;
// 토스페이먼츠 문서용 공개 테스트 시크릿 키 (checkout.js의 test_gck_docs_ 클라이언트 키와 짝)
const SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';
const ROOT = __dirname;
const PUBLIC_DIRS = ['css', 'js'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// 데모용 메모리 저장소. 운영에서는 DB에 저장하세요.
const orders = new Map();

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100000) {
        reject(new Error('요청이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(new Error('잘못된 JSON입니다.'));
      }
    });
    req.on('error', reject);
  });
}

// 브라우저가 보낸 상품/수량으로 서버에서 금액을 다시 계산해 주문을 만든다
async function createOrder(req, res) {
  const body = await readBody(req);
  let order;
  try {
    order = Shop.calcOrder(body.items);
  } catch (e) {
    return sendJson(res, 400, { code: 'INVALID_ORDER', message: e.message });
  }
  const orderId = 'ORD-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex');
  orders.set(orderId, { amount: order.amount, orderName: order.orderName, status: 'READY' });
  sendJson(res, 200, { orderId, amount: order.amount, orderName: order.orderName });
}

// successUrl로 돌아온 paymentKey/orderId/amount를 검증하고 승인 요청
async function confirmPayment(req, res) {
  const { paymentKey, orderId, amount } = await readBody(req);
  const order = orders.get(orderId);
  if (!order) return sendJson(res, 404, { code: 'NOT_FOUND_ORDER', message: '주문 정보를 찾을 수 없습니다.' });
  if (order.amount !== Number(amount)) {
    return sendJson(res, 400, { code: 'AMOUNT_MISMATCH', message: '결제 금액이 주문 금액과 다릅니다.' });
  }
  if (order.status === 'DONE') return sendJson(res, 200, order.payment);

  const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(SECRET_KEY + ':').toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ paymentKey, orderId, amount: order.amount })
  });
  const data = await tossRes.json();
  if (tossRes.ok) {
    order.status = 'DONE';
    order.payment = data;
  }
  sendJson(res, tossRes.status, data);
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  if (pathname === '/') pathname = '/index.html';

  const file = path.normalize(path.join(ROOT, pathname));
  const rel = path.relative(ROOT, file);
  const top = rel.split(path.sep)[0];
  // 루트의 .html과 css/, js/ 폴더만 공개 (server.js, 설정 파일 등은 제공하지 않음)
  const allowed = !rel.startsWith('..') && (PUBLIC_DIRS.includes(top) || (!rel.includes(path.sep) && rel.endsWith('.html')));
  if (!allowed) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }

  fs.readFile(file, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/orders') return await createOrder(req, res);
    if (req.method === 'POST' && req.url === '/api/confirm') return await confirmPayment(req, res);
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
    res.writeHead(405);
    res.end();
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { code: 'SERVER_ERROR', message: err.message });
  }
});

server.listen(PORT, () => {
  console.log('STYLEHAUS → http://localhost:' + PORT);
});
