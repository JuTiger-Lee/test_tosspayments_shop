/*
 * 서버 전용 Supabase 호출 (외부 패키지 없이 REST API를 fetch로 호출)
 * service role 키는 RLS를 우회하므로 이 파일을 통해 서버에서만 씁니다.
 */
const config = require('../js/config.js');

const SUPABASE_URL = process.env.SUPABASE_URL || config.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function serviceHeaders() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
  const headers = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  // 새 형식(sb_secret_…) 키는 apikey 헤더로만 보내고, 기존 JWT 키는 Authorization에도 넣는다
  if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = 'Bearer ' + SERVICE_KEY;
  return headers;
}

async function rest(path, { method = 'GET', body } = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: serviceHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error('DB 오류: ' + ((data && data.message) || res.status));
  return data;
}

const select = (path) => rest(path);
const rpc = (fn, args) => rest('rpc/' + fn, { method: 'POST', body: args });

// Authorization: Bearer <access_token> → 로그인한 회원 정보 (없거나 만료면 null)
async function getUser(req) {
  const match = /^Bearer (.+)$/.exec((req.headers && req.headers.authorization) || '');
  if (!match) return null;
  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + match[1] }
  });
  return res.ok ? res.json() : null;
}

module.exports = { select, rpc, getUser };
