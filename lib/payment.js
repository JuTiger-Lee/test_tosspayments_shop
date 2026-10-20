/*
 * 주문 생성 · 결제 승인 · 결제 실패 기록 · 주문 취소 (Vercel 함수와 로컬 개발 서버가 함께 사용)
 *
 * 주문은 Supabase orders 테이블에 저장하고, 결제 금액은 항상 저장된 주문 금액과 비교한다.
 * 재고는 토스 승인 직전에 DB 함수(begin_approval)로 원자적으로 차감하고,
 * 승인이 실패하면 abort_approval로 되돌린다. 취소도 같은 방식으로 재고를 복구한다.
 */
const crypto = require('crypto');
const Shop = require('../js/products.js');
const db = require('./supabase.js');

// 토스페이먼츠 문서용 공개 테스트 시크릿 키 (js/config.js의 test_gck_docs_ 클라이언트 키와 짝)
const SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';
const TOSS_API = 'https://api.tosspayments.com/v1/payments';
const PRODUCT_ID = /^[a-z0-9-]{1,40}$/;
const ORDER_ID = /^ORD-[0-9]+-[0-9a-f]+$/;

function authHeader() {
  return 'Basic ' + Buffer.from(SECRET_KEY + ':').toString('base64');
}

async function toss(path, { method = 'GET', body } = {}) {
  const res = await fetch(TOSS_API + path, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

function fail(status, code, message, extra) {
  return { status, body: Object.assign({ code, message }, extra) };
}

async function findOrder(orderId, columns) {
  const rows = await db.select('orders?select=' + columns + '&id=eq.' + encodeURIComponent(orderId));
  return rows[0] || null;
}

// ---------- 주문 생성 ----------
// 브라우저가 보낸 상품/수량으로 DB 가격 기준 금액을 다시 계산하고 결제 대기 주문을 저장
async function createOrder(body, req) {
  const user = await db.getUser(req);
  if (req.headers.authorization && !user) return fail(401, 'LOGIN_EXPIRED', '로그인이 만료되었습니다. 다시 로그인해 주세요.');

  const items = body && body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) return fail(400, 'INVALID_ORDER', '주문 상품이 없습니다.');
  const ids = [...new Set(items.map((i) => i && i.id))];
  if (!ids.every((id) => PRODUCT_ID.test(id))) return fail(400, 'INVALID_ORDER', '판매하지 않는 상품이 있습니다.');

  const rows = await db.select('products?select=*,product_stock(size,stock,sort_order)&is_active=eq.true&id=in.(' + ids.join(',') + ')');
  let order;
  try {
    order = Shop.calcOrder(items, rows.map(Shop.fromRow));
  } catch (e) {
    return fail(400, 'INVALID_ORDER', e.message);
  }

  const soldOut = Shop.soldOutLines(order.lines);
  if (soldOut.length) {
    return fail(409, 'SOLD_OUT', '품절된 상품이 있습니다.', {
      items: soldOut.map((l) => ({ id: l.product.id, size: l.size, name: l.product.name }))
    });
  }

  const orderId = 'ORD-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex');
  await db.rpc('create_order', {
    p_order_id: orderId,
    p_user_id: user ? user.id : null,
    p_order_name: order.orderName,
    p_items_total: order.itemsTotal,
    p_shipping: order.shipping,
    p_amount: order.amount,
    p_items: order.lines.map((l) => ({
      product_id: l.product.id,
      size: l.size,
      qty: l.qty,
      unit_price: l.unit,
      product_name: l.product.name,
      brand: l.product.brand,
      img: l.product.img
    }))
  });
  return { status: 200, body: { orderId, amount: order.amount, orderName: order.orderName } };
}

// ---------- 결제 승인 ----------
const ORDER_COLUMNS = 'id,status,amount,order_name,payment_key,method,receipt_url,approved_at,fail_code,fail_message';

function paidResult(order, payment) {
  return {
    status: 200,
    body: {
      orderId: order.id,
      orderName: order.order_name,
      method: payment ? payment.method : order.method,
      totalAmount: order.amount,
      approvedAt: payment ? payment.approvedAt : order.approved_at,
      receiptUrl: payment ? payment.receipt && payment.receipt.url : order.receipt_url
    }
  };
}

async function finishApproval(order, payment) {
  await db.rpc('finish_approval', {
    p_order_id: order.id,
    p_payment_key: payment.paymentKey,
    p_method: payment.method,
    p_receipt_url: (payment.receipt && payment.receipt.url) || null,
    p_approved_at: payment.approvedAt,
    p_raw: payment
  });
  return paidResult(order, payment);
}

// 승인 처리 중(approving)에 멈춘 주문: 토스에 실제 결제 상태를 물어 마무리한다
async function recoverApproval(order, paymentKey) {
  const lookup = await toss('/' + encodeURIComponent(paymentKey));
  const payment = lookup.data;
  if (lookup.ok && payment.orderId === order.id) {
    if (payment.status === 'DONE' && payment.totalAmount === order.amount) return finishApproval(order, payment);
    if (['ABORTED', 'EXPIRED', 'CANCELED'].includes(payment.status)) {
      await db.rpc('abort_approval', {
        p_order_id: order.id, p_payment_key: paymentKey, p_code: payment.status, p_message: '결제가 완료되지 않았습니다.', p_raw: payment
      });
      return fail(400, payment.status, '결제가 완료되지 않았습니다.');
    }
  }
  return fail(409, 'PROCESSING', '결제를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.');
}

// successUrl로 돌아온 paymentKey/orderId/amount를 저장된 주문과 비교하고 승인 요청
async function confirmPayment(body) {
  const { paymentKey, orderId } = body || {};
  const amount = Number(body && body.amount);
  if (typeof paymentKey !== 'string' || !ORDER_ID.test(orderId || '') || !Number.isInteger(amount)) {
    return fail(400, 'INVALID_REQUEST', '결제 정보가 올바르지 않습니다.');
  }

  const order = await findOrder(orderId, ORDER_COLUMNS);
  if (!order) return fail(404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
  if (order.amount !== amount) return fail(400, 'AMOUNT_MISMATCH', '결제 금액이 주문 금액과 다릅니다.');

  // 새로고침 등으로 다시 들어온 경우: 저장된 결과를 그대로 보여준다
  if (['paid', 'canceling', 'canceled'].includes(order.status)) {
    if (order.payment_key !== paymentKey) return fail(400, 'INVALID_REQUEST', '결제 정보가 올바르지 않습니다.');
    return paidResult(order);
  }
  if (order.status === 'failed') {
    return fail(400, order.fail_code || 'PAYMENT_FAILED', order.fail_message || '결제에 실패한 주문입니다.');
  }
  if (order.status === 'approving') return recoverApproval(order, paymentKey);

  // 결제 대기 → 재고 차감 (재고가 모자라면 토스 승인을 호출하지 않는다)
  const begin = await db.rpc('begin_approval', { p_order_id: orderId });
  if (!begin.ok) {
    if (begin.reason === 'SOLD_OUT') return fail(409, 'SOLD_OUT', '품절되어 결제할 수 없습니다.', { items: begin.items });
    return fail(409, 'PROCESSING', '결제를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.');
  }

  let result;
  try {
    result = await toss('/confirm', { method: 'POST', body: { paymentKey, orderId, amount } });
  } catch (e) {
    // 승인 여부를 알 수 없음: approving으로 두고, 다음 요청에서 recoverApproval이 확인한다
    console.error(e);
    return fail(502, 'PROCESSING', '결제를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.');
  }

  if (result.ok) return finishApproval(order, result.data);
  if (result.data.code === 'ALREADY_PROCESSED_PAYMENT') return recoverApproval(order, paymentKey);

  await db.rpc('abort_approval', {
    p_order_id: orderId, p_payment_key: paymentKey, p_code: result.data.code, p_message: result.data.message, p_raw: result.data
  });
  return { status: result.status, body: result.data };
}

// ---------- 결제 실패 기록 ----------
// failUrl로 돌아왔거나 결제창을 닫은 경우: 결제 대기 주문을 결제 실패로 바꾼다
async function failPayment(body) {
  const { orderId } = body || {};
  if (!ORDER_ID.test(orderId || '')) return fail(400, 'INVALID_REQUEST', '주문번호가 올바르지 않습니다.');
  await db.rpc('mark_failed', {
    p_order_id: orderId,
    p_code: String((body && body.code) || 'PAYMENT_FAILED'),
    p_message: String((body && body.message) || '결제가 완료되지 않았습니다.')
  });
  return { status: 200, body: { ok: true } };
}

// ---------- 주문 취소 ----------
// 회원 본인 주문 + 결제 완료 + 결제 후 7일 이내만 전액 취소
async function cancelOrder(body, req) {
  const user = await db.getUser(req);
  if (!user) return fail(401, 'LOGIN_REQUIRED', '로그인이 필요합니다.');
  const { orderId } = body || {};
  if (!ORDER_ID.test(orderId || '')) return fail(400, 'INVALID_REQUEST', '주문번호가 올바르지 않습니다.');

  const started = await db.rpc('begin_cancel', { p_order_id: orderId, p_user_id: user.id });
  if (!started.length) {
    const order = await findOrder(orderId, 'status,user_id');
    if (!order || order.user_id !== user.id) return fail(404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
    if (order.status === 'canceled') return fail(400, 'ALREADY_CANCELED', '이미 취소된 주문입니다.');
    if (order.status === 'canceling') return fail(409, 'PROCESSING', '취소를 처리하는 중입니다.');
    return fail(400, 'NOT_CANCELABLE', '취소할 수 없는 주문입니다. (결제 후 7일이 지났거나 결제 완료 상태가 아닙니다)');
  }

  let result;
  try {
    result = await toss('/' + encodeURIComponent(started[0].payment_key) + '/cancel', {
      method: 'POST',
      body: { cancelReason: '고객 요청 취소' }
    });
  } catch (e) {
    console.error(e);
    result = { ok: false, data: { code: 'NETWORK_ERROR', message: e.message } };
  }

  if (result.ok || result.data.code === 'ALREADY_CANCELED_PAYMENT') {
    await db.rpc('finish_cancel', { p_order_id: orderId, p_raw: result.data });
    return { status: 200, body: { orderId, status: 'canceled' } };
  }
  await db.rpc('abort_cancel', { p_order_id: orderId, p_raw: result.data });
  return fail(502, result.data.code || 'CANCEL_FAILED', '취소에 실패했습니다. 잠시 후 다시 시도해 주세요.');
}

// ---------- 공통 ----------
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
      const result = await action(await readJson(req), req);
      sendJson(res, result.status, result.body);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { code: 'SERVER_ERROR', message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  };
}

module.exports = {
  ordersHandler: handler(createOrder),
  confirmHandler: handler(confirmPayment),
  failHandler: handler(failPayment),
  cancelHandler: handler(cancelOrder)
};
