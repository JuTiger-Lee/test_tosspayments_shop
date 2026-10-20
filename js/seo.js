/* 검색엔진·AI 답변 엔진용 구조화 데이터 (홈·카테고리 페이지)
   상품은 DB에서 비동기로 오므로, 불러온 뒤 상품 목록(ItemList > Product)을 JSON-LD로 넣습니다.
   검색 결과(?q=) 화면은 검색엔진에 색인되지 않도록 noindex를 붙입니다. */
window.UI.ready.then(function () {
  var Shop = window.Shop;
  var SITE = 'https://test-tosspayments-shop.vercel.app/';
  var category = document.body.dataset.category;
  var pageUrl = SITE + (category ? category + '.html' : '');

  if (!category && new URLSearchParams(location.search).get('q')) {
    var robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, follow';
    document.head.appendChild(robots);
    return;
  }

  var list = Shop.PRODUCTS.filter(function (p) { return !category || p.category === category; })
    .sort(function (a, b) { return b.likes - a.likes; });

  function product(p) {
    var item = {
      '@type': 'Product',
      sku: p.id,
      name: p.name,
      brand: { '@type': 'Brand', name: p.brand },
      category: Shop.CATEGORIES[p.category].label + ' > ' + p.sub,
      image: 'https://images.unsplash.com/photo-' + p.img + '?fit=crop&crop=entropy&auto=format&q=75&w=800&h=960',
      offers: {
        '@type': 'Offer',
        url: pageUrl,
        price: Shop.salePrice(p),
        priceCurrency: 'KRW',
        availability: Shop.isSoldOut(p) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'KR' },
          shippingRate: { '@type': 'MonetaryAmount', value: Shop.salePrice(p) >= Shop.SHIPPING.freeOver ? 0 : Shop.SHIPPING.fee, currency: 'KRW' }
        }
      }
    };
    if (p.reviews) item.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews, bestRating: 5, worstRating: 1 };
    return item;
  }

  var data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: category ? 'STYLEHAUS ' + Shop.CATEGORIES[category].label + ' 상품' : 'STYLEHAUS 인기 상품',
    url: pageUrl,
    numberOfItems: list.length,
    itemListElement: list.map(function (p, i) {
      return { '@type': 'ListItem', position: i + 1, item: product(p) };
    })
  };

  var script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
});
