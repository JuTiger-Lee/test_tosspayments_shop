/* 카테고리(상의/신발/바지) 목록 페이지 */
window.UI.ready.then(function () {
  var Shop = window.Shop;
  var UI = window.UI;
  var category = document.body.dataset.category;
  var info = Shop.CATEGORIES[category];
  var state = { sub: '전체', sort: 'recommend' };

  var grid = document.getElementById('grid');
  var count = document.getElementById('count');
  var filters = document.getElementById('subFilters');
  var sortSelect = document.getElementById('sort');

  var SORTERS = {
    recommend: function (a, b) { return b.likes - a.likes; },
    low: function (a, b) { return Shop.salePrice(a) - Shop.salePrice(b); },
    high: function (a, b) { return Shop.salePrice(b) - Shop.salePrice(a); },
    discount: function (a, b) { return b.discount - a.discount; },
    review: function (a, b) { return b.reviews - a.reviews; }
  };

  function renderFilters() {
    filters.innerHTML = ['전체'].concat(info.subs).map(function (s) {
      return '<button type="button" class="chip' + (s === state.sub ? ' active' : '') + '" data-sub="' + UI.esc(s) + '">' + UI.esc(s) + '</button>';
    }).join('');
  }

  function renderGrid() {
    var list = Shop.PRODUCTS.filter(function (p) {
      return p.category === category && (state.sub === '전체' || p.sub === state.sub);
    }).sort(SORTERS[state.sort]);

    count.innerHTML = '상품 <strong>' + list.length + '</strong>개';
    grid.innerHTML = list.length
      ? list.map(function (p, i) { return UI.productCard(p, state.sort === 'recommend' ? i + 1 : null); }).join('')
      : '<li class="empty">조건에 맞는 상품이 없습니다.</li>';
  }

  filters.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-sub]');
    if (!chip) return;
    state.sub = chip.dataset.sub;
    renderFilters();
    renderGrid();
  });

  sortSelect.addEventListener('change', function () {
    state.sort = sortSelect.value;
    renderGrid();
  });

  renderFilters();
  renderGrid();
});
