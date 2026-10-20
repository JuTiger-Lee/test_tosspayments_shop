# STYLEHAUS — 토스페이먼츠 결제 연동 쇼핑몰 데모

HTML·CSS·JS로 만든 패션 쇼핑몰 퍼블리싱 데모입니다. 토스페이먼츠 주문서형 결제(결제위젯 v2)로 결제 승인까지 동작합니다.

## 실행

Node.js 18 이상이 필요하며, 외부 패키지는 없습니다. `npm start`는 로컬 개발 서버(`scripts/dev-server.js`)를 실행합니다.

```bash
npm start
```

http://localhost:3000 으로 접속합니다.

## 페이지

| 파일 | 내용 |
| --- | --- |
| `index.html` | 홈: 배너, 카테고리별 랭킹, 검색 |
| `tops.html` · `shoes.html` · `pants.html` | 상의·신발·바지 목록 (세부 필터, 정렬, 상세 모달, 장바구니) |
| `checkout.html` | 주문서: 배송 정보와 토스페이먼츠 결제위젯 |
| `success.html` · `fail.html` | 결제 승인 결과 / 실패 안내 |

## 구조

| 경로 | 역할 |
| --- | --- |
| `*.html`, `css/`, `js/` | 정적 페이지 (Vercel이 그대로 제공) |
| `api/orders.js`, `api/confirm.js` | Vercel 서버리스 함수 |
| `lib/payment.js` | 주문 생성·결제 승인 로직 (API 함수와 개발 서버가 함께 사용) |
| `scripts/dev-server.js` | 로컬 개발 서버 |

## 결제 흐름

1. `checkout.html`에서 `POST /api/orders`를 호출합니다. 서버가 상품 데이터로 금액을 다시 계산하고, 주문번호와 금액을 HMAC으로 서명한 `orderToken`을 함께 발급합니다.
2. 결제위젯에서 결제를 요청하면 `success.html`로 리다이렉트됩니다.
3. `success.html`에서 `POST /api/confirm`을 호출합니다. 서버가 `orderToken`으로 금액을 검증한 뒤 시크릿 키로 토스페이먼츠 승인 API를 호출합니다.

## 키 설정

기본값은 토스페이먼츠 문서에 공개된 **테스트 키**이며, 실제 돈은 나가지 않습니다. 실제 상점 키는 아래 위치에 넣습니다.

- 클라이언트 키: `js/checkout.js`의 `CLIENT_KEY`
- 시크릿 키: 환경변수로 넣습니다. 코드에 커밋하지 마세요.

```bash
TOSS_SECRET_KEY=test_sk_xxx npm start
```

Vercel에서는 프로젝트 Settings → Environment Variables에 `TOSS_SECRET_KEY`를 추가합니다.

> 주문은 DB 없이 서명 토큰으로만 검증합니다. 운영 환경에서는 주문을 DB에 저장하고, 중복 승인과 재고를 관리하세요.

## 기타

- 상품 이미지는 [Unsplash](https://unsplash.com) 무료 이미지입니다 (Unsplash License).
- `.mcp.json`에는 토스페이먼츠 연동 가이드 MCP 서버 설정이 들어 있습니다 (Claude Code용).
