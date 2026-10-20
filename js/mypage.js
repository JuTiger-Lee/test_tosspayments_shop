/* 마이페이지: 회원 정보 + 내 주문 목록(결제 완료·취소만, 최신순) */
window.UI.ready.then(function () {
  var UI = window.UI;
  var DB = window.DB;
  var root = document.getElementById('mypage');

  if (!DB.user()) {
    location.replace(UI.loginUrl());
    return;
  }

  function orderRow(o) {
    var first = o.order_items[0] || {};
    return '<li><a class="order-row" href="order.html?id=' + encodeURIComponent(o.id) + '">' +
      '<div class="cart-thumb">' + (first.img ? UI.productImage({ img: first.img, name: first.product_name }, 120) : '') + '</div>' +
      '<div class="info"><p class="date">' + UI.formatDate(o.created_at) + ' · ' + UI.esc(o.id) + '</p>' +
      '<p class="name">' + UI.esc(o.order_name) + '</p>' +
      '<p class="amount">' + UI.won(o.amount) + '</p></div>' +
      UI.statusBadge(o.status) + '</a></li>';
  }

  root.innerHTML =
    '<div class="profile-box"><div><strong>' + UI.esc(DB.displayName()) + '님</strong>' +
    '<p>' + UI.esc(DB.user().email || '') + '</p></div>' +
    '<a class="btn btn-line" href="login.html?mode=update" data-password hidden>비밀번호 변경</a></div>' +
    '<section class="section"><div class="section-head"><h2>주문 내역</h2></div><div data-orders><p class="empty">불러오는 중…</p></div></section>';

  // 이메일로 가입한 회원만 비밀번호 변경을 보여준다 (카카오 회원은 비밀번호가 없다)
  var providers = (DB.user().app_metadata && DB.user().app_metadata.providers) || [];
  if (providers.indexOf('email') !== -1) root.querySelector('[data-password]').hidden = false;

  var listEl = root.querySelector('[data-orders]');
  DB.myOrders().then(function (orders) {
    listEl.innerHTML = orders.length
      ? '<ul class="order-list">' + orders.map(orderRow).join('') + '</ul>'
      : '<p class="empty">아직 주문 내역이 없습니다. <a href="index.html"><u>쇼핑하러 가기</u></a></p>';
  }).catch(function () {
    listEl.innerHTML = '<p class="empty">주문 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
  });
});
