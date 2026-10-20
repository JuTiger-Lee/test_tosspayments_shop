/*
 * 주문 생성 + 토스페이먼츠 결제 승인 (Vercel 함수와 로컬 개발 서버가 함께 사용)
 *
 * 서버리스 환경은 요청마다 메모리가 초기화되므로 주문을 메모리에 저장하지 않는다.
 * 대신 서버가 계산한 금액을 orderId와 묶어 HMAC으로 서명한 orderToken을 발급하고,
 * 승인할 때 서명을 검증해 금액 위변조를 막는다.
 */
const crypto = require('crypto');
const Shop = require('../js/products.js');

// 토스페이먼츠 문서용 공개 테스트 시크릿 키 (js/checkout.js의 test_gck_docs_ 클라이언트 키와 짝)
const SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';
const SIGNING_KEY = process.env.ORDER_SIGNING_KEY || SECRET_KEY;
const TOSS_API = 'https://api.tosspayments.com/v1/payments';

function sign(orderId, amount) {
  return crypto.createHmac('sha256', SIGNING_KEY).update(orderId + ':' + amount).digest('base64url');
}

function verify(orderId, amount, token) {
  const expected = Buffer.from(sign(orderId, amount));
  const given = Buffer.from(String(token || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function authHeader() {
  return 'Basic ' + Buffer.from(SECRET_KEY + ':').toString('base64');
}

// 브라우저가 보낸 상품/수량으로 금액을 다시 계산해 주문번호와 서명을 발급
function createOrder(body) {
  let order;
  try {
    order = Shop.calcOrder(body && body.items);
  } catch (e) {
    return { status: 400, body: { code: 'INVALID_ORDER', message: e.message } };
  }
  const orderId = 'ORD-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex');
  return {
    status: 200,
    body: { orderId, amount: order.amount, orderName: order.orderName, orderToken: sign(orderId, order.amount) }
  };
}

// successUrl로 돌아온 paymentKey/orderId/amount를 검증하고 승인 요청
async function confirmPayment(body) {
  const { paymentKey, orderId, orderToken } = body || {};
  const amount = Number(body && body.amount);
  if (!paymentKey || !orderId || !Number.isInteger(amount)) {
    return { status: 400, body: { code: 'INVALID_REQUEST', message: '결제 정보가 올바르지 않습니다.' } };
  }
  if (!verify(orderId, amount, orderToken)) {
    return { status: 400, body: { code: 'AMOUNT_MISMATCH', message: '결제 금액이 주문 금액과 다릅니다.' } };
  }

  const res = await fetch(TOSS_API + '/confirm', {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  const data = await res.json();

  // 새로고침 등으로 다시 승인 요청한 경우: 이미 승인된 결제를 조회해 그대로 돌려준다
  if (!res.ok && data.code === 'ALREADY_PROCESSED_PAYMENT') {
    const lookup = await fetch(TOSS_API + '/' + encodeURIComponent(paymentKey), { headers: { Authorization: authHeader() } });
    const payment = await lookup.json();
    if (lookup.ok && payment.orderId === orderId) return { status: 200, body: payment };
  }
  return { status: res.status, body: data };
}

// Vercel(req.body 자동 파싱)과 Node 기본 http 서버 모두에서 JSON 본문 읽기
function readJson(req) {
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body);
  }
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

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// POST 전용 API 핸들러로 감싸기
function handler(action) {
  return async function (req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', message: 'POST만 지원합니다.' });
    }
    try {
      const result = await action(await readJson(req));
      sendJson(res, result.status, result.body);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { code: 'SERVER_ERROR', message: err.message });
    }
  };
}

module.exports = {
  ordersHandler: handler(createOrder),
  confirmHandler: handler(confirmPayment)
};
