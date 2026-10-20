/* 주문서 + 토스페이먼츠 주문서형 결제(결제위젯 v2) */
(function () {
  // 브라우저에는 클라이언트 키만 둡니다. (토스페이먼츠 문서용 공개 테스트 키 — 실제 상점 키로 교체하세요)
  var CLIENT_KEY = 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
  var CUSTOMER_KEY_STORE = 'stylehaus_customer_key';
  var PENDING_KEY = 'stylehaus_pending_order';

  var Shop = window.Shop;
  var UI = window.UI;
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
  document.getElementById('itemCount').textContent = '(' + order.lines.length + ')';
  document.getElementById('orderItems').innerHTML = order.lines.map(function (l) {
    return '<li class="order-item"><div class="cart-thumb">' + UI.productImage(l.product, 120) + '</div>' +
      '<div class="info"><p class="brand">' + UI.esc(l.product.brand) + '</p><p class="name">' + UI.esc(l.product.name) + '</p>' +
      '<p class="opt">사이즈 ' + UI.esc(l.size) + ' · ' + l.qty + '개</p></div>' +
      '<p class="amount">' + UI.won(l.subtotal) + '</p></li>';
  }).join('');

  document.getElementById('summary').innerHTML =
    '<div><dt>상품 금액</dt><dd>' + UI.won(order.itemsTotal) + '</dd></div>' +
    '<div><dt>배송비</dt><dd>' + (order.shipping ? UI.won(order.shipping) : '무료') + '</dd></div>' +
    '<div class="sum-total"><dt>최종 결제 금액</dt><dd>' + UI.won(order.amount) + '</dd></div>';

  function showError(msg) {
    payError.textContent = msg;
    payError.hidden = !msg;
  }

  function randomId(prefix) {
    var rand = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return prefix + rand.replace(/[^A-Za-z0-9_-]/g, '');
  }

  function getCustomerKey() {
    var key = UI.readJson(localStorage, CUSTOMER_KEY_STORE, null);
    if (!key) {
      key = randomId('C_').slice(0, 50);
      UI.writeJson(localStorage, CUSTOMER_KEY_STORE, key);
    }
    return key;
  }

  /* 서버(/api/orders)가 있으면 서버에서 금액을 계산해 주문을 만듭니다.
     정적 호스팅만 할 때는 브라우저에서 주문번호를 만들고, 승인 단계는 백엔드 연결이 필요합니다. */
  function createOrder() {
    return fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (res) {
      if (!res.ok) throw new Error('order api ' + res.status);
      return res.json();
    }).then(function (data) {
      return { orderId: data.orderId, amount: data.amount, orderName: data.orderName, orderToken: data.orderToken, server: true };
    }).catch(function () {
      return { orderId: randomId('ORD-').slice(0, 64), amount: order.amount, orderName: order.orderName, server: false };
    });
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

  // ---------- 결제위젯 ----------
  async function init() {
    if (typeof window.TossPayments !== 'function') {
      showError('결제 모듈을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
      payButton.textContent = '결제 불가';
      return;
    }

    var orderInfo = await createOrder();
    var tossPayments = TossPayments(CLIENT_KEY);
    var widgets = tossPayments.widgets({ customerKey: getCustomerKey() });

    await widgets.setAmount({ currency: 'KRW', value: orderInfo.amount });
    await Promise.all([
      widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
      widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' })
    ]);

    payButton.disabled = false;
    payButton.textContent = UI.won(orderInfo.amount) + ' 결제하기';

    payButton.addEventListener('click', async function () {
      showError('');
      if (!validateForm()) {
        showError('배송 정보를 확인해 주세요.');
        form.querySelector('.invalid').focus();
        return;
      }

      UI.writeJson(sessionStorage, PENDING_KEY, {
        orderId: orderInfo.orderId,
        amount: orderInfo.amount,
        orderName: orderInfo.orderName,
        mode: mode,
        orderToken: orderInfo.orderToken,
        server: orderInfo.server
      });

      try {
        await widgets.requestPayment({
          orderId: orderInfo.orderId,
          orderName: orderInfo.orderName,
          successUrl: location.origin + location.pathname.replace(/checkout\.html$/, 'success.html'),
          failUrl: location.origin + location.pathname.replace(/checkout\.html$/, 'fail.html'),
          customerName: form.name.value.trim(),
          customerEmail: form.email.value.trim() || undefined,
          customerMobilePhone: form.phone.value
        });
      } catch (err) {
        // 사용자가 결제창을 닫은 경우 등
        showError(err && err.message ? err.message : '결제 요청 중 오류가 발생했습니다.');
      }
    });
  }

  init().catch(function (err) {
    console.error(err);
    showError('결제 화면을 준비하지 못했습니다. ' + (err && err.message ? err.message : ''));
    payButton.textContent = '결제 불가';
  });
})();
