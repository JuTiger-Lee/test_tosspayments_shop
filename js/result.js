/* 결제 결과: success.html(승인 요청) / fail.html(실패 안내) */
(function () {
  var UI = window.UI;
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
    renderFail('결제에 실패했습니다', params.get('message') || '결제가 취소되었거나 오류가 발생했습니다.', [
      ['에러 코드', params.get('code') || '-'],
      ['주문번호', params.get('orderId') || '-']
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

  // 결제 요청 때 저장한 금액과 리다이렉트로 받은 금액이 같은지 먼저 확인
  if (pending && (pending.orderId !== orderId || pending.amount !== amount)) {
    renderFail('결제 금액이 일치하지 않습니다', '결제를 승인하지 않았습니다. 다시 시도해 주세요.', [['주문번호', orderId]]);
    return;
  }

  root.innerHTML = '<p class="desc">결제를 승인하는 중입니다…</p>';

  function finish() {
    if (pending && pending.mode === 'cart') UI.clearCart();
    if (pending && pending.mode === 'buynow') UI.setBuyNow([]);
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* 무시 */ }
  }

  fetch('/api/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey: paymentKey, orderId: orderId, amount: amount })
  }).then(function (res) {
    var type = res.headers.get('content-type') || '';
    if (res.status === 404 && type.indexOf('json') === -1) throw new Error('NO_SERVER');
    return res.json().then(function (data) { return { ok: res.ok, data: data }; });
  }).then(function (r) {
    if (!r.ok) {
      renderFail('결제 승인에 실패했습니다', r.data.message || '잠시 후 다시 시도해 주세요.', [
        ['에러 코드', r.data.code || '-'],
        ['주문번호', orderId]
      ]);
      return;
    }
    var p = r.data;
    finish();
    root.innerHTML = '<div class="result-icon">✓</div><h1>결제가 완료되었습니다</h1>' +
      '<p class="desc">주문해 주셔서 감사합니다.</p>' +
      rows([
        ['주문번호', p.orderId],
        ['상품', p.orderName],
        ['결제 수단', p.method || '-'],
        ['결제 금액', UI.won(p.totalAmount)],
        ['승인 일시', p.approvedAt ? new Date(p.approvedAt).toLocaleString('ko-KR') : '-']
      ]) +
      (p.receipt && p.receipt.url ? '<p style="margin-bottom:16px"><a href="' + UI.esc(p.receipt.url) + '" target="_blank" rel="noopener"><u>영수증 보기</u></a></p>' : '') +
      actions;
  }).catch(function () {
    // 정적 호스팅만 한 경우: 결제 인증까지만 완료된 상태
    root.innerHTML = '<div class="result-icon">✓</div><h1>결제 인증이 완료되었습니다</h1>' +
      '<p class="desc">아래 정보로 서버에서 결제 승인 API를 호출해야 결제가 최종 완료됩니다.</p>' +
      rows([['주문번호', orderId], ['결제 금액', UI.won(amount)], ['paymentKey', paymentKey]]) +
      '<p class="warn">승인 서버(/api/confirm)에 연결하지 못했습니다. <b>node server.js</b>로 실행하면 승인까지 자동으로 진행됩니다.</p>' +
      actions;
  });
})();
