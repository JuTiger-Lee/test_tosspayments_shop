/* 홈: 배너 + 카테고리별 랭킹, 검색(?q=) 결과 */
(function () {
  var Shop = window.Shop;
  var UI = window.UI;
  var root = document.getElementById('home');
  var q = (new URLSearchParams(location.search).get('q') || '').trim();

  var HERO = [
    { category: 'tops', bg: '#2a2f3a', eyebrow: 'OUTER & TOP', title: '가을 신상 상의<br>최대 40% 할인', text: '후드, 셔츠, 롱슬리브 모음', product: 'top-04' },
    { category: 'shoes', bg: '#3a2e25', eyebrow: 'SHOES', title: '데일리 스니커즈<br>단독 특가', text: '러닝화부터 부츠까지', product: 'shoe-01' },
    { category: 'pants', bg: '#1f2d3d', eyebrow: 'PANTS', title: '와이드 데님<br>랭킹 위크', text: '이번 주 가장 많이 팔린 바지', product: 'pants-01' }
  ];

  function rankingSection(key) {
    var info = Shop.CATEGORIES[key];
    var list = Shop.PRODUCTS.filter(function (p) { return p.category === key; })
      .sort(function (a, b) { return b.likes - a.likes; })
      .slice(0, 5);
    return '<section class="section">' +
      '<div class="section-head"><h2>' + info.label + ' 랭킹</h2><a href="' + key + '.html">전체보기 &gt;</a></div>' +
      '<ul class="product-grid">' + list.map(function (p, i) { return UI.productCard(p, i + 1); }).join('') + '</ul>' +
      '</section>';
  }

  if (q) {
    var needle = q.toLowerCase();
    var results = Shop.PRODUCTS.filter(function (p) {
      return (p.brand + ' ' + p.name + ' ' + p.sub).toLowerCase().indexOf(needle) !== -1;
    });
    root.innerHTML =
      '<div class="page-head"><nav class="breadcrumb"><a href="index.html">홈</a> &gt; 검색</nav>' +
      '<h1 class="page-title">\'' + UI.esc(q) + '\' 검색 결과</h1></div>' +
      '<div class="toolbar"><span>상품 <strong>' + results.length + '</strong>개</span></div>' +
      '<ul class="product-grid">' +
      (results.length ? results.map(function (p) { return UI.productCard(p); }).join('') : '<li class="empty">검색 결과가 없습니다.</li>') +
      '</ul>';
    return;
  }

  root.innerHTML =
    '<div class="hero">' + HERO.map(function (h) {
      return '<a class="hero-card" href="' + h.category + '.html" style="background:' + h.bg + '">' +
        UI.productImage(Shop.findProduct(h.product), 600) +
        '<span class="eyebrow">' + h.eyebrow + '</span><h2>' + h.title + '</h2><p>' + h.text + '</p></a>';
    }).join('') + '</div>' +
    Object.keys(Shop.CATEGORIES).map(rankingSection).join('');
})();
