# 아띠제 음료 주문표

사내 구성원의 음료 주문을 한 화면에서 수집하고, 서버와 실시간 동기화하는 웹 앱입니다.

## 빠른 시작

### 사전 요구사항

- Node.js 14 이상
- npm 또는 yarn

### 설치 및 실행

```bash
cd /path/to/attije-order-sheet
npm install
npm start
```

서버가 `http://0.0.0.0:4000`에서 시작됩니다.

### 처음 실행할 때 자동으로 일어나는 일

- **음료 메뉴 자동 로드**: 아띠제 공식 페이지(`cafeartisee.com`)에서 메뉴를 자동 파싱하여 27개 기본 음료를 로드합니다. (서버 시작 시 + 1시간마다 자동 갱신)
- **시즌 메뉴 자동 표시**: 아띠제 새 메뉴 API(`cafeartisee.apis.flyground.co.kr`)에서 현재 판매 중인 음료 행사를 불러와 주문 폼 상단에 표시합니다. (서버 시작 시 + 30분마다 자동 갱신)
- **팀원 목록 준비**: 초기에는 팀원이 0명입니다. 관리자 페이지에서 팀원을 등록해야 주문할 수 있습니다.

### 접속 주소

**같은 장비에서:**
```
http://localhost:4000
```

**같은 네트워크의 다른 장비에서:**
```
http://<서버-IP>:4000
```

### 관리자 페이지 접근

로컬호스트(`localhost`, `127.0.0.1`, `::1`)에서만 관리자 페이지에 접근할 수 있습니다.

```
http://localhost:4000/admin.html
```

**주의**: 외부 IP로 접속한 사용자는 관리자 링크가 보이지 않으며, 직접 `admin.html` 접근도 차단됩니다.

### 팀원 목록 설정

1. 로컬호스트에서 `http://localhost:4000/admin.html` 열기
2. **팀원 명단** 섹션에서 이름 입력 (파이프 `|`로 구분)
   ```
   홍길동|김철수|이영희
   ```
3. **팀원 명단 저장** 클릭
4. 주문표를 새로고침하면 설정한 팀원이 주문자 드롭다운에 표시됩니다.

## 주요 기능

### 주문 추가/수정/삭제
- 메뉴를 카테고리 드롭다운에서 선택하거나 직접 입력
- 온도 선택 (HOT / ICE) - 기본값: ICE
- 주문자 선택 (중복 불가 - 1인 1주문)
- 사이즈 선택 (Tall / Venti)
- 옵션 다중 선택 및 새 옵션 추가
- 비고 작성
- 주문 목록에서 수정/삭제 가능

### 실시간 동기화 (SSE)
- 한 사람이 주문을 추가/수정/삭제하면 모든 접속자에게 실시간으로 동기화
- 서버 연결 실패 시 로컬 저장소에 임시 저장

### 주문 명세서 자동 집계
- 메뉴명·사이즈·옵션이 동일한 주문을 자동으로 묶음
- `메뉴 x수량 --- 총 금액` 형식으로 표시
- 전체 주문의 총액 자동 계산

### 시즌 메뉴 자동 표시
- 아띠제 공식 새메뉴 페이지에서 현재 판매 중인 음료 행사 표시
- 직접 입력 메뉴로 신메뉴 주문 가능

### 음료 메뉴 자동 업데이트
- 매 1시간마다 공식 페이지에서 음료 메뉴 자동 파싱
- 가격 변동 시 모든 접속자에게 토스트 알림으로 통지

### 데이터 영속화
- `data/` 폴더에 JSON 파일로 자동 저장
- `data/drinks.json` - 음료 메뉴
- `data/users.json` - 팀원 목록
- `data/options.json` - 옵션 목록
- `data/orders.json` - 주문 기록
- 외부에서 `data/drinks.json`, `data/users.json`, `data/options.json` 파일 직접 수정 시 서버가 자동 감지하여 메모리에 반영하고 SSE로 브로드캐스트

### 토스트 알림
- 메뉴 추가/삭제/변경 시 화면 우측 하단에 토스트 알림
- 팀원 추가/제외 시 즉시 알림
- 신규 메뉴 추가, 메뉴 삭제, 가격 변경, 팀원 추가/제외 시 각각 알림

## 소스코드 구조

```
attije-order-sheet/
├── src/
│   ├── backend/
│   │   └── server.js              # Node.js HTTP 서버, API 엔드포인트, SSE 브로드캐스트
│   ├── frontend/
│   │   ├── index.html             # 주문표 UI, 메뉴 선택, 주문 명세서
│   │   ├── admin.html             # 관리자 페이지 (음료/팀원/옵션 편집)
│   │   ├── admin.js               # 관리자 페이지 로직
│   │   ├── script.js              # 주문표 로직, API 통신, 실시간 동기화
│   │   └── styles.css             # 전체 스타일 (주문표 + 관리자 페이지)
│   └── .test/                     # 검증 스크립트
├── data/                          # JSON 데이터 폴더 (자동 생성, .gitignore 포함)
│   ├── drinks.json                # 음료 메뉴 (27개 기본값)
│   ├── users.json                 # 팀원 목록 (초기값: 빈 배열)
│   ├── options.json               # 옵션 목록 (6개 기본값)
│   └── orders.json                # 주문 기록
├── package.json                   # 스크립트 정의
├── .gitignore                     # node_modules/, data/ 제외
├── README.md                       # 이 파일
└── SPEC.md                        # 기능 명세
```

## API 엔드포인트

### 설정 조회
- `GET /api/config` - 사용자, 사이즈, 옵션, 카테고리 조회

### 팀원 관리
- `GET /api/users` - 팀원 목록 조회
- `PUT /api/users` - 팀원 목록 저장 (로컬호스트만)

### 음료 메뉴
- `GET /api/drinks` - 음료 배열 조회 (카테고리, 이름, 가격 포함)
- `PUT /api/drinks` - 음료 배열 저장 (로컬호스트만)

### 옵션
- `GET /api/options` - 옵션 목록 조회
- `POST /api/options` - 새 옵션 추가
- `PUT /api/options` - 옵션 목록 저장

### 주문 관리
- `GET /api/orders` - 주문 목록 및 총액 조회
- `POST /api/orders` - 주문 추가
- `PUT /api/orders/:id` - 주문 수정
- `DELETE /api/orders/:id` - 주문 삭제
- `POST /api/orders/reset` - 전체 주문 초기화 (로컬호스트만)

### 시즌 메뉴
- `GET /api/season-menu` - 진행 중인 음료 행사 조회

### 실시간 동기화
- `GET /api/events` - SSE `app-state` 이벤트로 전체 상태 브로드캐스트

## 데이터 자동 관리

### 음료 메뉴 (1시간 주기)
- 소스: `cafeartisee.com` 번들 자동 파싱
- 자동 파싱 대상: Coffee, Real fruit beverage, Tea, Others 4개 카테고리
- 변경 감지 시 모든 접속자에게 토스트 알림

### 시즌 메뉴 (30분 주기)
- 소스: `cafeartisee.apis.flyground.co.kr/new-menu` API
- 조건: 현재 날짜가 판매 기간 내, 제목에 "음료" 포함

### 팀원/주문/옵션
- `data/*.json`에 자동 저장
- 로컬 저장소와 서버 중 최신값 우선
- 서버 재시작 시 `data/` 폴더에서 복구

## 외부 접속

### Cloudflare Tunnel을 이용한 외부 접속

로컬 서버를 외부에서 접속하려면 Cloudflare Tunnel을 사용할 수 있습니다.

```bash
# Cloudflare Warp CLI 설치 (macOS)
brew install cloudflare/cloudflare/cloudflared

# 로컬 포트 4000을 공개 URL로 노출
cloudflared tunnel --url http://localhost:4000
```

발급된 공개 URL을 팀원들과 공유하면 어디서든 주문표에 접속할 수 있습니다.

**주의**: Cloudflare Tunnel을 통한 외부 접속 시 관리자 페이지의 관리자 링크가 보이지 않으며, 직접 `admin.html` 접근도 차단됩니다. 관리 작업은 반드시 로컬호스트(`localhost`, `127.0.0.1`)에서 수행하세요.

## 주의사항 / 트러블슈팅

### 외부 IP 접속 시
- 주문표의 관리자 링크가 보이지 않음 (의도된 동작)
- `admin.html` 직접 접근 시 403 Forbidden 응답
- 관리 작업은 반드시 로컬호스트(`localhost`, `127.0.0.1`)에서 수행

### 첫 실행 시
- 음료 메뉴 로드까지 수 초 소요 가능
- 그 동안 주문표는 기본값으로 동작
- 로딩 중 주문하면 로컬 저장소에 임시 저장

### 데이터 폴더
- `data/` 폴더는 `.gitignore`에 포함됨 (개인정보 보호)
- 서버 실행 중 자동 생성 및 갱신
- 수동 삭제 후 서버 재시작하면 기본값으로 복구

### 서버 연결 실패
- 오프라인에서도 로컬 저장소를 기반으로 주문 가능
- 서버 복구 시 자동으로 동기화

## 검증

```bash
npm run verify
```

기대 결과:
```
OK: 새 아띠제 음료 주문표 구조/프론트엔드 검증 완료
OK: 음료 주문표 카테고리/가격/옵션 프론트엔드 검증 완료
OK: 아띠제 음료 주문 서버/API/SSE/가격 검증 완료
```
