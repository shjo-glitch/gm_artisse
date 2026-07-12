# 아띠제 음료 주문표

사내 구성원의 음료 주문을 수집하고 함께 확인하는 ChatGPT Sites 웹 앱입니다. 화면과 API는 Sites에서 호스팅하며 주문·메뉴·설정 데이터는 Sites의 D1 데이터베이스에 저장합니다.

## 아키텍처

```text
브라우저 (index.html / admin.html)
        │ /api/*
        ▼
ChatGPT Sites Worker
        │ DB 바인딩
        ▼
Sites D1
  ├─ config
  ├─ drinks
  └─ orders
```

- 브라우저는 데이터베이스에 직접 접근하지 않고 Sites API만 호출합니다.
- 주문·메뉴·설정은 5초 간격으로 다시 확인해 여러 접속자의 화면을 동기화합니다.
- 관리자 비밀번호는 Sites 환경 변수로만 보관하고 API에서 검증합니다.
- 시즌 메뉴만 아띠제 새메뉴 API를 직접 조회합니다.

## 데이터 모델

| 테이블 | 주요 컬럼 |
| --- | --- |
| `config` | `users`, `options`, `orders_closed` |
| `drinks` | `category`, `name`, `tall_price`, `grande_price`, `ice_only`, `sort_order` |
| `orders` | `id`, `menu_name`, `category`, `requester`, `size`, `temp`, `options`, `note`, `unit_price`, 타임스탬프 |

배포 스키마와 초기 데이터는 `drizzle/0000_sites_d1.sql`에 있으며, 소스 수준 스키마 정의는 `db/schema.ts`에 있습니다.

## 주요 기능

- 카테고리별 음료 선택 또는 직접 입력 주문
- HOT/ICE, Tall/Grande, 복수 옵션, 비고
- 주문 추가·수정·삭제 및 명세서 자동 집계
- 관리자용 팀원·옵션·음료 관리
- 관리자용 주문 마감/재개와 전체 초기화
- 진행 중인 시즌 메뉴 안내
- 여러 접속자 간 5초 주기 자동 동기화

## 관리자 인증

`ADMIN_PASSWORD`는 Sites 환경 변수의 secret 값으로 관리합니다. 브라우저에는 비밀번호 설정값을 내려주지 않으며, 관리자 API 요청마다 서버에서 검증합니다.

## 로컬 검증

```bash
npm run verify
npm run build
```

정적 파일만 실행하는 `npm run dev`에서는 D1 API를 사용할 수 없습니다. 전체 데이터 동작은 Sites의 저장된 버전 또는 배포 환경에서 확인합니다.

## 구조

```text
├── src/frontend/          # 주문표와 관리자 UI
├── worker/index.js        # Sites API와 정적 파일 라우팅
├── db/schema.ts           # D1 스키마 정의
├── drizzle/               # 배포 마이그레이션
├── .openai/hosting.json   # Sites 프로젝트와 DB 바인딩
├── build.mjs
└── package.json
```
