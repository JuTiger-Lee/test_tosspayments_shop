/* 결제 결과: success.html(승인 요청) / fail.html(실패 기록·안내) */
window.UI.ready.then(function () {
  var UI = window.UI;
  var DB = window.DB;
  var PENDING_KEY = 'stylehaus_pending_order';
  var params = new URLSearchParams(location.search);
  var root = document.getElementById('result');
  var page = document.body.dataset.page;

  function rows(list) {
    return '<dl class="result-table">' + list.map(function (r) {
      return '<div><dt>' + UI.esc(r[0]) + '</dt><dd>' + UI.esc(r[1]) + '</dd></div>';
    }).join('') + '</dl>';
  }

  var actions =
    '<div class="result-actions"><a class="btn btn-line" href="index.html">홈으로</a>' +
    '<a class="btn btn-black" href="tops.html">쇼핑 계속하기</a></div>';

  function renderFail(title, desc, list) {
    root.innerHTML = '<div class="result-icon fail">!</div><h1>' + UI.esc(title) + '</h1>' +
      '<p class="desc">' + UI.esc(desc) + '</p>' + rows(list) + actions;
  }

  if (page === 'fail') {
    var failOrderId = params.get('orderId');
    // 결제 대기 주문을 결제 실패로 기록 (재고는 결제 완료 때만 줄어들므로 그대로다)
    if (failOrderId) DB.api('/api/fail', { orderId: failOrderId, code: params.get('code'), message: params.get('message') });
    renderFail('결제에 실패했습니다', params.get('message') || '결제가 취소되었거나 오류가 발생했습니다.', [
      ['에러 코드', params.get('code') || '-'],
      ['주문번호', failOrderId || '-']
    ]);
    return;
  }

  // ---------- success ----------
  var paymentKey = params.get('paymentKey');
  var orderId = params.get('orderId');
  var amount = Number(params.get('amount'));
  var pending = UI.readJson(sessionStorage, PENDING_KEY, null);

  if (!paymentKey || !orderId || !amount) {
    renderFail('잘못된 접근입니다', '결제 정보가 없습니다.', []);
    return;
  }

  // 결제 요청 때 저장한 금액과 리다이렉트로 받은 금액이 같은지 먼저 확인 (서버도 DB 주문 금액과 다시 비교)
  if (pending && pending.orderId === orderId && pending.amount !== amount) {
    renderFail('결제 금액이 일치하지 않습니다', '결제를 승인하지 않았습니다. 다시 시도해 주세요.', [['주문번호', orderId]]);
    return;
  }

  root.innerHTML = '<p class="desc">결제를 승인하는 중입니다…</p>';

  function finish() {
    if (!pending || pending.orderId !== orderId) return;
    if (pending.mode === 'cart') UI.clearCart();
    if (pending.mode === 'buynow') UI.setBuyNow([]);
  }

  function renderSuccess(p) {
    finish();
    root.innerHTML = '<div class="result-icon">✓</div><h1>결제가 완료되었습니다</h1>' +
      '<p class="desc">주문해 주셔서 감사합니다.</p>' +
      rows([
        ['주문번호', p.orderId],
        ['상품', p.orderName],
        ['결제 수단', p.method || '-'],
        ['결제 금액', UI.won(p.totalAmount)],
        ['승인 일시', UI.formatDate(p.approvedAt, true)]
      ]) +
      (p.receiptUrl ? '<p style="margin-bottom:16px"><a href="' + UI.esc(p.receiptUrl) + '" target="_blank" rel="noopener"><u>영수증 보기</u></a></p>' : '') +
      (DB.user() ? '<p style="margin-bottom:16px"><a href="order.html?id=' + encodeURIComponent(p.orderId) + '"><u>주문 상세 보기</u></a></p>' : '') +
      actions;
  }

  // 같은 주문을 다른 요청이 처리 중이면(새로고침 연타 등) 잠시 뒤 다시 확인한다
  function confirm(attempt) {
    DB.api('/api/confirm', { paymentKey: paymentKey, orderId: orderId, amount: amount }).then(function (r) {
      if (r.ok) return renderSuccess(r.data);
      if (r.data.code === 'PROCESSING' && attempt < 5) {
        setTimeout(function () { confirm(attempt + 1); }, 1500);
        return;
      }
      if (r.data.code === 'SOLD_OUT') {
        renderFail('품절되어 결제할 수 없습니다', '결제하는 사이 다른 고객이 먼저 구매했습니다. 결제는 승인되지 않았고 돈이 빠져나가지 않습니다.', [
          ['품절 상품', (r.data.items || []).map(function (i) { return i.name + ' (' + i.size + ')'; }).join(', ') || '-'],
          ['주문번호', orderId]
        ]);
        return;
      }
      renderFail('결제 승인에 실패했습니다', r.data.message || '잠시 후 다시 시도해 주세요.', [
        ['에러 코드', r.data.code || '-'],
        ['주문번호', orderId]
      ]);
    }).catch(function () {
      renderFail('결제 승인 서버에 연결하지 못했습니다', '네트워크 상태를 확인한 뒤 새로고침해 주세요.', [['주문번호', orderId]]);
    });
  }

  confirm(0);
});
