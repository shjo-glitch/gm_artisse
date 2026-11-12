# 아띠제 음료 주문표

사내 구성원의 음료 주문을 수집하고 함께 확인하는 웹 앱입니다. 팀원은 회사 Microsoft 계정(Entra ID)으로 로그인해서 자기 이름으로 주문하고, 관리자는 주문을 열고 닫으면서 팀즈 채널에 알리거나 아직 주문하지 않은 사람에게 팀즈 개인 메시지를 보냅니다. 화면과 API는 Cloudflare Pages에서 호스팅하며 주문·메뉴·설정 데이터는 Cloudflare D1 데이터베이스에 저장합니다. 같은 코드를 도커 이미지로 만들어 사내 쿠버네티스에서도 돌릴 수 있습니다(아래 "사내 쿠버네티스 배포").

## 아키텍처

```text
브라우저 (/ 주문 화면 · /admin 관리자)
        │ /api/*  (주문 화면: MS 로그인 세션 쿠키 · 관리자: 아이디·비밀번호)
        ▼
Cloudflare Pages Functions (functions/api) ──┬──▶ Microsoft Entra ID (로그인, lib/auth.js)
        │ DB 바인딩                           ├──▶ Power Automate 워크플로 ──▶ 팀즈 채널 · 개인 채팅 (lib/teams.js)
        │                                     │ "지금 확인"
        ▼                                     ▼
Cloudflare D1  ◀──────────  새메뉴 자동 반영 (lib/season-sync.js)
  ├─ config                    ▲    │ 포스터 읽기
  ├─ members                   │    ▼
  ├─ drinks            Cron Worker   Workers AI (Qwen 3.8 27B)
  ├─ orders            (매달 1일 09:00)
  ├─ order_history
  ├─ menu_events
  └─ season_sync
```

- 브라우저는 데이터베이스에 직접 접근하지 않고 `/api/*` API만 호출합니다.
- 주문 화면은 MS 로그인을 해야 열립니다. 주문자는 로그인한 사람으로 정해지고, 다른 사람의 주문은 볼 수만 있고 고칠 수 없습니다.
- 주문·메뉴·설정은 5초 간격으로 다시 확인해 여러 접속자의 화면을 동기화합니다.
- 관리자 비밀번호, Entra 앱 비밀, 팀즈 워크플로 주소는 Pages 시크릿으로만 보관합니다.
- 주문 화면의 "진행중인 시즌메뉴" 안내는 브라우저가 아띠제 새메뉴 API를 직접 조회합니다.
- 새메뉴 자동 반영은 매달 1일 09:00(KST)에 Cron Worker가, 또는 관리자 화면의 "지금 확인" 버튼으로 실행합니다.

## 데이터 모델

| 테이블 | 주요 컬럼 |
| --- | --- |
| `config` | `options`, `orders_closed`, `round_started_at`(이번 주문을 시작한 시각), `users`(예전 이름 목록, 지금은 안 씀) |
| `members` | 팀원 명단: `name`, `email`, `oid`(연결된 Entra 계정), `last_login_at`, `last_nudged_at` |
| `drinks` | `category`, `name`, `tall_price`(Petit), `grande_price`, `ice_only`, `hot_only`, `extras`(유료 옵션 JSON), `sort_order`, `source_event_id` |
| `orders` | 이번 주문: `id`, `member_id`(팀원당 하나), `requester`, `menu_name`, `category`, `size`, `temp`, `options`, `note`, `unit_price`, 타임스탬프 |
| `order_history` | "새 주문 시작" 때 옮겨 둔 지난 주문. `orders` 컬럼에 `round_started_at`, `archived_at`을 더한 모양 |
| `menu_events` | 처리한 새메뉴 행사: `id`, `title`, `release_date`, `expire_date`, `status`, `items`, `attempts`, `error` |
| `season_sync` | 마지막 새메뉴 확인 결과 (단일 행) |

배포 스키마와 초기 데이터는 `migrations/`에 있으며, 소스 수준 스키마 정의는 `db/schema.ts`에 있습니다.

## 주요 기능

- 주문 화면(`/`, 키오스크 형태): MS 로그인 → 카테고리 탭 → 음료 타일 → 온도·사이즈·유료 옵션(샷 추가 등)·요청사항. 주문자를 고르는 칸은 없고, 로그인한 사람 이름으로 들어갑니다. 유료 옵션 금액은 주문 금액과 명세서 합계에 더합니다.
- 1인 1주문: 이미 주문한 사람이 다른 음료를 고르면 새 주문이 아니라 내 주문이 그 음료로 바뀝니다.
- 내 주문 창(상단의 "○○님" 버튼): 이번 주문을 보고 고치거나 취소하고, 지난 주문 목록에서 "이 메뉴로 주문"으로 같은 음료를 다시 고릅니다.
- 주문 현황 창: 전체 주문 목록, 아직 주문하지 않은 사람, 주문 명세서. 고치기·취소 버튼은 내 주문에만 있습니다.
- 관리자 화면(`/admin`):
  - 주문 현황 탭: 팀원별 주문 여부와 메뉴, 미주문자에게 개별·전체 독촉(팀즈 개인 메시지), 팀즈 채널에 현황 보내기
  - 상단 상태 줄: 주문 마감·재개, 새 주문 시작. 셋 다 팀즈 채널 알림을 같이 보낼지 고르고, 알림에 덧붙일 말을 적을 수 있습니다.
  - 팀원 탭: 이름과 회사 이메일 관리, MS 계정 연결 상태 확인과 연결 해제
  - 요청사항, 메뉴 표 편집, 메뉴별 유료 옵션 편집(묶음 추가·다른 메뉴에서 가져오기·카테고리 전체 적용), 새메뉴 자동 반영
- 새메뉴 자동 반영: 새 음료 행사의 포스터를 읽어 시즌음료로 추가하고, 판매가 끝나면 삭제
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

## MS 로그인 (Entra ID)

주문 화면은 회사 Microsoft 계정으로 로그인해야 열립니다. 서버(Pages Functions)가 Entra ID와 OpenID Connect 인가 코드 방식(PKCE 포함)으로 로그인을 처리하고, 서명한 세션 쿠키(30일)를 내려 줍니다. 브라우저에는 토큰을 남기지 않습니다.

로그인한 계정은 `members` 명단과 아래 순서로 맞춥니다. 명단에 없는 계정은 주문 화면에 들어오지 못합니다.

1. 이미 연결된 계정(`oid`)이면 그 팀원입니다. 표시 이름이 바뀌어도 그대로 이어집니다.
2. 명단에 같은 회사 이메일이 있으면 그 팀원과 연결합니다. 대소문자는 가리지 않습니다.
3. 이메일이 비어 있는 팀원 가운데 이름이 같은 사람이 한 명이면 연결합니다. Entra 표시 이름이 "조수한 (JO SOO HAN)"처럼 영문이 붙어 있어도 한글 이름으로 찾습니다. `TEAM_DEPARTMENTS` 시크릿을 넣으면 그 부서 사람만 이름으로 연결합니다.

동명이인이 회사에 있다면 이름 연결이 잘못 붙을 수 있습니다. 관리자 화면 팀원 탭에서 회사 이메일을 미리 넣어 두면 이메일로만 연결하므로 이 문제가 없고, 로그인한 적 없는 사람에게도 팀즈 독촉을 보낼 수 있습니다. 잘못 연결됐으면 팀원 탭의 "연결 해제"를 누릅니다. 그 계정은 바로 로그아웃되고, 다음 로그인 때 다시 연결합니다.

### Entra 앱 등록

Microsoft Entra 관리 센터의 앱 등록(App registrations)에서 새 앱을 한 번 등록합니다. 테넌트 정책에 따라 앱 등록이나 동의에 관리자 권한이 필요할 수 있습니다.

1. 새 등록: 이름은 자유롭게 짓고, 지원되는 계정 유형은 "이 조직 디렉터리의 계정만"(단일 테넌트)을 고릅니다.
2. 리디렉션 URI: 플랫폼 "웹"에 `https://attije-order-sheet.pages.dev/api/auth/callback`을 넣습니다. 로컬에서 실제 MS 로그인을 시험하려면 `http://localhost:8788/api/auth/callback`도 더합니다.
3. 개요 화면의 "디렉터리(테넌트) ID"와 "애플리케이션(클라이언트) ID"를 적어 둡니다.
4. 인증서 및 암호 → 새 클라이언트 암호를 만들고 "값"을 적어 둡니다. 만료일이 지나면 로그인이 멈추므로 만료 전에 새로 만들어 시크릿을 바꿉니다.
5. API 권한은 기본으로 들어 있는 Microsoft Graph `User.Read`(위임)면 됩니다. 로그인할 때 표시 이름·메일·부서를 읽는 데 씁니다.

## 팀즈 알림

팀즈로 보내는 메시지는 Power Automate 워크플로 두 개가 받아서 전달합니다. 서버는 워크플로 주소로 적응형 카드(JSON)를 POST할 뿐이라 Graph 권한이나 봇 등록이 필요 없습니다. 주소에 서명이 들어 있으므로 시크릿으로 보관합니다.

| 시크릿 | 쓰는 곳 | 보내는 내용 |
| --- | --- | --- |
| `TEAMS_CHANNEL_WEBHOOK_URL` | 주문 마감·재개, 새 주문 시작(알림 체크 시), "팀즈 채널에 현황 보내기" | 시작 안내와 주문 링크 / 응답 인원·건수·합계, 주문 명세, 미주문자 이름 |
| `TEAMS_DM_WEBHOOK_URL` | 주문 현황 탭의 "독촉", "미주문자 모두 독촉" | 받는 사람 한 명에게 "아직 주문이 없어요" 카드와 주문 링크 |

둘 중 없는 것은 관리자 화면에서 버튼이 꺼지고 안내 문구가 나옵니다. 독촉은 이메일이 있는 미주문자에게만 보내고, 같은 사람에게는 10분에 한 번만 보냅니다. 주문이 마감된 동안에는 보내지 않습니다.

### 채널 알림 워크플로

알림을 받을 팀즈 채널에서 "워크플로"를 열고, 템플릿 "웹후크 요청이 수신되면 채널에 게시"(Post to a channel when a webhook request is received)로 만듭니다. 만들고 나면 나오는 주소를 `TEAMS_CHANNEL_WEBHOOK_URL`에 넣습니다. 서버가 보내는 본문은 이 템플릿이 받는 형식(`attachments[].content`에 적응형 카드)과 같습니다.

### 개인 독촉 워크플로

Power Automate에서 흐름을 새로 만듭니다.

1. 트리거: "Teams 웹후크 요청을 받을 때"(When a Teams webhook request is received). 흐름을 트리거할 수 있는 사람은 "누구나"(Anyone)로 둡니다. 서버가 로그인 없이 호출하기 때문입니다.
2. 동작: "채팅 또는 채널에 카드 게시"(Post card in a chat or channel). 게시자는 "Flow bot", 게시 위치는 "Flow bot과 채팅", 받는 사람은 식 `triggerBody()?['recipient']`, 적응형 카드는 식 `triggerBody()?['attachments']?[0]?['content']`.
3. 저장하면 트리거에 나오는 주소를 `TEAMS_DM_WEBHOOK_URL`에 넣습니다.

서버는 미주문자 한 명마다 `{ "recipient": "회사 이메일", "attachments": [적응형 카드] }`를 한 번씩 보냅니다.

## 관리자 인증

관리자 아이디(`ADMIN_ID`)와 비밀번호(`ADMIN_PASSWORD`)는 Pages 시크릿으로 관리합니다. 브라우저에는 설정값을 내려주지 않으며, 관리자 API 요청마다 서버에서 둘 다 검증합니다. 둘 중 하나라도 설정되지 않은 환경에서는 관리자 기능이 모두 거부됩니다.

관리자 화면의 아이디·비밀번호 로그인은 MS 로그인과 따로 동작합니다. 주문은 MS 계정으로만 하고, 관리 기능은 이 아이디·비밀번호로만 엽니다.

관리자 페이지는 주문 화면에서 링크하지 않습니다. `/admin`에 들어가면 상단 바 아래를 로그인 화면이 덮고 있고, 아이디와 비밀번호를 입력하면 관리 패널이 나타납니다. 패널 맨 위의 주문 상태 줄(접수 중/마감, 주문 건수·합계·미주문 인원, 10초마다 갱신)에서 주문 마감·재개와 새 주문 시작을 합니다. "새 주문 시작"은 지금 주문을 `order_history`로 옮기고 주문을 비운 뒤 접수를 엽니다. 옮긴 주문은 각자의 내 주문 창 "지난 주문"에 남습니다. 저장소가 공개되어 있으므로 주소를 숨기는 대신 서버의 아이디·비밀번호 검사로 보호합니다.

## 로컬 실행

```bash
npm install
cat > .dev.vars <<EOF
ADMIN_ID=admin
ADMIN_PASSWORD=원하는-비밀번호
SESSION_SECRET=$(openssl rand -base64 32)
DEV_LOGIN=1
EOF
npm run db:migrate:local   # 로컬 D1에 테이블과 초기 데이터 생성
npm run dev                # http://localhost:8788
npm run verify             # 문법 검사
```

`DEV_LOGIN=1`이면 `localhost`로 접속했을 때 로그인 화면에 팀원 이름 버튼이 나와서 MS 로그인 없이 그 사람으로 들어갈 수 있습니다. 운영 시크릿에는 절대 넣지 않습니다. 실제 MS 로그인을 시험하려면 `.dev.vars`에 `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`을 더하고 Entra 앱에 `http://localhost:8788/api/auth/callback`을 등록합니다. 팀즈 알림을 시험하려면 `TEAMS_CHANNEL_WEBHOOK_URL`, `TEAMS_DM_WEBHOOK_URL`도 더합니다.

## 배포

처음 한 번만 아래 순서로 준비합니다.

```bash
npx wrangler d1 create attije-order-sheet-db       # 출력된 database_id를 wrangler.toml에 적기
npm run db:migrate:remote                          # 원격 D1에 테이블과 초기 데이터 생성
npx wrangler pages project create attije-order-sheet --production-branch main
npx wrangler pages secret put ADMIN_ID --project-name attije-order-sheet
npx wrangler pages secret put ADMIN_PASSWORD --project-name attije-order-sheet
# MS 로그인 (위 "Entra 앱 등록"에서 적어 둔 값). SESSION_SECRET은 openssl rand -base64 32 같은 임의 값
npx wrangler pages secret put ENTRA_TENANT_ID --project-name attije-order-sheet
npx wrangler pages secret put ENTRA_CLIENT_ID --project-name attije-order-sheet
npx wrangler pages secret put ENTRA_CLIENT_SECRET --project-name attije-order-sheet
npx wrangler pages secret put SESSION_SECRET --project-name attije-order-sheet
# 팀즈 알림 (위 "팀즈 알림"에서 만든 워크플로 주소)
npx wrangler pages secret put TEAMS_CHANNEL_WEBHOOK_URL --project-name attije-order-sheet
npx wrangler pages secret put TEAMS_DM_WEBHOOK_URL --project-name attije-order-sheet
```

선택 시크릿: `TEAM_DEPARTMENTS`(이름으로 처음 연결할 때 허용할 Entra 부서, 쉼표로 구분. 예: `Team engineering 1`), `APP_URL`(팀즈 카드의 "주문하러 가기" 주소. 없으면 요청이 들어온 주소를 씁니다).

`SESSION_SECRET`을 바꾸면 모든 사람이 로그아웃됩니다.

새메뉴 자동 반영용 Cron Worker는 `npm run season:deploy`로 따로 배포합니다. (`wrangler.season.toml`, 같은 D1과 Workers AI를 씁니다)

이후에는 `npm run deploy`로 배포합니다. 주소는 `https://attije-order-sheet.pages.dev`입니다. wrangler는 `npx wrangler login` 계정 또는 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID` 환경 변수로 인증합니다.

스키마를 바꿀 때는 `migrations/`에 다음 번호의 SQL 파일을 추가하고 `npm run db:migrate:remote`를 실행합니다.

### MS 로그인으로 처음 바꿀 때 (0.4.0)

순서가 중요합니다. 코드를 먼저 올리면 시크릿이 없어 로그인 버튼이 꺼진 채로 열리고, 그동안 아무도 주문하지 못합니다.

1. Entra 앱을 등록하고, 팀즈 워크플로 두 개를 만듭니다.
2. 위의 시크릿을 모두 넣습니다. Pages 시크릿은 다음 배포부터 적용됩니다.
3. `npm run db:migrate:remote`로 `0004_members.sql`을 적용합니다. `config.users`의 이름이 `members`로 옮겨지고, 진행 중인 주문은 주문자 이름으로 팀원과 이어집니다. 지금 돌고 있는 이전 코드와도 함께 동작하므로 배포 전에 적용해도 됩니다.
4. `npm run deploy`로 배포합니다.
5. 관리자 화면 팀원 탭에서 회사 이메일을 채웁니다. 비워 둔 사람은 처음 로그인할 때 이름으로 연결됩니다.

이전 주문표(`/v1/`)는 주문자를 이름으로 골라서 로그인 구조와 맞지 않아 없앴고, 그 주소는 `/`로 보냅니다.

## 사내 쿠버네티스 배포 (도커)

같은 코드를 Node 서버 하나로 돌립니다. `functions/`와 `lib/`는 고치지 않고, Cloudflare가 하던 일만 `server/`가 대신합니다.

| Cloudflare | 쿠버네티스 |
| --- | --- |
| Pages 정적 파일·`_redirects` | `server/server.mjs`가 `src/frontend`를 같은 규칙으로 제공 (`/admin` → `admin.html`) |
| Pages Functions | 같은 `onRequest`를 Node `http` 서버에서 호출 |
| D1 | 퍼시스턴트 볼륨의 SQLite 파일 `/data/attije.db` (`server/d1.mjs`, Node 내장 `node:sqlite`) |
| `wrangler d1 migrations apply` | 서버가 시작할 때 `migrations/`에서 남은 것만 적용 (기록은 D1과 같은 `d1_migrations` 테이블) |
| Cron Worker (매달 1일 09:00) | 서버 안에서 10분마다 확인해 1일 09:00(KST) 이후 한 번 실행 |
| Workers AI 바인딩 | `CF_ACCOUNT_ID`·`CF_API_TOKEN`(Workers AI REST API) 또는 `AI_BASE_URL`(OpenAI 호환 사내 LLM). 없으면 새메뉴 자동 반영만 꺼집니다 |
| Pages 시크릿 | 쿠버네티스 Secret (`deploy/k8s/secret.env`) |

SQLite 파일 하나를 쓰므로 파드는 하나만 띄웁니다(`replicas: 1`, `Recreate`). 팀 하나가 쓰기에는 충분합니다. 동시에 20명이 주문하는 상황을 로컬에서 시험했습니다.

### Cloudflare 운영과 같이 돌릴 때

Cloudflare 배포(`npm run deploy`)는 `server/`, `Dockerfile`, `deploy/`를 쓰지 않으므로 두 곳에 같은 코드를 올릴 수 있습니다. 다만 **DB가 따로**입니다. 두 주소를 동시에 열어 두면 주문이 나뉘므로 팀에는 한 주소만 안내하고, 옮길 때 아래 "데이터 옮기기"로 한 번에 넘깁니다. 로그인 세션은 주소마다 따로라서 새 주소에서는 한 번 다시 로그인하지만, 팀원과 MS 계정의 연결은 DB에 있으므로 그대로 이어집니다.

### 회사에서 받아야 할 것

- 네임스페이스, 이미지를 올릴 사내 레지스트리 주소(로그인이 필요하면 풀 시크릿)
- 접속 주소(인그레스 호스트)와 TLS 인증서. MS 로그인은 localhost가 아니면 https 주소로만 돌아올 수 있습니다.
- 1Gi 정도의 퍼시스턴트 볼륨(ReadWriteOnce)과 스토리지 클래스
- 클러스터 밖으로 나가는 접속 허용 또는 프록시: `login.microsoftonline.com`, `graph.microsoft.com`(로그인), Power Automate 워크플로 주소의 호스트(팀즈 알림, 워크플로를 만들면 나오는 주소), `cafeartisee.apis.flyground.co.kr`, `artisee-app.s3.ap-northeast-2.amazonaws.com`(새메뉴 API와 포스터), `api.cloudflare.com`(Workers AI를 쓸 때)

사내 프록시가 TLS를 풀어 보는 방식이면 회사 루트 인증서를 파드에 넣고 `NODE_EXTRA_CA_CERTS`로 알려 줘야 합니다.

### 로컬에서 도커로 돌려 보기

```bash
npm run docker:build
docker run --rm -p 8788:8080 -v attije-data:/data --env-file .dev.vars attije-order
```

`.dev.vars`를 그대로 쓰므로 Entra 앱에 등록한 `http://localhost:8788`에서 실제 MS 로그인까지 됩니다. 도커 없이 `npm start`(포트 8080, 데이터는 `./data`)로도 돌릴 수 있습니다.

### 배포

1. Entra 앱의 리디렉션 URI에 `https://<접속 주소>/api/auth/callback`을 더합니다.
2. 이미지를 만들어 사내 레지스트리에 올립니다. 클러스터 노드가 x86이면 `--platform linux/amd64`로 만듭니다.
   ```bash
   docker buildx build --platform linux/amd64 -t <레지스트리>/attije-order:0.4.0 --push .
   ```
3. `deploy/k8s/`의 바꿀 곳을 채웁니다: `kustomization.yaml`(네임스페이스, 이미지 주소·태그), `config.env`(`PUBLIC_URL` 등), `ingress.yaml`(호스트, TLS 시크릿, 인그레스 클래스), `pvc.yaml`(스토리지 클래스).
4. `cp deploy/k8s/secret.env.example deploy/k8s/secret.env` 후 값을 채웁니다. 이 파일은 git에 올라가지 않습니다. `SESSION_SECRET`은 새로 만든 임의 값을 씁니다.
5. 적용하고 확인합니다.
   ```bash
   kubectl apply -k deploy/k8s
   kubectl -n <네임스페이스> rollout status deployment/attije-order
   kubectl -n <네임스페이스> logs deployment/attije-order   # "MS 로그인 켜짐 · 팀즈 …" 줄 확인
   ```

비어 있는 볼륨에 처음 뜨면 `migrations/`의 초기 데이터로 시작합니다. 운영 데이터를 가져오려면 이어서 "데이터 옮기기"를 합니다.

### 데이터 옮기기 (Cloudflare D1 → 쿠버네티스)

서버는 시작할 때 `/data/import.sql`이 있으면 지금 DB를 `attije.db.bak-<시각>`으로 치우고 그 파일을 넣은 뒤, 남은 마이그레이션을 적용합니다. 넣지 못하면 원래 DB로 되돌리고 파일 이름을 `import.sql.failed-<시각>`으로 바꿉니다.

1. Cloudflare 쪽 관리자 화면에서 주문을 마감합니다. 그 뒤로는 주문이 들어오지 않습니다.
2. 운영 DB를 내보냅니다: `npx wrangler d1 export DB --remote --output prod.sql`
3. 파드에 넣고 다시 띄웁니다.
   ```bash
   POD=$(kubectl -n <네임스페이스> get pod -l app.kubernetes.io/name=attije-order -o name | head -1)
   kubectl -n <네임스페이스> cp prod.sql ${POD#pod/}:/data/import.sql
   kubectl -n <네임스페이스> rollout restart deployment/attije-order
   kubectl -n <네임스페이스> logs deployment/attije-order | grep import
   ```
4. 쿠버네티스 쪽 관리자 화면에서 주문 건수와 팀원 명단을 확인하고, 팀즈로 새 주소를 알린 뒤 주문을 재개합니다.
5. 옮긴 뒤 Cloudflare 쪽 Cron Worker(`attije-season-sync`)가 계속 돌면 매달 Workers AI를 한 번 더 부르므로 필요 없으면 지웁니다.

`server/import-d1.mjs`는 같은 일을 명령으로 합니다: `node server/import-d1.mjs prod.sql data/attije.db` (비어 있는 DB에만 넣습니다).

## 구조

```text
├── src/frontend/              # 주문 화면(/, index.html·kiosk.*)·관리자(/admin)·공용 스타일과 파비콘 (Pages 정적 파일)
├── src/frontend/_redirects    # 예전 /v1/·/v2/ 주소를 / 로 보냄
├── functions/api/[[path]].js  # /api/* 처리 (Pages Functions): 로그인·주문·팀원·주문 차수·팀즈 알림·메뉴
├── lib/auth.js                # Entra ID 로그인(OIDC + PKCE)과 서명한 세션 쿠키
├── lib/teams.js               # 팀즈 알림용 적응형 카드와 워크플로 호출
├── lib/season-sync.js         # 새메뉴 자동 반영 (Pages Functions와 Cron Worker가 함께 사용)
├── workers/season-sync.js     # 매달 1일 09:00 새메뉴 확인 Cron Worker
├── db/schema.ts               # D1 스키마 정의
├── migrations/                # D1 마이그레이션
├── seeds/                     # 아티제 앱에서 수집한 메뉴와 D1용 SQL
├── scripts/app-menu-crawler/   # 아티제 앱 메뉴 수집 (에뮬레이터 + adb)
├── scripts/build-menu-seed.mjs  # 수집 메뉴 → SQL 변환
├── wrangler.toml              # Pages 프로젝트, D1·Workers AI 바인딩
├── wrangler.season.toml       # Cron Worker 설정
├── server/                    # 사내 쿠버네티스용 Node 서버 (정적 파일·API·SQLite 어댑터·마이그레이션·월간 새메뉴 확인·D1 데이터 가져오기)
├── Dockerfile                 # server/ 이미지 (node:24-slim, 런타임 의존 패키지 없음)
├── deploy/k8s/                # kustomize 매니페스트 (Deployment·Service·Ingress·PVC, 설정·시크릿 생성)
└── package.json
```
