# 아띠제 음료 주문표

사내 구성원의 음료 주문을 수집하고 함께 확인하는 웹 앱입니다. 화면과 API는 Cloudflare Pages에서 호스팅하며 주문·메뉴·설정 데이터는 Cloudflare D1 데이터베이스에 저장합니다.

## 아키텍처

```text
브라우저 (/ 주문 화면 · /v1/ 이전 주문표 · /admin 관리자)
        │ /api/*
        ▼
Cloudflare Pages Functions (functions/api) ──┐
        │ DB 바인딩                           │ "지금 확인"
        ▼                                     ▼
Cloudflare D1  ◀──────────  새메뉴 자동 반영 (lib/season-sync.js)
  ├─ config                    ▲    │ 포스터 읽기
  ├─ drinks                    │    ▼
  ├─ orders            Cron Worker   Workers AI (Qwen 3.8 27B)
  ├─ menu_events       (매달 1일 09:00)
  └─ season_sync
```

- 브라우저는 데이터베이스에 직접 접근하지 않고 `/api/*` API만 호출합니다.
- 주문·메뉴·설정은 5초 간격으로 다시 확인해 여러 접속자의 화면을 동기화합니다.
- 관리자 비밀번호는 Pages 시크릿으로만 보관하고 API에서 검증합니다.
- 주문 화면의 "진행중인 시즌메뉴" 안내는 브라우저가 아띠제 새메뉴 API를 직접 조회합니다.
- 새메뉴 자동 반영은 매달 1일 09:00(KST)에 Cron Worker가, 또는 관리자 화면의 "지금 확인" 버튼으로 실행합니다.

## 데이터 모델

| 테이블 | 주요 컬럼 |
| --- | --- |
| `config` | `users`, `options`, `orders_closed` |
| `drinks` | `category`, `name`, `tall_price`(Petit), `grande_price`, `ice_only`, `hot_only`, `extras`(유료 옵션 JSON), `sort_order`, `source_event_id` |
| `orders` | `id`, `menu_name`, `category`, `requester`, `size`, `temp`, `options`, `note`, `unit_price`, 타임스탬프 |
| `menu_events` | 처리한 새메뉴 행사: `id`, `title`, `release_date`, `expire_date`, `status`, `items`, `attempts`, `error` |
| `season_sync` | 마지막 새메뉴 확인 결과 (단일 행) |

배포 스키마와 초기 데이터는 `migrations/`에 있으며, 소스 수준 스키마 정의는 `db/schema.ts`에 있습니다.

## 주요 기능

- 카테고리별 음료 선택 또는 직접 입력 주문
- 주문 화면(`/`, 키오스크 형태): 카테고리 탭 → 음료 타일 → 온도·사이즈·유료 옵션(샷 추가 등)·요청사항·주문자 선택. 유료 옵션 금액은 주문 금액과 명세서 합계에 더합니다.
- HOT/ICE, Petit/Grande, 복수 옵션, 비고
- 주문 추가·수정·삭제 및 명세서 자동 집계
- 관리자 화면(`/admin`): 팀원·요청사항(쉼표·줄바꿈으로 여러 개 입력, 바로 저장), 메뉴 표 편집, 메뉴별 유료 옵션 편집(묶음 추가·다른 메뉴에서 가져오기·카테고리 전체 적용), 새메뉴 자동 반영
- 새메뉴 자동 반영: 새 음료 행사의 포스터를 읽어 시즌음료로 추가하고, 판매가 끝나면 삭제
- 관리자 페이지의 주문 마감/재개와 전체 초기화
- 진행 중인 시즌 메뉴 안내
- 여러 접속자 간 5초 주기 자동 동기화

## 새메뉴 자동 반영

1. 아띠제 새메뉴 API에서 제목에 "음료"가 들어간 행사 가운데 판매 중인 것을 찾습니다.
2. 판매 종료일이 지난 행사에서 들어온 음료(`drinks.source_event_id`)는 메뉴에서 삭제합니다. 종료일이 없는 상시 메뉴는 삭제하지 않습니다.
3. 아직 처리하지 않은 행사는 포스터 이미지를 Workers AI(`@cf/qwen/qwen3.8-27b`)로 읽어 메뉴명과 Petit(P)/Grande(G) 가격을 뽑고, `season` 카테고리로 추가합니다. 같은 이름의 시즌음료가 이미 있으면 행사에 연결만 하고, 상시 메뉴에 같은 이름이 있으면 건드리지 않습니다.

- 포스터 읽기에 실패한 행사는 자동 실행에서 3번까지 다시 시도하고, "지금 확인"은 횟수와 상관없이 다시 시도합니다.
- AI가 읽은 가격이 1,000~15,000원 범위를 벗어나면 그 항목은 넣지 않습니다. ICE 전용 여부와 유료 옵션은 포스터로 알 수 없으므로 필요하면 관리자 화면의 메뉴·유료 옵션 탭에서 고칩니다.
- 관리자 화면에서 메뉴를 저장해도 같은 이름의 음료는 행사 연결이 유지됩니다. 이름을 바꾸면 연결이 끊겨 자동 삭제되지 않습니다.

## 메뉴 데이터 (아티제 앱 기준)

음료 메뉴, 사이즈별 가격, 유료 옵션은 아티제 앱(아티제 커넥트, 서초역점)의 전체메뉴에서 수집했습니다. 수집본은 `seeds/app-menu-*.json`, D1에 넣는 SQL은 `seeds/app-menu-*.sql`입니다.

- 앱의 "아이스 ○○(P)", "○○(G)" 같은 상품은 메뉴 하나로 묶고, HOT/ICE 판매 여부와 Petit/Grande 가격으로 바꿉니다. Grande는 (G) 상품 가격, 없으면 사이즈업 추가금을 더한 값입니다.
- 음료 카테고리는 시즌(음료만), 에스프레소, 콜드브루, 스무디&에이드, 티&기타, 프라페, 리얼후르츠, 병음료(앱의 "음료")입니다. "주문 안함"과 직접 입력은 기타에 있습니다.
- 수집 시점의 품절 표시는 매장 재고 상황이라 저장하지 않습니다.
- 다시 수집할 때: 안드로이드 에뮬레이터에 클럽 아티제 앱을 설치·로그인하고 전체메뉴 탭을 연 뒤 `python3 scripts/app-menu-crawler/crawl.py seeds/app-menu-<날짜>.json`을 실행합니다. 장바구니 담기·주문하기·결제하기 영역은 누르지 않고, 장바구니에 무언가 담기면 즉시 멈춥니다.
- 다시 만들 때: `node scripts/build-menu-seed.mjs seeds/app-menu-<날짜>.json <행사.json> > seeds/app-menu-<날짜>.sql` 후 `npx wrangler d1 execute DB --remote --file seeds/app-menu-<날짜>.sql`

## 관리자 인증

관리자 아이디(`ADMIN_ID`)와 비밀번호(`ADMIN_PASSWORD`)는 Pages 시크릿으로 관리합니다. 브라우저에는 설정값을 내려주지 않으며, 관리자 API 요청마다 서버에서 둘 다 검증합니다. 둘 중 하나라도 설정되지 않은 환경에서는 관리자 기능이 모두 거부됩니다.

관리자 페이지는 주문 화면에서 링크하지 않습니다. `/admin`에 들어가면 상단 바 아래를 로그인 화면이 덮고 있고, 아이디와 비밀번호를 입력하면 관리 패널이 나타납니다. 패널 맨 위의 주문 상태 줄(접수 중/마감, 주문 건수·합계, 10초마다 갱신)에서 주문 마감·재개와 전체 초기화를 합니다. 저장소가 공개되어 있으므로 주소를 숨기는 대신 서버의 아이디·비밀번호 검사로 보호합니다.

## 로컬 실행

```bash
npm install
printf "ADMIN_ID=admin\nADMIN_PASSWORD=원하는-비밀번호\n" > .dev.vars
npm run db:migrate:local   # 로컬 D1에 테이블과 초기 데이터 생성
npm run dev                # http://localhost:8788
npm run verify             # 문법 검사
```

## 배포

처음 한 번만 아래 순서로 준비합니다.

```bash
npx wrangler d1 create attije-order-sheet-db       # 출력된 database_id를 wrangler.toml에 적기
npm run db:migrate:remote                          # 원격 D1에 테이블과 초기 데이터 생성
npx wrangler pages project create attije-order-sheet --production-branch main
npx wrangler pages secret put ADMIN_ID --project-name attije-order-sheet
npx wrangler pages secret put ADMIN_PASSWORD --project-name attije-order-sheet
```

새메뉴 자동 반영용 Cron Worker는 `npm run season:deploy`로 따로 배포합니다. (`wrangler.season.toml`, 같은 D1과 Workers AI를 씁니다)

이후에는 `npm run deploy`로 배포합니다. 주소는 `https://attije-order-sheet.pages.dev`입니다. wrangler는 `npx wrangler login` 계정 또는 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID` 환경 변수로 인증합니다.

스키마를 바꿀 때는 `migrations/`에 다음 번호의 SQL 파일을 추가하고 `npm run db:migrate:remote`를 실행합니다.

## 구조

```text
├── src/frontend/              # 주문 화면(/, index.html·kiosk.*)·관리자(/admin)·공용 스타일과 파비콘 (Pages 정적 파일)
├── src/frontend/v1/           # 이전 주문표 (/v1/, script.js 사용)
├── src/frontend/_redirects    # 예전 /v2/ 주소를 / 로 보냄
├── functions/api/[[path]].js  # /api/* 처리 (Pages Functions)
├── lib/season-sync.js         # 새메뉴 자동 반영 (Pages Functions와 Cron Worker가 함께 사용)
├── workers/season-sync.js     # 매달 1일 09:00 새메뉴 확인 Cron Worker
├── db/schema.ts               # D1 스키마 정의
├── migrations/                # D1 마이그레이션
├── seeds/                     # 아티제 앱에서 수집한 메뉴와 D1용 SQL
├── scripts/app-menu-crawler/   # 아티제 앱 메뉴 수집 (에뮬레이터 + adb)
├── scripts/build-menu-seed.mjs  # 수집 메뉴 → SQL 변환
├── wrangler.toml              # Pages 프로젝트, D1·Workers AI 바인딩
├── wrangler.season.toml       # Cron Worker 설정
└── package.json
```
