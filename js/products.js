/* 상품 규칙 + 주문 금액 계산 (브라우저와 서버 lib/payment.js에서 함께 사용)
   상품·재고 데이터는 Supabase에 있습니다. 브라우저는 js/db.js가 불러와 setProducts()로 넣고,
   서버는 요청마다 DB에서 읽어 calcOrder(items, products)에 넘깁니다. */
(function (root) {
  var CATEGORIES = {
    tops: { label: '상의', subs: ['반소매 티셔츠', '긴소매 티셔츠', '후드 티셔츠', '셔츠/블라우스'] },
    shoes: { label: '신발', subs: ['스니커즈', '러닝화', '부츠'] },
    pants: { label: '바지', subs: ['데님 팬츠', '코튼 팬츠', '트레이닝 팬츠', '숏 팬츠'] }
  };

  var SHIPPING = { freeOver: 50000, fee: 3000 };
  var MAX_QTY = 10;
  var PRODUCTS = [];

  /* DB 행(products + product_stock) → 화면에서 쓰는 상품 객체 */
  function fromRow(row) {
    var stockRows = (row.product_stock || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    var stock = {};
    stockRows.forEach(function (s) { stock[s.size] = s.stock; });
    return {
      id: row.id,
      category: row.category,
      sub: row.sub,
      img: row.img,
      brand: row.brand,
      name: row.name,
      price: row.price,
      discount: row.discount,
      badge: row.badge,
      sizes: stockRows.map(function (s) { return s.size; }),
      stock: stock,
      likes: row.like_count || 0,
      reviews: row.review_count || 0,
      rating: row.review_count ? Math.round((row.rating_sum / row.review_count) * 10) / 10 : 0
    };
  }

  function setProducts(list) {
    PRODUCTS.length = 0;
    Array.prototype.push.apply(PRODUCTS, list);
  }

  function salePrice(p) {
    return Math.round((p.price * (100 - p.discount)) / 100 / 100) * 100;
  }

  function findProduct(id, products) {
    var list = products || PRODUCTS;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function stockOf(p, size) {
    return (p && p.stock && p.stock[size]) || 0;
  }

  function isSoldOut(p) {
    return p.sizes.every(function (s) { return stockOf(p, s) <= 0; });
  }

  /* items: [{ id, size, qty }] → 금액 계산. 잘못된 값이면 Error */
  function calcOrder(items, products) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('주문 상품이 없습니다.');
    var lines = items.map(function (item) {
      var p = findProduct(item && item.id, products);
      if (!p) throw new Error('판매하지 않는 상품이 있습니다.');
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

  /* 재고보다 많이 담긴 줄 (같은 상품·사이즈가 여러 줄이면 합쳐서 비교) */
  function soldOutLines(lines) {
    var need = {};
    lines.forEach(function (l) {
      var key = l.product.id + '|' + l.size;
      need[key] = (need[key] || 0) + l.qty;
    });
    return lines.filter(function (l) {
      return need[l.product.id + '|' + l.size] > stockOf(l.product, l.size);
    });
  }

  var api = {
    CATEGORIES: CATEGORIES,
    PRODUCTS: PRODUCTS,
    SHIPPING: SHIPPING,
    MAX_QTY: MAX_QTY,
    fromRow: fromRow,
    setProducts: setProducts,
    salePrice: salePrice,
    findProduct: findProduct,
    stockOf: stockOf,
    isSoldOut: isSoldOut,
    calcOrder: calcOrder,
    soldOutLines: soldOutLines
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shop = api;
})(this);
