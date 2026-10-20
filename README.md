# STYLEHAUS — 토스페이먼츠 결제 연동 쇼핑몰 데모

HTML·CSS·JS로 만든 패션 쇼핑몰 데모입니다. 토스페이먼츠 주문서형 결제(결제위젯 v2)로 결제 승인·취소까지 동작하고, 상품·재고·주문·회원·리뷰·좋아요는 Supabase 데이터베이스에 저장됩니다.

## 실행

Node.js 18 이상이 필요하며, 외부 패키지는 없습니다.

1. 프로젝트 폴더에 `.env` 파일을 만들고 Supabase 서버 키를 넣습니다. (Supabase 대시보드 → Project Settings → API Keys → `service_role`)

   ```
   SUPABASE_SERVICE_ROLE_KEY=여기에_붙여넣기
   ```

2. 개발 서버를 실행합니다.

   ```bash
   npm start
   ```

3. http://localhost:3000 으로 접속합니다.

`.env`는 git과 배포에 포함되지 않습니다. 키가 없으면 상품 화면은 보이지만 주문·결제는 되지 않습니다.

## 페이지

| 파일 | 내용 |
| --- | --- |
| `index.html` | 홈: 배너, 카테고리별 랭킹, 검색 |
| `tops.html` · `shoes.html` · `pants.html` | 상의·신발·바지 목록 (품절 표시, 좋아요, 상세 모달·리뷰, 장바구니) |
| `checkout.html` | 주문서: 배송 정보와 토스페이먼츠 결제위젯 |
| `success.html` · `fail.html` | 결제 승인 결과 / 실패 안내 |
| `login.html` | 로그인·회원가입(이메일, 카카오)·비밀번호 재설정 |
| `mypage.html` · `order.html` | 내 주문 목록 / 주문 상세(취소, 리뷰 쓰기) |

## 운영자 가이드 (Supabase 관리 화면)

별도 관리자 페이지 없이 Supabase 대시보드의 **Table Editor**에서 직접 관리합니다. 수정하면 고객 화면에 바로 반영됩니다.

| 하고 싶은 일 | 테이블 | 바꿀 칸 |
| --- | --- | --- |
| 가격·할인율·이름·배지·사진 변경 | `products` | `price`, `discount`, `name`, `badge`, `img` |
| 판매 중지(목록에서 숨기기) | `products` | `is_active`를 `false`로 (삭제하지 마세요. 지난 주문 기록은 남습니다) |
| 사이즈별 재고 변경 | `product_stock` | `stock` (0이면 품절) |
| 주문 확인 | `orders`, `order_items` | `status`: paid(결제 완료), failed(결제 실패), canceled(취소 완료) 등 |
| 결제·취소 원본 기록 | `payments` | 토스페이먼츠 응답 |

`like_count`, `review_count`, `rating_sum`은 자동으로 계산되므로 직접 고치지 마세요. 비회원 주문 취소는 토스페이먼츠 관리 화면에서 처리합니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `*.html`, `css/`, `js/` | 정적 페이지 (Vercel이 그대로 제공) |
| `api/orders.js`, `api/confirm.js`, `api/fail.js`, `api/cancel.js` | Vercel 서버리스 함수 |
| `lib/payment.js`, `lib/supabase.js` | 주문·결제·취소 로직과 DB 호출 (API 함수와 개발 서버가 함께 사용) |
| `supabase/` | DB 스키마(마이그레이션)와 최초 상품 데이터 (배포에서 제외) |
| `scripts/dev-server.js` | 로컬 개발 서버 |

## 결제 흐름

1. `checkout.html`에서 `POST /api/orders`를 호출합니다. 서버가 DB 가격으로 금액을 다시 계산하고 재고를 확인한 뒤 주문을 "결제 대기"로 저장합니다.
2. 결제위젯에서 결제하면 `success.html`로 돌아옵니다(실패·중단이면 `fail.html`, 주문은 "결제 실패"로 기록).
3. `success.html`에서 `POST /api/confirm`을 호출합니다. 서버가 저장된 주문 금액과 비교하고, 재고를 먼저 차감한 뒤 토스페이먼츠 승인 API를 호출합니다. 그 사이 품절됐다면 승인하지 않습니다.
4. 회원은 주문 상세에서 결제 후 7일 이내 전체 취소할 수 있고, 취소하면 환불과 함께 재고가 다시 늘어납니다.

## 배포 설정 (Vercel + Supabase)

- Vercel → Settings → Environment Variables에 `SUPABASE_SERVICE_ROLE_KEY`를 추가합니다. 실제 상점 키를 쓰면 `TOSS_SECRET_KEY`도 추가합니다.
- Supabase → Authentication → URL Configuration에서 **Site URL**을 배포 주소(예: `https://test-tosspayments-shop.vercel.app`)로 바꾸고, **Redirect URLs**에 배포 주소와 `http://localhost:3000`을 `/**`로 추가합니다. 가입 확인·비밀번호 재설정 메일의 링크가 이 주소로 돌아옵니다.
- 카카오 로그인: Kakao Developers에서 앱을 만들고, Supabase → Authentication → Providers → Kakao에 REST API 키와 Client Secret을 넣어 켭니다. 켜기 전에는 로그인 화면의 카카오 버튼이 "준비 중"으로 비활성화됩니다. 카카오에서 이메일을 받으려면 카카오 앱에서 이메일 동의 항목을 설정해야 합니다.

## 키 설정

토스페이먼츠 기본값은 문서에 공개된 **테스트 키**이며, 실제 돈은 나가지 않습니다.

- 공개 키(브라우저에 노출 가능): `js/config.js`의 Supabase URL·anon 키, 토스 클라이언트 키
- 비밀 키(환경변수로만): `SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`. 코드에 커밋하지 마세요.

## 기타

- 상품 이미지는 [Unsplash](https://unsplash.com) 무료 이미지입니다 (Unsplash License).
- `.mcp.json`에는 토스페이먼츠 연동 가이드 MCP 서버 설정이 들어 있습니다 (Claude Code용).
