/* 주문 상세 (order.html?id=…): 주문 상품·결제 정보, 주문 취소, 리뷰 쓰기·수정·삭제
   다른 사람의 주문은 DB의 RLS 정책 때문에 조회되지 않습니다. */
window.UI.ready.then(function () {
  var UI = window.UI;
  var DB = window.DB;
  var root = document.getElementById('order');
  var orderId = new URLSearchParams(location.search).get('id') || '';
  var CANCEL_DAYS = 7;

  if (!DB.user()) {
    location.replace(UI.loginUrl());
    return;
  }

  var order = null;
  var reviews = {}; // product_id → 내 리뷰

  function cancelable(o) {
    return o.status === 'paid' && o.approved_at &&
      Date.now() - new Date(o.approved_at).getTime() < CANCEL_DAYS * 24 * 60 * 60 * 1000;
  }

  function itemRow(i) {
    var mine = reviews[i.product_id];
    var button = mine
      ? '<button type="button" class="review-btn" data-review="' + i.id + '">리뷰 수정</button>'
      : order.status === 'paid' ? '<button type="button" class="review-btn" data-review="' + i.id + '">리뷰 쓰기</button>' : '';
    return '<li class="order-item"><div class="cart-thumb">' + UI.productImage({ img: i.img, name: i.product_name }, 120) + '</div>' +
      '<div class="info"><p class="brand">' + UI.esc(i.brand) + '</p><p class="name">' + UI.esc(i.product_name) + '</p>' +
      '<p class="opt">사이즈 ' + UI.esc(i.size) + ' · ' + i.qty + '개</p>' +
      '<p class="unit">' + UI.won(i.unit_price) + ' × ' + i.qty + ' = <b>' + UI.won(i.unit_price * i.qty) + '</b></p></div>' +
      button + '</li>';
  }

  function render() {
    var rows = [
      ['상품 금액', UI.won(order.items_total)],
      ['배송비', order.shipping ? UI.won(order.shipping) : '무료'],
      ['결제 금액', UI.won(order.amount)],
      ['결제 수단', order.method || '-'],
      ['결제 시각', UI.formatDate(order.approved_at, true)]
    ];
    if (order.canceled_at) rows.push(['취소 시각', UI.formatDate(order.canceled_at, true)]);

    root.innerHTML =
      '<div class="order-head"><span>주문일 ' + UI.formatDate(order.created_at) + ' · 주문번호 ' + UI.esc(order.id) + '</span>' +
      UI.statusBadge(order.status) + '</div>' +
      '<section class="panel"><h2>주문 상품</h2><ul class="order-items">' + order.order_items.map(itemRow).join('') + '</ul></section>' +
      '<section class="panel"><h2>결제 정보</h2><dl class="result-table">' + rows.map(function (r) {
        return '<div><dt>' + r[0] + '</dt><dd>' + UI.esc(r[1]) + '</dd></div>';
      }).join('') + '</dl>' +
      (order.receipt_url ? '<p><a href="' + UI.esc(order.receipt_url) + '" target="_blank" rel="noopener"><u>영수증 보기</u></a></p>' : '') +
      '</section>' +
      (cancelable(order)
        ? '<div class="cancel-box"><span>결제 후 ' + CANCEL_DAYS + '일 이내에는 전체 취소할 수 있으며, 결제 금액은 원래 결제 수단으로 환불됩니다.</span>' +
          '<button type="button" class="btn btn-line" data-cancel>주문 취소</button></div>'
        : '') +
      '<p class="pay-error" data-error hidden></p>' +
      '<div class="result-actions" style="margin-top:32px"><a class="btn btn-line" href="mypage.html">주문 목록</a><a class="btn btn-black" href="index.html">쇼핑 계속하기</a></div>';
  }

  function load() {
    return DB.getOrder(orderId).then(function (o) {
      if (!o) {
        root.innerHTML = '<p class="empty">주문을 찾을 수 없습니다. <a href="mypage.html"><u>주문 목록으로</u></a></p>';
        return;
      }
      order = o;
      var ids = o.order_items.map(function (i) { return i.product_id; });
      return DB.myReviews(ids).then(function (list) {
        reviews = {};
        list.forEach(function (r) { reviews[r.product_id] = r; });
        render();
      });
    }).catch(function () {
      root.innerHTML = '<p class="empty">주문 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
    });
  }

  function showError(msg) {
    var el = root.querySelector('[data-error]');
    el.textContent = msg;
    el.hidden = !msg;
  }

  // ---------- 주문 취소 ----------
  function cancelOrder(btn) {
    if (!window.confirm('정말 취소할까요?\n결제 금액 ' + UI.won(order.amount) + '이 전액 환불됩니다.')) return;
    btn.disabled = true;
    btn.textContent = '취소 중…';
    DB.api('/api/cancel', { orderId: order.id }).then(function (r) {
      if (!r.ok) throw new Error(r.data.message);
      UI.toast('주문을 취소했습니다.');
      return load();
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = '주문 취소';
      showError((err && err.message) || '취소에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    });
  }

  // ---------- 리뷰 작성 모달 ----------
  var modal;

  function closeReview() {
    if (!modal) return;
    modal.remove();
    modal = null;
    document.body.classList.remove('no-scroll');
  }

  function openReview(item) {
    var mine = reviews[item.product_id];
    var state = { rating: mine ? mine.rating : 0 };
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML =
      '<div class="modal-backdrop" data-close></div>' +
      '<form class="modal-panel review-panel" role="dialog" aria-modal="true" aria-label="리뷰 작성" novalidate>' +
      '<button type="button" class="modal-close" data-close aria-label="닫기">✕</button>' +
      '<h2>' + (mine ? '리뷰 수정' : '리뷰 쓰기') + '</h2>' +
      '<p class="target">' + UI.esc(item.product_name) + ' · 사이즈 ' + UI.esc(mine ? mine.size : item.size) + '</p>' +
      '<div class="rating-input" role="radiogroup" aria-label="별점">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" data-rating="' + n + '" role="radio" aria-label="' + n + '점">★</button>';
      }).join('') + '</div>' +
      '<textarea name="content" maxlength="500" placeholder="상품에 대한 솔직한 후기를 10자 이상 남겨 주세요.">' + UI.esc(mine ? mine.content : '') + '</textarea>' +
      '<p class="count"><span data-count>0</span> / 500</p>' +
      '<p class="pay-error" data-review-error hidden></p>' +
      '<div class="actions"><button type="button" class="btn btn-line" data-close>닫기</button><button class="btn btn-black">' + (mine ? '수정하기' : '등록하기') + '</button></div>' +
      (mine ? '<button type="button" class="delete" data-delete>리뷰 삭제</button>' : '') +
      '</form>';
    document.body.appendChild(modal);
    document.body.classList.add('no-scroll');

    var form = modal.querySelector('form');
    var textarea = form.content;
    var errorEl = modal.querySelector('[data-review-error]');

    function refresh() {
      modal.querySelectorAll('[data-rating]').forEach(function (b) {
        var on = Number(b.dataset.rating) <= state.rating;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', Number(b.dataset.rating) === state.rating);
      });
      modal.querySelector('[data-count]').textContent = textarea.value.length;
    }

    function fail(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    function done(msg) {
      closeReview();
      UI.toast(msg);
      load();
    }

    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) return closeReview();
      var star = e.target.closest('[data-rating]');
      if (star) {
        state.rating = Number(star.dataset.rating);
        refresh();
      }
      if (e.target.closest('[data-delete]')) {
        if (!window.confirm('리뷰를 삭제할까요?')) return;
        DB.deleteReview(mine.id).then(function () { done('리뷰를 삭제했습니다.'); }, function () { fail('삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'); });
      }
    });
    textarea.addEventListener('input', refresh);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var content = textarea.value.trim();
      if (!state.rating) return fail('별점을 선택해 주세요.');
      if (content.length < 10) return fail('리뷰는 10자 이상 써 주세요.');
      if (content.length > 500) return fail('리뷰는 500자까지 쓸 수 있습니다.');
      var submit = form.querySelector('.actions .btn-black');
      submit.disabled = true;
      DB.saveReview({
        id: mine && mine.id,
        productId: item.product_id,
        size: item.size,
        rating: state.rating,
        content: content
      }).then(function () {
        done(mine ? '리뷰를 수정했습니다.' : '리뷰를 등록했습니다.');
      }, function (err) {
        submit.disabled = false;
        if (err && err.code === '23505') fail('이미 이 상품에 리뷰를 썼습니다.');
        else if (err && err.code === '42501') fail('결제 완료한 상품에만 리뷰를 쓸 수 있습니다.');
        else fail('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      });
    });

    refresh();
    textarea.focus();
  }

  root.addEventListener('click', function (e) {
    var cancel = e.target.closest('[data-cancel]');
    if (cancel) return cancelOrder(cancel);
    var reviewBtn = e.target.closest('[data-review]');
    if (reviewBtn) {
      var item = order.order_items.filter(function (i) { return String(i.id) === reviewBtn.dataset.review; })[0];
      if (item) openReview(item);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeReview();
  });

  load();
});
