/* 상품 데이터 + 주문 금액 계산 (브라우저와 server.js에서 함께 사용) */
(function (root) {
  var CATEGORIES = {
    tops: { label: '상의', subs: ['반소매 티셔츠', '긴소매 티셔츠', '후드 티셔츠', '셔츠/블라우스'] },
    shoes: { label: '신발', subs: ['스니커즈', '러닝화', '부츠'] },
    pants: { label: '바지', subs: ['데님 팬츠', '코튼 팬츠', '트레이닝 팬츠', '숏 팬츠'] }
  };

  var TOP_SIZES = ['S', 'M', 'L', 'XL'];
  var SHOE_SIZES = ['240', '250', '260', '270', '280'];
  var PANTS_SIZES = ['28', '30', '32', '34'];

  var PRODUCTS = [
    // 상의
    { id: 'top-01', category: 'tops', sub: '반소매 티셔츠', img: '1581655353564-df123a1eb820', brand: 'LOWFIELD', name: '헤비웨이트 오버핏 반소매 티셔츠 화이트', price: 39000, discount: 30, likes: 12840, reviews: 3421, rating: 4.8, badge: '단독', sizes: TOP_SIZES },
    { id: 'top-02', category: 'tops', sub: '반소매 티셔츠', img: '1583743814966-8936f5b7be1a', brand: 'PLAINWORKS', name: '베이직 로고 반소매 티셔츠 블랙', price: 29000, discount: 10, likes: 8210, reviews: 2105, rating: 4.7, sizes: TOP_SIZES },
    { id: 'top-03', category: 'tops', sub: '긴소매 티셔츠', img: '1603577718712-d8081781cd48', brand: 'NORDEN', name: '워싱 피그먼트 긴소매 티셔츠 올리브', price: 45000, discount: 20, likes: 5320, reviews: 987, rating: 4.6, sizes: TOP_SIZES },
    { id: 'top-04', category: 'tops', sub: '후드 티셔츠', img: '1556821840-3a63f95609a7', brand: 'GREYHOUND', name: '스웻 오버핏 후드 티셔츠 멜란지 그레이', price: 69000, discount: 35, likes: 21030, reviews: 5612, rating: 4.9, badge: '랭킹 1위', sizes: TOP_SIZES },
    { id: 'top-05', category: 'tops', sub: '후드 티셔츠', img: '1576693239181-317efff553bb', brand: 'OVERLAP', name: '아치 로고 기모 후드 네이비', price: 79000, discount: 25, likes: 9876, reviews: 1543, rating: 4.7, sizes: TOP_SIZES },
    { id: 'top-06', category: 'tops', sub: '셔츠/블라우스', img: '1770058428099-f2d64ab34006', brand: 'ATELIER 9', name: '옥스포드 버튼다운 셔츠 라이트 블루', price: 59000, discount: 15, likes: 6432, reviews: 1120, rating: 4.8, sizes: TOP_SIZES },
    { id: 'top-07', category: 'tops', sub: '셔츠/블라우스', img: '1591357037205-166318b51afd', brand: 'SEOUL BASIC', name: '린넨 블렌드 오픈카라 셔츠 세이지', price: 49000, discount: 40, likes: 3210, reviews: 654, rating: 4.5, badge: '세일', sizes: TOP_SIZES },
    { id: 'top-08', category: 'tops', sub: '긴소매 티셔츠', img: '1645389777038-2a25742be8bd', brand: 'MODU', name: '스트라이프 롱슬리브 셔츠 그레이', price: 42000, discount: 0, likes: 2104, reviews: 321, rating: 4.6, sizes: TOP_SIZES },

    // 신발
    { id: 'shoe-01', category: 'shoes', sub: '스니커즈', img: '1722489291844-b7ef817e10d5', brand: 'COURTLINE', name: '클래식 레더 로우 스니커즈 화이트', price: 89000, discount: 20, likes: 18420, reviews: 6230, rating: 4.9, badge: '랭킹 1위', sizes: SHOE_SIZES },
    { id: 'shoe-02', category: 'shoes', sub: '스니커즈', img: '1680204101108-d1bf3a7c725d', brand: 'COURTLINE', name: '캔버스 하이 스니커즈 블랙', price: 69000, discount: 10, likes: 9870, reviews: 2840, rating: 4.7, sizes: SHOE_SIZES },
    { id: 'shoe-03', category: 'shoes', sub: '러닝화', img: '1661605813204-8c7662c1a5f8', brand: 'VELOCE', name: '에어 쿠션 데일리 러닝화 네이비', price: 129000, discount: 25, likes: 7650, reviews: 1980, rating: 4.8, sizes: SHOE_SIZES },
    { id: 'shoe-04', category: 'shoes', sub: '러닝화', img: '1562183241-b937e95585b6', brand: 'VELOCE', name: '라이트웨이트 니트 러닝화 라이트 그레이', price: 109000, discount: 30, likes: 5430, reviews: 1203, rating: 4.6, badge: '세일', sizes: SHOE_SIZES },
    { id: 'shoe-05', category: 'shoes', sub: '부츠', img: '1777987601677-3059be0e1388', brand: 'HARDROCK', name: '레더 첼시 부츠 브라운', price: 159000, discount: 15, likes: 4320, reviews: 876, rating: 4.8, sizes: SHOE_SIZES },
    { id: 'shoe-06', category: 'shoes', sub: '부츠', img: '1618947085672-1dcb69696c33', brand: 'HARDROCK', name: '워커 레이스업 부츠 블랙', price: 179000, discount: 20, likes: 6120, reviews: 1432, rating: 4.7, badge: '단독', sizes: SHOE_SIZES },
    { id: 'shoe-07', category: 'shoes', sub: '스니커즈', img: '1603808033176-9d134e6f2c74', brand: 'MODU', name: '스웨이드 레트로 스니커즈 샌드', price: 99000, discount: 35, likes: 3980, reviews: 765, rating: 4.5, sizes: SHOE_SIZES },
    { id: 'shoe-08', category: 'shoes', sub: '러닝화', img: '1542291026-7eec264c27ff', brand: 'VELOCE', name: '레이싱 카본 러닝화 레드', price: 199000, discount: 10, likes: 2870, reviews: 432, rating: 4.9, sizes: SHOE_SIZES },

    // 바지
    { id: 'pants-01', category: 'pants', sub: '데님 팬츠', img: '1542272604-787c3835535d', brand: 'INDIGO LAB', name: '와이드 스트레이트 데님 팬츠 다크 블루', price: 69000, discount: 30, likes: 15430, reviews: 4320, rating: 4.8, badge: '랭킹 1위', sizes: PANTS_SIZES },
    { id: 'pants-02', category: 'pants', sub: '데님 팬츠', img: '1714143164072-7646ef5cb24d', brand: 'INDIGO LAB', name: '셀비지 레귤러 데님 팬츠 로우', price: 89000, discount: 15, likes: 7210, reviews: 1654, rating: 4.7, sizes: PANTS_SIZES },
    { id: 'pants-03', category: 'pants', sub: '코튼 팬츠', img: '1473966968600-fa801b869a1a', brand: 'ATELIER 9', name: '투턱 와이드 치노 팬츠 베이지', price: 59000, discount: 20, likes: 8760, reviews: 2210, rating: 4.8, sizes: PANTS_SIZES },
    { id: 'pants-04', category: 'pants', sub: '코튼 팬츠', img: '1766575696324-5b65330f23c2', brand: 'NORDEN', name: '카고 포켓 코튼 팬츠 올리브 그레이', price: 65000, discount: 25, likes: 6540, reviews: 1320, rating: 4.6, badge: '단독', sizes: PANTS_SIZES },
    { id: 'pants-05', category: 'pants', sub: '트레이닝 팬츠', img: '1762575910569-46971cd69df3', brand: 'GREYHOUND', name: '스웻 조거 트레이닝 팬츠 블랙', price: 49000, discount: 40, likes: 11230, reviews: 3410, rating: 4.7, badge: '세일', sizes: PANTS_SIZES },
    { id: 'pants-06', category: 'pants', sub: '트레이닝 팬츠', img: '1789110520164-2389992e5d0f', brand: 'GREYHOUND', name: '와이드 트랙 팬츠 그레이', price: 55000, discount: 10, likes: 4320, reviews: 870, rating: 4.5, sizes: PANTS_SIZES },
    { id: 'pants-07', category: 'pants', sub: '숏 팬츠', img: '1591195853828-11db59a44f6b', brand: 'INDIGO LAB', name: '버뮤다 데님 숏 팬츠 라이트 블루', price: 45000, discount: 30, likes: 3210, reviews: 543, rating: 4.6, sizes: PANTS_SIZES },
    { id: 'pants-08', category: 'pants', sub: '숏 팬츠', img: '1621496503717-095a410e1566', brand: 'SEOUL BASIC', name: '나일론 이지 숏 팬츠 세이지', price: 39000, discount: 0, likes: 2140, reviews: 298, rating: 4.4, sizes: PANTS_SIZES }
  ];

  var SHIPPING = { freeOver: 50000, fee: 3000 };
  var MAX_QTY = 10;

  function salePrice(p) {
    return Math.round((p.price * (100 - p.discount)) / 100 / 100) * 100;
  }

  function findProduct(id) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i];
    return null;
  }

  /* items: [{ id, size, qty }] → 금액 계산. 잘못된 값이면 Error */
  function calcOrder(items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('주문 상품이 없습니다.');
    var lines = items.map(function (item) {
      var p = findProduct(item && item.id);
      if (!p) throw new Error('존재하지 않는 상품입니다.');
      if (p.sizes.indexOf(item.size) === -1) throw new Error('선택할 수 없는 사이즈입니다.');
      var qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new Error('수량이 올바르지 않습니다.');
      var unit = salePrice(p);
      return { product: p, size: item.size, qty: qty, unit: unit, subtotal: unit * qty };
    });
    var itemsTotal = lines.reduce(function (sum, l) { return sum + l.subtotal; }, 0);
    var shipping = itemsTotal >= SHIPPING.freeOver ? 0 : SHIPPING.fee;
    var first = lines[0].product.name;
    var orderName = lines.length > 1 ? first + ' 외 ' + (lines.length - 1) + '건' : first;
    return { lines: lines, itemsTotal: itemsTotal, shipping: shipping, amount: itemsTotal + shipping, orderName: orderName.slice(0, 100) };
  }

  var api = {
    CATEGORIES: CATEGORIES,
    PRODUCTS: PRODUCTS,
    SHIPPING: SHIPPING,
    MAX_QTY: MAX_QTY,
    salePrice: salePrice,
    findProduct: findProduct,
    calcOrder: calcOrder
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shop = api;
})(this);
