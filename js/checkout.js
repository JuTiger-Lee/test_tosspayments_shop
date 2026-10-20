/* 주문서 + 토스페이먼츠 주문서형 결제(결제위젯 v2) */
window.UI.ready.then(function () {
  // 브라우저에는 클라이언트 키만 둡니다 (js/config.js)
  var CLIENT_KEY = window.SHOP_CONFIG.TOSS_CLIENT_KEY;
  var CUSTOMER_KEY_STORE = 'stylehaus_customer_key';
  var PENDING_KEY = 'stylehaus_pending_order';

  var Shop = window.Shop;
  var UI = window.UI;
  var DB = window.DB;
  var mode = new URLSearchParams(location.search).get('mode') === 'buynow' ? 'buynow' : 'cart';
  var items = mode === 'buynow' ? UI.getBuyNow() : UI.getCart();

  var payButton = document.getElementById('payButton');
  var payError = document.getElementById('payError');
  var form = document.getElementById('shippingForm');

  var order;
  try {
    order = Shop.calcOrder(items);
  } catch (e) {
    document.getElementById('emptyOrder').hidden = false;
    return;
  }
  document.getElementById('checkout').hidden = false;

  // ---------- 주문 상품/금액 ----------
  function renderOrder(soldOutKeys) {
    document.getElementById('itemCount').textContent = '(' + order.lines.length + ')';
    document.getElementById('orderItems').innerHTML = order.lines.map(function (l) {
      var soldOut = soldOutKeys.indexOf(l.product.id + '|' + l.size) !== -1;
      return '<li class="order-item' + (soldOut ? ' sold-out' : '') + '"><div class="cart-thumb">' + UI.productImage(l.product, 120) + '</div>' +
        '<div class="info"><p class="brand">' + UI.esc(l.product.brand) + '</p><p class="name">' + UI.esc(l.product.name) + '</p>' +
        '<p class="opt">사이즈 ' + UI.esc(l.size) + ' · ' + l.qty + '개' + (soldOut ? ' <b class="soldout-text">품절</b>' : '') + '</p></div>' +
        '<p class="amount">' + UI.won(l.subtotal) + '</p></li>';
    }).join('');

    document.getElementById('summary').innerHTML =
      '<div><dt>상품 금액</dt><dd>' + UI.won(order.itemsTotal) + '</dd></div>' +
      '<div><dt>배송비</dt><dd>' + (order.shipping ? UI.won(order.shipping) : '무료') + '</dd></div>' +
      '<div class="sum-total"><dt>최종 결제 금액</dt><dd>' + UI.won(order.amount) + '</dd></div>';
  }

  function showError(msg) {
    payError.textContent = msg;
    payError.hidden = !msg;
  }

  // 품절 안내: 어떤 상품·사이즈인지 함께 보여주고 결제를 막는다
  function showSoldOut(list) {
    renderOrder(list.map(function (i) { return i.id + '|' + i.size; }));
    showError('품절된 상품이 있습니다: ' + list.map(function (i) { return i.name + ' (' + i.size + ')'; }).join(', ') +
      '. ' + (mode === 'cart' ? '장바구니에서 품절 상품을 빼고' : '다른 사이즈로') + ' 다시 주문해 주세요.');
    payButton.disabled = true;
    payButton.textContent = '품절 상품이 있어 결제할 수 없습니다';
  }

  var soldOut = Shop.soldOutLines(order.lines);
  renderOrder([]);
  if (soldOut.length) {
    showSoldOut(soldOut.map(function (l) { return { id: l.product.id, size: l.size, name: l.product.name }; }));
    return;
  }

  function randomId(prefix) {
    var rand = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return prefix + rand.replace(/[^A-Za-z0-9_-]/g, '');
  }

  // 회원은 회원 id, 비회원은 이 브라우저에 저장한 임의 값
  function getCustomerKey() {
    if (DB.user()) return DB.user().id;
    var key = UI.readJson(localStorage, CUSTOMER_KEY_STORE, null);
    if (!key) {
      key = randomId('C_').slice(0, 50);
      UI.writeJson(localStorage, CUSTOMER_KEY_STORE, key);
    }
    return key;
  }

  function validateForm() {
    var ok = true;
    var phone = form.phone.value.replace(/\D/g, '');
    form.phone.value = phone;
    [['name', form.name.value.trim().length > 0], ['phone', /^\d{10,11}$/.test(phone)], ['address', form.address.value.trim().length > 0]]
      .forEach(function (pair) {
        form[pair[0]].classList.toggle('invalid', !pair[1]);
        if (!pair[1]) ok = false;
      });
    var email = form.email.value.trim();
    var emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    form.email.classList.toggle('invalid', !emailOk);
    return ok && emailOk;
  }

  if (DB.user() && DB.user().email && !form.email.value) form.email.value = DB.user().email;

  // ---------- 결제위젯 ----------
  async function init() {
    if (typeof window.TossPayments !== 'function') {
      showError('결제 모듈을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
      payButton.textContent = '결제 불가';
      return;
    }

    var tossPayments = TossPayments(CLIENT_KEY);
    var widgets = tossPayments.widgets({ customerKey: getCustomerKey() });

    await widgets.setAmount({ currency: 'KRW', value: order.amount });
    await Promise.all([
      widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
      widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' })
    ]);

    function setReady() {
      payButton.disabled = false;
      payButton.textContent = UI.won(order.amount) + ' 결제하기';
    }
    setReady();

    payButton.addEventListener('click', async function () {
      showError('');
      if (!validateForm()) {
        showError('배송 정보를 확인해 주세요.');
        form.querySelector('.invalid').focus();
        return;
      }

      payButton.disabled = true;
      payButton.textContent = '주문 확인 중…';

      // 서버가 DB 가격·재고로 주문을 만든다
      var res = await DB.api('/api/orders', { items: items });
      if (!res.ok) {
        if (res.data.code === 'SOLD_OUT') return showSoldOut(res.data.items || []);
        setReady();
        return showError(res.data.message || '주문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      var created = res.data;

      // 그 사이 운영자가 가격을 바꾼 경우: 새 금액을 보여주고 다시 확인받는다
      if (created.amount !== order.amount) {
        DB.api('/api/fail', { orderId: created.orderId, code: 'PRICE_CHANGED', message: '상품 가격이 바뀌어 다시 주문' });
        await DB.reloadProducts();
        order = Shop.calcOrder(items);
        await widgets.setAmount({ currency: 'KRW', value: created.amount });
        renderOrder([]);
        setReady();
        return showError('상품 가격이 변경되었습니다. 바뀐 금액을 확인한 뒤 다시 결제해 주세요.');
      }

      UI.writeJson(sessionStorage, PENDING_KEY, { orderId: created.orderId, amount: created.amount, mode: mode });

      try {
        await widgets.requestPayment({
          orderId: created.orderId,
          orderName: created.orderName,
          successUrl: location.origin + location.pathname.replace(/checkout\.html$/, 'success.html'),
          failUrl: location.origin + location.pathname.replace(/checkout\.html$/, 'fail.html'),
          customerName: form.name.value.trim(),
          customerEmail: form.email.value.trim() || undefined,
          customerMobilePhone: form.phone.value
        });
      } catch (err) {
        // 사용자가 결제창을 닫은 경우 등: 이번 주문은 결제 실패로 기록하고, 다시 누르면 새 주문을 만든다
        DB.api('/api/fail', {
          orderId: created.orderId,
          code: (err && err.code) || 'PAYMENT_ABORTED',
          message: (err && err.message) || '결제가 완료되지 않았습니다.'
        });
        setReady();
        showError(err && err.message ? err.message : '결제 요청 중 오류가 발생했습니다.');
      }
    });
  }

  init().catch(function (err) {
    console.error(err);
    showError('결제 화면을 준비하지 못했습니다. ' + (err && err.message ? err.message : ''));
    payButton.textContent = '결제 불가';
  });
});
