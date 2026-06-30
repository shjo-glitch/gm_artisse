# 아띠제 음료 주문표

사내 구성원의 음료 주문을 한 화면에서 수집하고, Supabase로 실시간 동기화하는 웹 앱입니다.
별도의 애플리케이션 서버 없이 **정적 프론트엔드(HTML/CSS/JS) + Supabase(Postgres·Realtime)** 로 동작하며, GitHub Pages로 배포합니다.

## 아키텍처 개요

```
브라우저 (index.html / admin.html)
   │  @supabase/supabase-js (CDN)
   ▼
Supabase
   ├─ Postgres   : config · drinks · orders 테이블
   └─ Realtime   : 테이블 변경을 모든 접속자에게 push
```

- 프론트엔드는 Supabase JS 클라이언트로 DB를 직접 조회/수정합니다. (애플리케이션 서버 없음)
- 한 사람이 주문을 추가/수정/삭제하거나 관리자가 설정을 바꾸면 Supabase Realtime이 모든 접속자 화면을 즉시 갱신합니다.
- 접속 환경 설정(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_PASSWORD`)은 `src/frontend/supabase-config.js`에서 전역 변수로 주입됩니다. 이 파일은 저장소에 커밋되지 않으며, 배포 시 GitHub Actions가 시크릿으로 생성합니다.

## 사전 준비: Supabase

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/schema.sql`을 실행해 테이블·Realtime·RLS를 만듭니다.
   - 기존 인스턴스를 업그레이드하는 경우에는 `supabase/migrations/0001_grande_and_order_close.sql`을 1회 실행하세요.
3. 프로젝트의 `Project URL`과 `anon public` 키를 확인해 둡니다.

## 로컬 실행

`src/frontend/`를 정적으로 서빙하면 됩니다.

```bash
cd /path/to/attije-order-sheet
# 1) supabase-config.js 생성 (아래 형식)
# 2) 정적 서버 실행
npm run dev          # npx serve src/frontend
# 또는: python3 -m http.server -d src/frontend 4000
```

`src/frontend/supabase-config.js` 형식:

```js
const SUPABASE_URL = 'https://<project>.supabase.co';
const SUPABASE_ANON_KEY = '<anon-key>';
const ADMIN_PASSWORD = '<관리자 비밀번호>';   // 비우면 관리자 기능이 잠금 해제됨
```

## 배포 (GitHub Pages)

`.github/workflows/deploy.yml`가 `main` 브랜치 push 시 자동 배포합니다.

- 빌드 단계에서 저장소 시크릿으로 `supabase-config.js`를 생성합니다.
- 다음 시크릿을 저장소 `Settings → Secrets and variables → Actions`에 등록하세요.
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `ADMIN_PASSWORD`

## 관리자

관리자 기능은 `ADMIN_PASSWORD`로 보호됩니다.

- 주문표(`index.html`)의 **관리자 페이지** 링크를 누르면 비밀번호를 묻고, 통과하면 `admin.html`로 이동합니다. (세션 동안 유지)
- 인증된 관리자에게만 주문표의 **주문 마감/재개**, **전체 초기화** 버튼이 노출됩니다.
- `admin.html`에서 팀원 명단, 옵션 목록, 음료 배열(카테고리·Tall/Grande 가격·ICE only)을 편집합니다.

> 보안 참고: RLS는 내부 도구 특성상 anon 키로 전체 허용이며, 관리자 게이트는 클라이언트 측 검증입니다. 사내 비공개 사용을 전제로 합니다.

## 주요 기능

### 주문 추가/수정/삭제
- 메뉴를 카테고리 드롭다운에서 선택하거나 직접 입력
- 온도 선택(HOT / ICE, 기본 ICE), ICE only 음료는 HOT 비활성
- 주문자 선택 (1인 1주문 — 이미 주문한 사람은 제외, 수정 중에는 예외)
- 사이즈 선택 (Tall / Grande), Grande 가격이 0인 메뉴는 Grande 비활성
- 옵션 다중 선택 및 새 옵션 추가
- 비고 작성

### 주문 마감 / 재개 (관리자 전용)
- 관리자가 **주문 마감**을 누르면 그 시점부터 모든 사용자의 주문 추가·수정·삭제·초기화가 차단되고, 화면 상단에 마감 안내 배너가 표시됩니다.
- **주문 재개**를 누르면 다시 주문할 수 있습니다.
- 마감 상태는 `config.orders_closed`에 저장되어 Realtime으로 전 접속자에게 즉시 반영됩니다.

### 실시간 동기화 (Supabase Realtime)
- `orders` / `drinks` / `config` 테이블 변경을 구독하여 모든 접속자 화면을 자동 갱신

### 주문 명세서 자동 집계
- 메뉴명·사이즈·온도·옵션이 동일한 주문을 자동으로 묶음
- `메뉴 온도 사이즈(옵션) x수량 --- 총 금액` 형식으로 표시하고 전체 총액을 계산

### 시즌 메뉴 자동 표시
- 아띠제 공식 새메뉴 API(`cafeartisee.apis.flyground.co.kr/new-menu`)를 프론트에서 직접 조회
- 제목에 "음료" 키워드가 포함되고 현재 날짜가 판매 기간 내인 항목만 표시

### 토스트 알림
- 신규/삭제 메뉴, 가격 변경, 팀원 추가/제외, 주문 마감/재개 시 우측 하단에 토스트 알림

## 데이터 모델 (Supabase)

| 테이블 | 주요 컬럼 |
| --- | --- |
| `config` | `users text[]`, `options text[]`, `orders_closed boolean` (단일 행, id=1) |
| `drinks` | `category`, `name`, `tall_price`, `grande_price`, `ice_only`, `sort_order` |
| `orders` | `id`, `menu_name`, `category`, `requester`, `size`('Tall'\|'Grande'), `temp`('ICE'\|'HOT'), `options text[]`, `note`, `unit_price`, `created_at`, `updated_at` |

## 소스코드 구조

```
attije-order-sheet/
├── src/frontend/
│   ├── index.html          # 주문표 UI (시즌메뉴, 주문 폼, 명세서, 마감 배너)
│   ├── admin.html          # 관리자 페이지 (팀원/옵션/음료 편집)
│   ├── script.js           # 주문표 로직, Supabase CRUD·Realtime, 마감/재개
│   ├── admin.js            # 관리자 페이지 로직
│   ├── styles.css          # 전체 스타일
│   └── supabase-config.js  # (미커밋) 환경 설정 주입
├── supabase/
│   ├── schema.sql                              # 전체 스키마 (신규 인스턴스용)
│   └── migrations/0001_grande_and_order_close.sql  # 기존 인스턴스 업그레이드
├── .github/workflows/deploy.yml   # GitHub Pages 배포
├── package.json
└── README.md / SPEC.md
```

## 검증

```bash
npm run verify   # script.js / admin.js 구문 검사 (node --check)
```
