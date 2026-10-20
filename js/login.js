/* 로그인 · 회원가입 · 비밀번호 재설정 (login.html?mode=login|signup|reset|update&next=…) */
window.UI.ready.then(function () {
  var UI = window.UI;
  var DB = window.DB;
  var auth = DB.client.auth;
  var config = window.SHOP_CONFIG;
  var params = new URLSearchParams(location.search);
  var hash = new URLSearchParams(location.hash.slice(1));
  var root = document.getElementById('auth');
  var mode = params.get('mode') || 'login';
  var base = location.origin + location.pathname.replace(/[^/]*$/, '');

  // 로그인 후 돌아갈 페이지: 같은 사이트의 .html만 허용
  var next = params.get('next') || 'index.html';
  if (!/^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next) || /^login\.html/.test(next)) next = 'index.html';

  function pageUrl(m) {
    return 'login.html?mode=' + m + '&next=' + encodeURIComponent(next);
  }

  // 이메일 확인 링크·카카오 로그인에서 돌아온 경우: 세션이 생겼으면 원래 페이지로
  if (DB.user() && mode !== 'update') {
    location.replace(next);
    return;
  }

  var MESSAGES = [
    [/invalid login credentials/i, '이메일 또는 비밀번호가 올바르지 않습니다.'],
    [/email not confirmed/i, '이메일 인증이 아직 끝나지 않았습니다. 가입할 때 받은 메일의 확인 링크를 눌러 주세요.'],
    [/already registered/i, '이미 가입된 이메일입니다.'],
    [/password should be at least/i, '비밀번호는 8자 이상이어야 합니다.'],
    [/should be different from the old password/i, '이전과 다른 비밀번호를 입력해 주세요.'],
    [/rate limit|too many|security purposes/i, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
    [/expired|invalid.*(link|token)/i, '링크가 만료되었습니다. 다시 요청해 주세요.']
  ];

  function koMessage(err) {
    var msg = (err && (err.message || err)) || '';
    for (var i = 0; i < MESSAGES.length; i++) if (MESSAGES[i][0].test(msg)) return MESSAGES[i][1];
    return msg || '잠시 후 다시 시도해 주세요.';
  }

  function message(text, isError) {
    var el = root.querySelector('[data-msg]');
    el.textContent = text;
    el.className = 'auth-msg' + (isError ? ' error' : '');
    el.hidden = !text;
  }

  function field(name, label, type, attrs) {
    return '<div class="field"><label for="' + name + '">' + label + '</label>' +
      '<input id="' + name + '" name="' + name + '" type="' + type + '" required ' + (attrs || '') + '></div>';
  }

  function tabs() {
    return '<nav class="auth-tabs"><a href="' + pageUrl('login') + '"' + (mode === 'login' ? ' class="active"' : '') + '>로그인</a>' +
      '<a href="' + pageUrl('signup') + '"' + (mode === 'signup' ? ' class="active"' : '') + '>회원가입</a></nav>';
  }

  var kakaoBlock =
    '<div class="divider">또는</div>' +
    '<button type="button" class="btn btn-kakao btn-block" data-kakao>카카오로 ' + (mode === 'signup' ? '시작하기' : '로그인') + '</button>' +
    '<p class="hint" data-kakao-hint hidden>카카오 로그인은 준비 중입니다.</p>';

  var VIEWS = {
    login: '<h1>로그인</h1>' + tabs() +
      '<form novalidate>' + field('email', '이메일', 'email', 'autocomplete="email"') +
      field('password', '비밀번호', 'password', 'autocomplete="current-password"') +
      '<p data-msg hidden></p><button class="btn btn-black btn-block">로그인</button></form>' +
      '<div class="auth-links"><a href="' + pageUrl('reset') + '">비밀번호를 잊으셨나요?</a></div>' + kakaoBlock,
    signup: '<h1>회원가입</h1>' + tabs() +
      '<form novalidate>' + field('name', '이름', 'text', 'autocomplete="name" maxlength="20"') +
      field('email', '이메일', 'email', 'autocomplete="email"') +
      field('password', '비밀번호 (8자 이상)', 'password', 'autocomplete="new-password" minlength="8"') +
      '<p data-msg hidden></p><button class="btn btn-black btn-block">가입하기</button></form>' + kakaoBlock,
    reset: '<h1>비밀번호 재설정</h1><p class="desc">가입한 이메일로 재설정 링크를 보내드립니다.</p>' +
      '<form novalidate>' + field('email', '이메일', 'email', 'autocomplete="email"') +
      '<p data-msg hidden></p><button class="btn btn-black btn-block">재설정 링크 받기</button></form>' +
      '<div class="auth-links"><a href="' + pageUrl('login') + '">로그인으로 돌아가기</a></div>',
    update: '<h1>새 비밀번호 설정</h1><p class="desc">새로 사용할 비밀번호를 입력해 주세요.</p>' +
      '<form novalidate>' + field('password', '새 비밀번호 (8자 이상)', 'password', 'autocomplete="new-password" minlength="8"') +
      '<p data-msg hidden></p><button class="btn btn-black btn-block">비밀번호 변경</button></form>'
  };

  root.innerHTML = VIEWS[mode] || VIEWS.login;
  if (!VIEWS[mode]) mode = 'login';

  // 메일 링크가 만료됐거나 카카오 로그인을 취소하고 돌아온 경우
  var urlError = hash.get('error_description') || params.get('error_description');
  if (urlError) message(koMessage(urlError.replace(/\+/g, ' ')), true);
  if (mode === 'update' && !DB.user()) message('링크가 만료되었거나 잘못되었습니다. 비밀번호 재설정을 다시 요청해 주세요.', true);

  // 카카오 로그인이 Supabase에서 켜져 있는지 확인
  var kakaoBtn = root.querySelector('[data-kakao]');
  if (kakaoBtn) {
    fetch(config.SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: config.SUPABASE_ANON_KEY } })
      .then(function (res) { return res.json(); })
      .then(function (s) {
        if (!(s.external && s.external.kakao)) {
          kakaoBtn.disabled = true;
          root.querySelector('[data-kakao-hint]').hidden = false;
        }
      })
      .catch(function () { /* 확인 실패 시 버튼은 그대로 둔다 */ });

    kakaoBtn.addEventListener('click', function () {
      auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo: base + 'login.html?next=' + encodeURIComponent(next) }
      }).then(function (res) {
        if (res.error) message(koMessage(res.error), true);
      });
    });
  }

  var form = root.querySelector('form');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var button = form.querySelector('button');
    var v = {
      name: form.name ? form.name.value.trim() : '',
      email: form.email ? form.email.value.trim() : '',
      password: form.password ? form.password.value : ''
    };

    if (form.name && !v.name) return message('이름을 입력해 주세요.', true);
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return message('이메일을 확인해 주세요.', true);
    if (form.password && (mode === 'signup' || mode === 'update') && v.password.length < 8) return message('비밀번호는 8자 이상이어야 합니다.', true);
    if (form.password && !v.password) return message('비밀번호를 입력해 주세요.', true);

    message('');
    button.disabled = true;

    var job;
    if (mode === 'login') {
      job = auth.signInWithPassword({ email: v.email, password: v.password }).then(function (res) {
        if (res.error) throw res.error;
        location.replace(next);
      });
    } else if (mode === 'signup') {
      job = auth.signUp({
        email: v.email,
        password: v.password,
        options: { data: { name: v.name }, emailRedirectTo: base + 'login.html?next=' + encodeURIComponent(next) }
      }).then(function (res) {
        if (res.error) throw res.error;
        if (res.data.session) return location.replace(next);
        // 이미 가입된 이메일이면 identities가 비어 있다 (보안상 오류 대신 이렇게 응답함)
        if (res.data.user && res.data.user.identities && res.data.user.identities.length === 0) throw new Error('already registered');
        form.hidden = true;
        root.querySelector('.auth-tabs').insertAdjacentHTML('afterend',
          '<p class="auth-msg">' + UI.esc(v.email) + ' 주소로 확인 메일을 보냈습니다.<br>메일의 링크를 누르면 가입이 완료되고 로그인됩니다.</p>');
      });
    } else if (mode === 'reset') {
      job = auth.resetPasswordForEmail(v.email, { redirectTo: base + 'login.html?mode=update' }).then(function (res) {
        if (res.error) throw res.error;
        message('재설정 링크를 보냈습니다. 메일함을 확인해 주세요.');
      });
    } else {
      job = auth.updateUser({ password: v.password }).then(function (res) {
        if (res.error) throw res.error;
        UI.toast('비밀번호를 변경했습니다.');
        setTimeout(function () { location.replace('mypage.html'); }, 800);
      });
    }

    job.catch(function (err) {
      message(koMessage(err), true);
    }).then(function () {
      button.disabled = false;
    });
  });
});
