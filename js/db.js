/* Supabase 연결: 상품 불러오기, 로그인, 좋아요·리뷰·주문 조회 (window.DB)
   브라우저는 anon 키만 쓰며, 무엇을 읽고 쓸 수 있는지는 DB의 RLS 정책이 정합니다. */
(function () {
  var config = window.SHOP_CONFIG;
  var Shop = window.Shop;
  var client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  var state = { session: null, profile: null, likes: {} };
  var listeners = [];

  function check(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  // ---------- 상품 ----------
  function loadProducts() {
    return client.from('products')
      .select('id,category,sub,img,brand,name,price,discount,badge,like_count,review_count,rating_sum,product_stock(size,stock,sort_order)')
      .order('sort_order')
      .then(check)
      .then(function (rows) { Shop.setProducts(rows.map(Shop.fromRow)); });
  }

  // ---------- 회원 ----------
  function user() {
    return state.session ? state.session.user : null;
  }

  function loadMember() {
    state.profile = null;
    state.likes = {};
    var u = user();
    if (!u) return Promise.resolve();
    return Promise.all([
      client.from('profiles').select('name,email').eq('id', u.id).maybeSingle().then(check),
      client.from('likes').select('product_id').then(check)
    ]).then(function (r) {
      state.profile = r[0];
      r[1].forEach(function (l) { state.likes[l.product_id] = true; });
    });
  }

  function displayName() {
    var u = user();
    if (!u) return '';
    return (state.profile && state.profile.name) || (u.user_metadata && u.user_metadata.name) || u.email || '회원';
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  var ready = client.auth.getSession()
    .then(function (res) { state.session = res.data.session; })
    .then(function () { return Promise.all([loadProducts(), loadMember()]); });

  // 다른 탭에서 로그인/로그아웃하거나 토큰이 갱신된 경우
  client.auth.onAuthStateChange(function (event, session) {
    var before = user() && user().id;
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') listeners.forEach(function (fn) { fn(event); });
    if ((session && session.user.id) === before) return;
    loadMember().then(function () { listeners.forEach(function (fn) { fn(event); }); });
  });

  function accessToken() {
    return client.auth.getSession().then(function (res) {
      return res.data.session ? res.data.session.access_token : null;
    });
  }

  // ---------- 서버 API (/api/*) ----------
  function api(path, body) {
    return accessToken().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(body) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  // ---------- 좋아요 ----------
  function isLiked(productId) {
    return !!state.likes[productId];
  }

  function toggleLike(productId) {
    var p = Shop.findProduct(productId);
    var liked = isLiked(productId);
    var req = liked
      ? client.from('likes').delete().eq('user_id', user().id).eq('product_id', productId)
      : client.from('likes').insert({ product_id: productId });
    return req.then(function (res) {
      // 이미 눌러 둔 상태(중복)면 좋아요로 맞춘다
      if (res.error && res.error.code !== '23505') throw res.error;
      if (liked) delete state.likes[productId];
      else state.likes[productId] = true;
      if (p && !(res.error && res.error.code === '23505')) p.likes = Math.max(0, p.likes + (liked ? -1 : 1));
      return !liked;
    });
  }

  // ---------- 리뷰 ----------
  function listReviews(productId) {
    return client.from('reviews')
      .select('id,user_id,size,rating,content,author_name,created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(check);
  }

  function myReviews(productIds) {
    if (!user() || !productIds.length) return Promise.resolve([]);
    return client.from('reviews').select('id,product_id,size,rating,content')
      .eq('user_id', user().id).in('product_id', productIds).then(check);
  }

  function saveReview(review) {
    var req = review.id
      ? client.from('reviews').update({ rating: review.rating, content: review.content }).eq('id', review.id)
      : client.from('reviews').insert({ product_id: review.productId, size: review.size, rating: review.rating, content: review.content });
    return req.then(check);
  }

  function deleteReview(id) {
    return client.from('reviews').delete().eq('id', id).then(check);
  }

  // ---------- 주문 ----------
  var ORDER_FIELDS = 'id,status,order_name,items_total,shipping,amount,method,receipt_url,approved_at,canceled_at,created_at,' +
    'order_items(id,product_id,size,qty,unit_price,product_name,brand,img)';

  function myOrders() {
    return client.from('orders').select(ORDER_FIELDS).order('created_at', { ascending: false }).then(check);
  }

  function getOrder(id) {
    return client.from('orders').select(ORDER_FIELDS).eq('id', id).maybeSingle().then(check);
  }

  window.DB = {
    client: client,
    ready: ready,
    reloadProducts: loadProducts,
    user: user,
    displayName: displayName,
    onChange: onChange,
    api: api,
    isLiked: isLiked,
    toggleLike: toggleLike,
    listReviews: listReviews,
    myReviews: myReviews,
    saveReview: saveReview,
    deleteReview: deleteReview,
    myOrders: myOrders,
    getOrder: getOrder
  };
})();
