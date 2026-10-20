# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

HTML·CSS·순수 JS로 만든 패션 쇼핑몰 데모(STYLEHAUS)에 토스페이먼츠 주문서형 결제(결제위젯 v2)를 붙인 프로젝트입니다. 빌드 단계와 npm 의존성이 없고, Vercel에 정적 파일과 서버리스 함수(`api/`)로 배포됩니다.

## 명령어

```bash
npm start                      # 로컬 개발 서버 (scripts/dev-server.js) → http://localhost:3000
TOSS_SECRET_KEY=test_sk_xxx npm start   # 상점 테스트 키로 실행
node --check <file>            # 문법 검사 (린터·테스트 프레임워크는 없음)
```

테스트 스위트는 없습니다. 변경 후에는 아래처럼 확인합니다.

- API: `curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' -d '{"items":[{"id":"top-01","size":"M","qty":1}]}'`
- 결제 전체 흐름: 브라우저에서 결제위젯의 퀵계좌이체 테스트 결제창으로 진행합니다(테스트 비밀번호 `000000`, 키패드 배치는 매번 바뀜).
- 운영 배포: https://test-tosspayments-shop.vercel.app/ (`main`에 push하면 Vercel이 자동 배포)

## 아키텍처

### 브라우저 쪽: 전역 객체와 스크립트 순서

모듈 번들러 없이 전역 객체로 연결됩니다. 모든 페이지는 `js/products.js` → `js/common.js` → 페이지별 스크립트 순서로 로드해야 합니다.

- `js/products.js`: 상품 데이터와 `calcOrder()`(금액·배송비·주문명 계산). 브라우저에서는 `window.Shop`, Node에서는 `module.exports`로 노출되는 UMD 형태이며, **서버도 이 파일로 금액을 다시 계산**합니다. 가격·배송비 규칙은 여기 한 곳에서만 바꿉니다.
- `js/common.js`: `window.UI`. `#header`/`#footer` 자리표시자를 헤더·푸터로 교체하고, 상품 카드·상세 모달·장바구니 드로어·토스트를 그립니다. `[data-product-id]` 클릭은 문서 전체에서 위임 처리합니다.
- `<body data-category="tops|shoes|pants">` 또는 `data-page="home|checkout|success|fail"`이 헤더의 활성 탭과 `category.js`의 카테고리를 결정합니다. 카테고리 페이지 3개는 같은 HTML 구조에 `data-category`만 다릅니다.
- 상품 이미지는 Unsplash 사진 ID(`img` 필드)를 `UI.productImage(p, width)`가 `images.unsplash.com` URL로 만들어 씁니다.

저장소 키:

| 키 | 저장소 | 용도 |
| --- | --- | --- |
| `stylehaus_cart` | localStorage | 장바구니 `[{id, size, qty}]` |
| `stylehaus_customer_key` | localStorage | 결제위젯 `customerKey` |
| `stylehaus_buynow` | sessionStorage | 바로구매 상품 (`checkout.html?mode=buynow`) |
| `stylehaus_pending_order` | sessionStorage | 결제 요청 시점의 `orderId`·`amount`·`orderToken` |

### 결제 흐름 (DB 없는 무상태 검증)

1. `checkout.js`가 `POST /api/orders`를 호출합니다. `lib/payment.js`가 `calcOrder()`로 금액을 다시 계산하고, `orderId:amount`를 HMAC-SHA256으로 서명한 `orderToken`을 발급합니다.
2. 결제위젯 `requestPayment()`가 `success.html` 또는 `fail.html`로 리다이렉트합니다.
3. `result.js`가 `POST /api/confirm`에 `orderToken`을 함께 보냅니다. 서버는 서명으로 금액 위변조를 검증한 뒤 토스 승인 API를 호출합니다.
4. 승인 응답이 `ALREADY_PROCESSED_PAYMENT`면 결제 조회 API로 기존 결과를 돌려줍니다. 그래서 성공 페이지를 새로고침해도 결과가 유지되며, 이를 위해 `stylehaus_pending_order`는 승인 후에도 지우지 않습니다.

서버리스라 요청 간 메모리가 유지되지 않으므로, 주문을 메모리에 저장하는 방식으로 되돌리지 마세요.

### 서버 쪽 파일

- `lib/payment.js`: 주문 생성·승인 로직과 `handler()` 래퍼. Vercel(`req.body` 자동 파싱)과 Node 기본 `http`(스트림 읽기) 양쪽에서 동작합니다.
- `api/orders.js`, `api/confirm.js`: `lib/payment.js`의 핸들러를 내보내기만 하는 Vercel 함수입니다.
- `scripts/dev-server.js`: 로컬 전용. `/api/*`를 같은 핸들러로 연결하고, 정적 파일은 **루트의 `*.html`과 `css/`, `js/`만** 제공합니다. 공개 폴더를 새로 만들면 `PUBLIC_DIRS`에 추가해야 로컬에서 보입니다(Vercel은 `outputDirectory: "."`이라 별도 설정 없이 제공).

### Vercel 배포 주의점

- 루트에 `server.js`, `app.js`, `index.js` 같은 서버 엔트리 이름의 파일을 두지 마세요. Vercel이 이를 Node 서버로 감지해 모든 요청을 함수로 보내고, 정적 파일이 404가 되어 빈 화면이 납니다.
- `vercel.json`의 `"framework": null`은 대시보드에 저장된 프레임워크 프리셋을 덮어쓰기 위한 것입니다. 지우면 "No entrypoint found" 빌드 오류가 다시 납니다.

## 키 관리

- 클라이언트 키: `js/checkout.js`의 `CLIENT_KEY` (브라우저에 노출되어도 되는 `*_ck_*` / `*_gck_*`만)
- 시크릿 키: 환경변수 `TOSS_SECRET_KEY`. 서명 키는 `ORDER_SIGNING_KEY`이며, 없으면 시크릿 키를 씁니다.
- 기본값은 토스 문서에 공개된 테스트 키 한 쌍(`test_gck_docs_…` ↔ `test_gsk_docs_…`)입니다. 클라이언트 키와 시크릿 키는 같은 상점의 짝이어야 하므로 한쪽만 바꾸면 승인이 실패합니다.
- 토스 서버 API(`api.tosspayments.com`)는 `lib/payment.js`에서만 호출합니다. 브라우저 코드에서 직접 부르지 않습니다.

## 토스페이먼츠 문서 조회

`.mcp.json`에 토스페이먼츠 연동 가이드 MCP 서버(`tosspayments-integration-guide`)가 설정되어 있습니다. SDK 메서드나 API 파라미터를 확인할 때는 기억에 의존하지 말고 `get-documents`로 조회하세요(기본 v2).

## 코드 관례

- 브라우저 JS(`js/`)는 즉시 실행 함수와 `var`/`function`을 쓰는 ES5 스타일입니다. `async/await`는 결제위젯 호출부(`checkout.js`)에서만 씁니다. Node 쪽(`lib/`, `api/`, `scripts/`)은 `const`/화살표 함수를 씁니다.
- 주석, UI 문구, README는 한국어로 씁니다.
- 커밋 메시지는 `feat:`/`fix:` 접두어에 한국어 제목과 본문을 씁니다.
