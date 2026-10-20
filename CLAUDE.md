# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

HTML·CSS·순수 JS로 만든 패션 쇼핑몰 데모(STYLEHAUS)에 토스페이먼츠 주문서형 결제(결제위젯 v2)를 붙인 프로젝트입니다. 빌드 단계와 npm 의존성이 없고, Vercel에 정적 파일과 서버리스 함수(`api/`)로 배포됩니다.

데이터는 Supabase(프로젝트 `stylehaus-shop`, ref `phtmnarkkeqngdqtiaaf`)에 있습니다: 상품·사이즈별 재고, 주문·결제 기록, 회원(이메일·카카오), 리뷰·좋아요. 기능 범위와 결정 사항은 `PRD.md`에 있습니다.

## 명령어

```bash
npm start                      # 로컬 개발 서버 (scripts/dev-server.js) → http://localhost:3000
node --check <file>            # 문법 검사 (린터·테스트 프레임워크는 없음)
```

로컬 서버는 루트의 `.env`(git·배포 제외)를 읽습니다. `SUPABASE_SERVICE_ROLE_KEY`가 없으면 상품 화면은 보이지만 주문·결제·취소 API가 실패합니다. `TOSS_SECRET_KEY`도 여기에 넣을 수 있습니다.

테스트 스위트는 없습니다. 변경 후에는 아래처럼 확인합니다.

- API: `curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' -d '{"items":[{"id":"top-01","size":"M","qty":1}]}'`
- 결제 전체 흐름: 브라우저에서 결제위젯의 퀵계좌이체 테스트 결제창으로 진행합니다(테스트 비밀번호 `000000`, 키패드 배치는 매번 바뀜).
- 권한(RLS): Supabase MCP `execute_sql`에서 `set local role authenticated` + `request.jwt.claims`로 회원을 흉내 내 확인합니다.
- 운영 배포: https://test-tosspayments-shop.vercel.app/ (`main`에 push하면 Vercel이 자동 배포)

## 아키텍처

### 브라우저 쪽: 전역 객체와 스크립트 순서

모듈 번들러 없이 전역 객체로 연결됩니다. 모든 페이지는 아래 순서로 로드해야 합니다.

`supabase-js(CDN, 버전 고정)` → `js/config.js` → `js/products.js` → `js/db.js` → `js/common.js` → 페이지별 스크립트

- `js/config.js`: `window.SHOP_CONFIG`. Supabase URL·anon 키, 토스 클라이언트 키 등 **공개 가능한 값만**. 서버도 `require`해서 기본값으로 씁니다.
- `js/products.js`: `window.Shop`. 카테고리·배송비 규칙과 `calcOrder(items, products?)`, `soldOutLines()`, DB 행을 화면용 객체로 바꾸는 `fromRow()`. UMD라 **서버도 이 파일로 금액을 다시 계산**합니다. 상품 데이터 자체는 DB에 있습니다.
- `js/db.js`: `window.DB`. Supabase 클라이언트, 상품 불러오기(`Shop.setProducts`), 로그인 상태, 좋아요·리뷰·주문 조회, 서버 API 호출(`DB.api`, 로그인 토큰을 `Authorization`에 실어 보냄).
- `js/common.js`: `window.UI`. 헤더(로그인/마이페이지 링크)·푸터, 상품 카드(품절·하트), 상세 모달(사이즈별 품절·리뷰 목록), 장바구니 드로어, 토스트.
- **페이지 스크립트는 `UI.ready.then(...)` 안에서 시작합니다.** 상품과 로그인 정보가 비동기로 오기 때문에, 그 전에는 `Shop.PRODUCTS`가 비어 있고 `UI.getCart()`도 빈 배열입니다.
- `<body data-category="tops|shoes|pants">` 또는 `data-page="home|checkout|success|fail|login|mypage|order"`가 헤더의 활성 탭과 `category.js`의 카테고리를 결정합니다.
- 상품 이미지는 Unsplash 사진 ID(`img` 필드)를 `UI.productImage(p, width)`가 `images.unsplash.com` URL로 만들어 씁니다.

저장소 키:

| 키 | 저장소 | 용도 |
| --- | --- | --- |
| `stylehaus_cart` | localStorage | 장바구니 `[{id, size, qty}]` (PRD 결정: 계정에 저장하지 않음) |
| `stylehaus_customer_key` | localStorage | 비회원의 결제위젯 `customerKey` (회원은 회원 id 사용) |
| `stylehaus_buynow` | sessionStorage | 바로구매 상품 (`checkout.html?mode=buynow`) |
| `stylehaus_pending_order` | sessionStorage | 결제 요청 시점의 `orderId`·`amount`·`mode` |
| `sb-…-auth-token` | localStorage | supabase-js 로그인 세션 |

### DB (Supabase)

스키마는 `supabase/migrations/`, 최초 상품·재고는 `supabase/seed.sql`입니다. 스키마를 바꾸면 새 마이그레이션 파일을 추가하고 MCP `apply_migration`으로 적용합니다.

- 테이블: `products`(판매 중지는 `is_active=false`), `product_stock`(상품×사이즈), `orders`, `order_items`(결제 당시 가격·이름 스냅샷), `payments`(토스 응답 기록), `profiles`, `reviews`(회원×상품 1개), `likes`
- `products.like_count/review_count/rating_sum`은 좋아요·리뷰 트리거가 맞춥니다. 직접 고치지 마세요.
- 주문 상태: `pending`(결제 대기) → `approving`(재고 차감 후 토스 승인 중) → `paid` / `failed`, 취소는 `paid` → `canceling` → `canceled`. 고객 화면에는 `paid`·`canceling`·`canceled`만 보입니다.
- 권한: 모든 테이블 RLS. 브라우저(anon/authenticated)는 상품·재고·리뷰 조회, 자기 주문 조회, 자기 리뷰(구매한 상품·사이즈만)·좋아요 쓰기만 가능합니다. 주문·재고·결제 쓰기는 `security definer` 함수(`create_order`, `begin_approval`, `finish_approval`, `abort_approval`, `mark_failed`, `begin_cancel`, `finish_cancel`, `abort_cancel`)로만 하며 `service_role`만 실행할 수 있습니다.

### 결제 흐름

1. `checkout.js`가 `POST /api/orders`를 호출합니다. 서버가 DB 가격으로 금액을 다시 계산하고 재고를 확인한 뒤 `pending` 주문을 저장합니다(로그인 상태면 회원과 연결). 품절이면 `SOLD_OUT`과 품목을 돌려줍니다.
2. 결제위젯 `requestPayment()`가 `success.html` 또는 `fail.html`로 리다이렉트합니다. 결제창을 닫거나 `fail.html`에 오면 `POST /api/fail`로 주문을 `failed`로 기록합니다.
3. `result.js`가 `POST /api/confirm`을 호출합니다. 서버는 금액을 `orders.amount`와 비교하고, `begin_approval`로 재고를 원자적으로 차감한 뒤에만 토스 승인 API를 호출합니다. 승인이 실패하면 `abort_approval`로 재고를 되돌립니다.
4. 이미 `paid`인 주문(새로고침)은 DB에 저장된 결과를 그대로 돌려줍니다. `approving`에 멈춘 주문은 토스 결제 조회로 마무리합니다.
5. 취소는 `POST /api/cancel`(로그인 필수, 본인·결제 완료·7일 이내): `begin_cancel` → 토스 취소 API → `finish_cancel`(재고 복구) 또는 실패 시 `abort_cancel`.

서버리스라 요청 간 메모리가 유지되지 않습니다. 주문 상태는 반드시 DB에 둡니다.

### 서버 쪽 파일

- `lib/payment.js`: 주문 생성·승인·실패 기록·취소 로직과 `handler()` 래퍼. Vercel(`req.body` 자동 파싱)과 Node 기본 `http`(스트림 읽기) 양쪽에서 동작합니다.
- `lib/supabase.js`: 외부 패키지 없이 fetch로 Supabase REST·RPC를 service role 키로 호출하고, `Authorization: Bearer <access_token>`으로 회원을 확인(`/auth/v1/user`)합니다.
- `api/orders.js`, `api/confirm.js`, `api/fail.js`, `api/cancel.js`: `lib/payment.js`의 핸들러를 내보내기만 하는 Vercel 함수입니다.
- `scripts/dev-server.js`: 로컬 전용. `.env`를 읽고 `/api/*`를 같은 핸들러로 연결하며, 정적 파일은 **루트의 `*.html`과 `css/`, `js/`만** 제공합니다. 공개 폴더를 새로 만들면 `PUBLIC_DIRS`에 추가해야 로컬에서 보입니다(Vercel은 `outputDirectory: "."`이라 별도 설정 없이 제공).

### Vercel 배포 주의점

- 루트에 `server.js`, `app.js`, `index.js` 같은 서버 엔트리 이름의 파일을 두지 마세요. Vercel이 이를 Node 서버로 감지해 모든 요청을 함수로 보내고, 정적 파일이 404가 되어 빈 화면이 납니다.
- `vercel.json`의 `"framework": null`은 대시보드에 저장된 프레임워크 프리셋을 덮어쓰기 위한 것입니다. 지우면 "No entrypoint found" 빌드 오류가 다시 납니다.
- `outputDirectory: "."`라서 루트의 모든 파일(`*.md` 등)이 그대로 공개됩니다. `supabase/`와 `.env`는 `.vercelignore`로 제외합니다. `lib/`는 API 함수가 쓰므로 제외하면 안 됩니다.
- Vercel 환경변수: `SUPABASE_SERVICE_ROLE_KEY`(필수), `TOSS_SECRET_KEY`(실제 상점 키를 쓸 때).
- Supabase Auth의 URL Configuration(Site URL·Redirect URLs)에 배포 주소를 넣어야 가입 확인·비밀번호 재설정·카카오 로그인 후 돌아올 수 있습니다. 카카오 로그인은 Supabase Auth Providers에서 Kakao를 켜야 버튼이 활성화됩니다.

## 키 관리

- 공개 키: `js/config.js`의 `SUPABASE_ANON_KEY`, `TOSS_CLIENT_KEY` (브라우저에 노출되어도 되는 anon 키와 `*_ck_*` / `*_gck_*`만)
- 비밀 키: 환경변수 `SUPABASE_SERVICE_ROLE_KEY`(RLS를 우회하므로 `lib/supabase.js`에서만 사용), `TOSS_SECRET_KEY`
- 토스 기본값은 문서에 공개된 테스트 키 한 쌍(`test_gck_docs_…` ↔ `test_gsk_docs_…`)입니다. 클라이언트 키와 시크릿 키는 같은 상점의 짝이어야 하므로 한쪽만 바꾸면 승인이 실패합니다.
- 토스 서버 API(`api.tosspayments.com`)는 `lib/payment.js`에서만 호출합니다. 브라우저 코드에서 직접 부르지 않습니다.

## 토스페이먼츠 문서 조회

`.mcp.json`에 토스페이먼츠 연동 가이드 MCP 서버(`tosspayments-integration-guide`)가 설정되어 있습니다. SDK 메서드나 API 파라미터를 확인할 때는 기억에 의존하지 말고 `get-documents`로 조회하세요(기본 v2).

## 코드 관례

- 브라우저 JS(`js/`)는 즉시 실행 함수와 `var`/`function`을 쓰는 ES5 스타일입니다. `async/await`는 결제위젯 호출부(`checkout.js`)에서만 쓰고, 나머지 비동기는 Promise `.then`으로 씁니다. Node 쪽(`lib/`, `api/`, `scripts/`)은 `const`/화살표 함수를 씁니다.
- 주석, UI 문구, README는 한국어로 씁니다.
- 커밋 메시지는 `feat:`/`fix:` 접두어에 한국어 제목과 본문을 씁니다.

## 소통 방식

- 저장소 주인은 비개발자입니다. 계획이나 질문은 기술 용어 대신 고객·운영자가 체감하는 기능 중심으로 설명하고, 기술적인 결정은 추천안으로 진행한 뒤 알려주세요.
