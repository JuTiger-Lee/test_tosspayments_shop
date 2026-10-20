/* 공통 UI: 헤더/푸터, 상품 이미지·카드, 상품 상세 모달(좋아요·리뷰), 장바구니 드로어 */
(function () {
  var Shop = window.Shop;
  var DB = window.DB;
  var CART_KEY = 'stylehaus_cart';
  var BUYNOW_KEY = 'stylehaus_buynow';

  // ---------- 유틸 ----------
  function won(n) {
    return Number(n).toLocaleString('ko-KR') + '원';
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function compact(n) {
    return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '만' : n.toLocaleString('ko-KR');
  }

  function formatDate(iso, withTime) {
    if (!iso) return '-';
    var d = new Date(iso);
    return withTime ? d.toLocaleString('ko-KR') : d.toLocaleDateString('ko-KR');
  }

  function stars(rating) {
    var n = Math.round(rating);
    return '<span class="stars" aria-label="별점 ' + rating + '점">' + '★★★★★'.slice(0, n) + '<span class="off">' + '★★★★★'.slice(n) + '</span></span>';
  }

  var STATUS_LABEL = { paid: '결제 완료', canceling: '취소 처리 중', canceled: '취소 완료' };
  function statusBadge(status) {
    return '<span class="status ' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + '</span>';
  }

  // ---------- 로그인 ----------
  function loginUrl() {
    var here = location.pathname.split('/').pop() + location.search;
    return 'login.html?next=' + encodeURIComponent(here || 'index.html');
  }

  function goLogin(message) {
    toast(message || '로그인이 필요합니다.');
    setTimeout(function () { location.href = loginUrl(); }, 700);
  }

  function readJson(storage, key, fallback) {
    try {
      var v = storage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 저장 불가 환경은 무시 */ }
  }

  // ---------- 장바구니 ----------
  function getCart() {
    var cart = readJson(localStorage, CART_KEY, []);
    return Array.isArray(cart) ? cart.filter(function (i) { return Shop.findProduct(i.id); }) : [];
  }

  function setCart(cart) {
    writeJson(localStorage, CART_KEY, cart);
    updateCartBadge();
  }

  function addToCart(id, size, qty) {
    var cart = getCart();
    var found = cart.find(function (i) { return i.id === id && i.size === size; });
    if (found) found.qty = Math.min(Shop.MAX_QTY, found.qty + qty);
    else cart.push({ id: id, size: size, qty: qty });
    setCart(cart);
  }

  function clearCart() {
    setCart([]);
  }

  function setBuyNow(items) {
    writeJson(sessionStorage, BUYNOW_KEY, items);
  }

  function getBuyNow() {
    return readJson(sessionStorage, BUYNOW_KEY, []);
  }

  function updateCartBadge() {
    var count = getCart().reduce(function (s, i) { return s + i.qty; }, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  }

  // ---------- 상품 이미지 (Unsplash 무료 이미지, Unsplash License) ----------
  // width: 화면에 그릴 CSS 픽셀 너비. 레티나용 2배 이미지를 srcset으로 함께 제공
  function productImage(p, width) {
    var w = width || 400;
    var h = Math.round(w * 1.2);
    var base = 'https://images.unsplash.com/photo-' + p.img + '?fit=crop&crop=entropy&auto=format&q=75';
    return '<img class="product-img" src="' + base + '&w=' + w + '&h=' + h + '"' +
      ' srcset="' + base + '&w=' + w * 2 + '&h=' + h * 2 + ' 2x"' +
      ' width="' + w + '" height="' + h + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">';
  }

  function priceHtml(p) {
    var discount = p.discount > 0 ? '<span class="discount">' + p.discount + '%</span>' : '';
    return discount + '<span class="sale-price">' + won(Shop.salePrice(p)) + '</span>';
  }

  function likeButton(p, extraClass) {
    var liked = DB.isLiked(p.id);
    return '<button type="button" class="like-btn' + (extraClass ? ' ' + extraClass : '') + (liked ? ' liked' : '') + '"' +
      ' data-like="' + p.id + '" aria-pressed="' + liked + '" aria-label="좋아요">' +
      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" stroke="currentColor" stroke-width="1.8"/></svg>' +
      '</button>';
  }

  function metaHtml(p) {
    return '<span data-like-count="' + p.id + '">♥ ' + compact(p.likes) + '</span>' +
      (p.reviews ? '<span>★ ' + p.rating + ' (' + compact(p.reviews) + ')</span>' : '');
  }

  function productCard(p, rank) {
    var soldOut = Shop.isSoldOut(p);
    return '<li class="product-card' + (soldOut ? ' sold-out' : '') + '">' +
      '<button type="button" class="product-link" data-product-id="' + p.id + '">' +
      '<div class="product-thumb">' + productImage(p) +
      (rank ? '<span class="rank">' + rank + '</span>' : '') +
      (soldOut ? '<span class="badge badge-soldout">품절</span>' : p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') +
      '</div>' +
      '<div class="product-info">' +
      '<p class="brand">' + esc(p.brand) + '</p>' +
      '<p class="name">' + esc(p.name) + '</p>' +
      '<p class="price">' + priceHtml(p) + '</p>' +
      '<p class="meta">' + metaHtml(p) + '</p>' +
      '</div></button>' + likeButton(p, 'like-card') + '</li>';
  }

  // ---------- 헤더/푸터 ----------
  function renderHeader() {
    var mount = document.getElementById('header');
    if (!mount) return;
    var active = document.body.dataset.category || document.body.dataset.page || '';
    var tabs = [['home', '홈', 'index.html']].concat(
      Object.keys(Shop.CATEGORIES).map(function (k) { return [k, Shop.CATEGORIES[k].label, k + '.html']; })
    );
    var q = new URLSearchParams(location.search).get('q') || '';

    mount.outerHTML =
      '<header class="gnb">' +
      '<div class="gnb-top container">' +
      '<a class="logo" href="index.html">STYLEHAUS</a>' +
      '<form class="search" action="index.html" role="search">' +
      '<input type="search" name="q" value="' + esc(q) + '" placeholder="브랜드, 상품명 검색" aria-label="상품 검색">' +
      '<button type="submit" aria-label="검색"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 L21 21" stroke="currentColor" stroke-width="2"/></svg></button>' +
      '</form>' +
      '<div class="account" data-account></div>' +
      '<button type="button" class="cart-btn" data-open-cart aria-label="장바구니">' +
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 7h12l-1 13H7L6 7z M9 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' +
      '<span class="cart-count" data-cart-count hidden>0</span></button>' +
      '</div>' +
      '<nav class="gnb-menu"><div class="container">' +
      tabs.map(function (t) {
        return '<a href="' + t[2] + '"' + (t[0] === active ? ' class="active" aria-current="page"' : '') + '>' + t[1] + '</a>';
      }).join('') +
      '</div></nav>' +
      '</header>';
  }

  function renderAccount() {
    var el = document.querySelector('[data-account]');
    if (!el) return;
    el.innerHTML = DB.user()
      ? '<a href="mypage.html">마이페이지</a><button type="button" data-logout>로그아웃</button>'
      : '<a href="' + esc(loginUrl()) + '">로그인</a>';
  }

  function renderFooter() {
    var mount = document.getElementById('footer');
    if (!mount) return;
    mount.outerHTML =
      '<footer class="footer"><div class="container">' +
      '<p class="footer-logo">STYLEHAUS</p>' +
      '<p>고객센터 1588-0000 · 평일 10:00 - 18:00</p>' +
      '<p>본 사이트는 토스페이먼츠 테스트 결제 연동 데모입니다. 실제 결제는 이루어지지 않습니다.</p>' +
      '<p>상품 이미지: <a href="https://unsplash.com" target="_blank" rel="noopener"><u>Unsplash</u></a> (Unsplash License)</p>' +
      '</div></footer>';
  }

  // ---------- 토스트 ----------
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  // ---------- 상품 상세 모달 ----------
  var modal;
  var lastFocus;

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="modal-backdrop" data-close></div>' +
      '<div class="modal-panel" role="dialog" aria-modal="true" aria-label="상품 상세">' +
      '<button type="button" class="modal-close" data-close aria-label="닫기">✕</button>' +
      '<div class="modal-body"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });
    return modal;
  }

  function openProduct(id) {
    var p = Shop.findProduct(id);
    if (!p) return;
    ensureModal();
    lastFocus = document.activeElement;
    var state = { size: null, qty: 1 };
    var body = modal.querySelector('.modal-body');

    body.innerHTML =
      '<div class="detail-thumb">' + productImage(p, 600) + '</div>' +
      '<div class="detail-info">' +
      '<p class="detail-cat">' + esc(Shop.CATEGORIES[p.category].label) + ' &gt; ' + esc(p.sub) + '</p>' +
      '<p class="detail-brand">' + esc(p.brand) + '</p>' +
      '<h2 class="detail-name">' + esc(p.name) + '</h2>' +
      '<div class="detail-meta-row"><p class="detail-meta">' +
      (p.reviews ? '★ ' + p.rating + ' · ' : '') + '후기 ' + p.reviews.toLocaleString('ko-KR') + '개 · <span data-like-count="' + p.id + '">♥ ' + p.likes.toLocaleString('ko-KR') + '</span></p>' +
      likeButton(p, 'like-detail') + '</div>' +
      '<div class="detail-price">' +
      (p.discount > 0 ? '<p class="origin">' + won(p.price) + '</p>' : '') +
      '<p>' + priceHtml(p) + '</p></div>' +
      '<ul class="detail-benefit">' +
      '<li><b>배송</b>' + won(Shop.SHIPPING.freeOver) + ' 이상 무료배송 · 1~2일 이내 출고</li>' +
      '<li><b>결제</b>토스페이먼츠 안전결제 (카드·간편결제·계좌이체)</li></ul>' +
      '<div class="option"><p class="option-label">사이즈</p><div class="size-list">' +
      p.sizes.map(function (s) {
        var left = Shop.stockOf(p, s);
        return '<button type="button" class="size-btn' + (left <= 0 ? ' sold-out' : '') + '" data-size="' + esc(s) + '"' +
          (left <= 0 ? ' disabled aria-label="' + esc(s) + ' 품절"' : '') + '>' + esc(s) +
          (left <= 0 ? '<small>품절</small>' : left <= 3 ? '<small>' + left + '개 남음</small>' : '') + '</button>';
      }).join('') +
      '</div></div>' +
      '<div class="option"><p class="option-label">수량</p>' +
      '<div class="qty"><button type="button" data-qty="-1" aria-label="수량 감소">−</button><span data-qty-value>1</span><button type="button" data-qty="1" aria-label="수량 증가">+</button></div></div>' +
      '<div class="detail-total"><span>총 상품 금액</span><strong data-total>' + won(Shop.salePrice(p)) + '</strong></div>' +
      '<div class="detail-actions">' +
      '<button type="button" class="btn btn-line" data-action="cart">장바구니</button>' +
      '<button type="button" class="btn btn-black" data-action="buy">구매하기</button></div>' +
      '</div>' +
      '<section class="reviews" data-reviews><h3>리뷰 <span>' + p.reviews + '</span></h3><p class="empty">리뷰를 불러오는 중…</p></section>';

    var soldOutAll = Shop.isSoldOut(p);
    if (soldOutAll) {
      body.querySelectorAll('[data-action]').forEach(function (b) { b.disabled = true; });
      body.querySelector('[data-action="buy"]').textContent = '품절';
    }
    renderReviews(p, body.querySelector('[data-reviews]'));

    function refresh() {
      body.querySelector('[data-qty-value]').textContent = state.qty;
      body.querySelector('[data-total]').textContent = won(Shop.salePrice(p) * state.qty);
      body.querySelectorAll('.size-btn').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.size === state.size);
      });
    }

    body.onclick = function (e) {
      var sizeBtn = e.target.closest('[data-size]');
      var qtyBtn = e.target.closest('[data-qty]');
      var actionBtn = e.target.closest('[data-action]');
      var maxQty = state.size ? Math.min(Shop.MAX_QTY, Shop.stockOf(p, state.size)) : Shop.MAX_QTY;
      if (sizeBtn) {
        state.size = sizeBtn.dataset.size;
        state.qty = Math.min(state.qty, Math.min(Shop.MAX_QTY, Shop.stockOf(p, state.size)));
        refresh();
      } else if (qtyBtn) {
        state.qty = Math.min(maxQty, Math.max(1, state.qty + Number(qtyBtn.dataset.qty)));
        if (state.qty === maxQty && Number(qtyBtn.dataset.qty) > 0 && maxQty < Shop.MAX_QTY) toast('남은 재고는 ' + maxQty + '개입니다.');
        refresh();
      } else if (actionBtn) {
        if (!state.size) {
          toast('사이즈를 선택해 주세요.');
          return;
        }
        if (actionBtn.dataset.action === 'cart') {
          addToCart(p.id, state.size, state.qty);
          closeModal();
          toast('장바구니에 담았습니다.');
        } else {
          setBuyNow([{ id: p.id, size: state.size, qty: state.qty }]);
          location.href = 'checkout.html?mode=buynow';
        }
      }
    };

    modal.hidden = false;
    document.body.classList.add('no-scroll');
    modal.querySelector('.modal-close').focus();
  }

  function renderReviews(p, el) {
    DB.listReviews(p.id).then(function (list) {
      var me = DB.user() && DB.user().id;
      el.innerHTML = '<h3>리뷰 <span>' + list.length + '</span>' +
        (list.length ? ' <small>' + stars(p.rating) + ' ' + p.rating + '</small>' : '') + '</h3>' +
        (list.length
          ? '<ul class="review-list">' + list.map(function (r) {
            return '<li><div class="review-head">' + stars(r.rating) +
              '<span>' + esc(r.author_name) + (r.user_id === me ? ' <em>내 리뷰</em>' : '') + '</span>' +
              '<span>' + formatDate(r.created_at) + '</span><span>구매 사이즈 ' + esc(r.size) + '</span></div>' +
              '<p>' + esc(r.content) + '</p></li>';
          }).join('') + '</ul>'
          : '<p class="empty">아직 리뷰가 없습니다. 구매한 상품은 마이페이지 주문 상세에서 리뷰를 쓸 수 있어요.</p>');
    }).catch(function () {
      el.innerHTML = '<h3>리뷰</h3><p class="empty">리뷰를 불러오지 못했습니다.</p>';
    });
  }

  // ---------- 좋아요 ----------
  function toggleLike(btn) {
    if (!DB.user()) return goLogin('로그인이 필요합니다.');
    var id = btn.dataset.like;
    btn.disabled = true;
    DB.toggleLike(id).then(function (liked) {
      var p = Shop.findProduct(id);
      document.querySelectorAll('[data-like="' + id + '"]').forEach(function (b) {
        b.classList.toggle('liked', liked);
        b.setAttribute('aria-pressed', liked);
      });
      if (p) {
        document.querySelectorAll('[data-like-count="' + id + '"]').forEach(function (el) {
          el.textContent = '♥ ' + (el.closest('.detail-meta') ? p.likes.toLocaleString('ko-KR') : compact(p.likes));
        });
      }
    }).catch(function () {
      toast('잠시 후 다시 시도해 주세요.');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('no-scroll');
    if (lastFocus) lastFocus.focus();
  }

  // ---------- 장바구니 드로어 ----------
  var drawer;

  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.hidden = true;
    drawer.innerHTML =
      '<div class="drawer-backdrop" data-close-cart></div>' +
      '<aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="장바구니">' +
      '<div class="drawer-head"><h2>장바구니</h2><button type="button" data-close-cart aria-label="닫기">✕</button></div>' +
      '<div class="drawer-body"></div>' +
      '<div class="drawer-foot"></div></aside>';
    document.body.appendChild(drawer);

    drawer.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-cart]')) return closeCart();
      var row = e.target.closest('[data-row]');
      if (!row) return;
      var cart = getCart();
      var idx = Number(row.dataset.row);
      if (e.target.closest('[data-remove]')) cart.splice(idx, 1);
      var step = e.target.closest('[data-step]');
      if (step) cart[idx].qty = Math.min(Shop.MAX_QTY, Math.max(1, cart[idx].qty + Number(step.dataset.step)));
      setCart(cart);
      renderCart();
    });
    return drawer;
  }

  function renderCart() {
    var cart = getCart();
    var bodyEl = drawer.querySelector('.drawer-body');
    var footEl = drawer.querySelector('.drawer-foot');
    if (cart.length === 0) {
      bodyEl.innerHTML = '<p class="empty">장바구니에 담긴 상품이 없습니다.</p>';
      footEl.innerHTML = '';
      return;
    }
    var order = Shop.calcOrder(cart);
    var soldOut = Shop.soldOutLines(order.lines);
    bodyEl.innerHTML = '<ul class="cart-list">' + order.lines.map(function (l, i) {
      return '<li class="cart-item" data-row="' + i + '">' +
        '<div class="cart-thumb">' + productImage(l.product, 120) + '</div>' +
        '<div class="cart-info"><p class="brand">' + esc(l.product.brand) + '</p>' +
        '<p class="name">' + esc(l.product.name) + '</p>' +
        '<p class="opt">사이즈 ' + esc(l.size) + (soldOut.indexOf(l) !== -1 ? ' <b class="soldout-text">품절</b>' : '') + '</p>' +
        '<div class="cart-row"><div class="qty qty-sm"><button type="button" data-step="-1" aria-label="수량 감소">−</button><span>' + l.qty + '</span><button type="button" data-step="1" aria-label="수량 증가">+</button></div>' +
        '<strong>' + won(l.subtotal) + '</strong></div></div>' +
        '<button type="button" class="cart-remove" data-remove aria-label="삭제">✕</button></li>';
    }).join('') + '</ul>';
    footEl.innerHTML =
      '<dl class="sum"><div><dt>상품 금액</dt><dd>' + won(order.itemsTotal) + '</dd></div>' +
      '<div><dt>배송비</dt><dd>' + (order.shipping ? won(order.shipping) : '무료') + '</dd></div>' +
      '<div class="sum-total"><dt>결제 예정 금액</dt><dd>' + won(order.amount) + '</dd></div></dl>' +
      (soldOut.length ? '<p class="pay-error">품절된 상품이 있습니다. 품절 상품을 빼고 주문해 주세요.</p>' : '') +
      '<a class="btn btn-black btn-block" href="checkout.html">' + won(order.amount) + ' 주문하기</a>';
  }

  function openCart() {
    ensureDrawer();
    renderCart();
    drawer.hidden = false;
    document.body.classList.add('no-scroll');
  }

  function closeCart() {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  // ---------- 초기화 ----------
  document.addEventListener('click', function (e) {
    var like = e.target.closest('[data-like]');
    if (like) return toggleLike(like);
    if (e.target.closest('[data-logout]')) {
      DB.client.auth.signOut().then(function () { location.href = 'index.html'; });
      return;
    }
    var link = e.target.closest('[data-product-id]');
    if (link) openProduct(link.dataset.productId);
    if (e.target.closest('[data-open-cart]')) openCart();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal();
      closeCart();
    }
  });

  renderHeader();
  renderFooter();

  // 상품·로그인 정보를 불러온 뒤 화면을 그린다. 페이지 스크립트는 UI.ready.then(...) 안에서 시작한다
  var ready = DB.ready.then(function () {
    renderAccount();
    updateCartBadge();
  }, function (err) {
    console.error(err);
    renderAccount();
    var main = document.querySelector('main');
    if (main) main.innerHTML = '<p class="empty">상품 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>';
    throw err;
  });

  DB.onChange(function () {
    renderAccount();
  });

  window.UI = {
    ready: ready,
    won: won,
    esc: esc,
    formatDate: formatDate,
    stars: stars,
    statusBadge: statusBadge,
    loginUrl: loginUrl,
    goLogin: goLogin,
    productImage: productImage,
    productCard: productCard,
    getCart: getCart,
    clearCart: clearCart,
    getBuyNow: getBuyNow,
    setBuyNow: setBuyNow,
    toast: toast,
    readJson: readJson,
    writeJson: writeJson
  };
})();
