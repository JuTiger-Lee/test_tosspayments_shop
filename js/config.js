/* 공개해도 되는 설정값 (브라우저와 서버가 함께 사용)
   비밀 값(토스 시크릿 키, Supabase service role 키)은 여기에 두지 않고 서버 환경변수로만 넣습니다. */
(function (root) {
  var config = {
    SUPABASE_URL: 'https://phtmnarkkeqngdqtiaaf.supabase.co',
    // anon 키: RLS로 보호되므로 브라우저에 노출되어도 됩니다
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodG1uYXJra2VxbmdkcXRpYWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTczNzgsImV4cCI6MjEwODAzMzM3OH0.HMMgPT6EO_RT8H38-uYe6ChkogMbxEpYUYeunmmORc8',
    // 토스페이먼츠 클라이언트 키 (문서용 공개 테스트 키 — 실제 상점 키로 교체하세요)
    TOSS_CLIENT_KEY: 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.SHOP_CONFIG = config;
})(this);
