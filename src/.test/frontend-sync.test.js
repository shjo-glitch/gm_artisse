const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const script = fs.readFileSync(path.join(root, 'src', 'frontend', 'script.js'), 'utf8');
const adminScript = fs.readFileSync(path.join(root, 'src', 'frontend', 'admin.js'), 'utf8');
const server = require('../backend/server');

function extractArray(source, name, label) {
  const match = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
  assert.ok(match, `${label} ${name} 배열이 필요합니다.`);
  return Function(`return ${match[1]};`)();
}

const frontendUsers = extractArray(script, 'DEFAULT_USERS', '주문 화면');
const adminUsers = extractArray(adminScript, 'DEFAULT_USERS', '관리 화면');
assert.deepEqual(server.USERS, [], '서버 기본 팀원은 0명이어야 합니다.');
assert.deepEqual(frontendUsers, server.USERS, '주문 화면 기본 팀원은 서버와 같아야 합니다.');
assert.deepEqual(adminUsers, server.USERS, '관리 화면 기본 팀원은 서버와 같아야 합니다.');

const frontendOptions = extractArray(script, 'DEFAULT_OPTIONS', '주문 화면');
const adminOptions = extractArray(adminScript, 'DEFAULT_OPTIONS', '관리 화면');
assert.deepEqual(frontendOptions, server.ORDER_OPTIONS, '주문 화면 기본 옵션은 서버와 같아야 합니다.');
assert.deepEqual(adminOptions, server.ORDER_OPTIONS, '관리 화면 기본 옵션은 서버와 같아야 합니다.');

const frontendCategories = extractArray(script, 'DEFAULT_CATEGORIES', '주문 화면');
const adminCategories = extractArray(adminScript, 'DEFAULT_CATEGORIES', '관리 화면');
assert.deepEqual(frontendCategories, server.CATEGORIES, '주문 화면 카테고리는 서버와 같아야 합니다.');
assert.deepEqual(adminCategories, server.CATEGORIES, '관리 화면 카테고리는 서버와 같아야 합니다.');

const frontendDrinks = extractArray(script, 'DEFAULT_DRINKS', '주문 화면');
const adminDrinks = extractArray(adminScript, 'DEFAULT_DRINKS', '관리 화면');
assert.deepEqual(frontendDrinks, server.DEFAULT_DRINKS, '주문 화면 기본 음료는 서버와 같아야 합니다.');
assert.deepEqual(adminDrinks, server.DEFAULT_DRINKS, '관리 화면 기본 음료는 서버와 같아야 합니다.');
assert.equal(frontendDrinks.length, 27, '기본 음료는 README/SPEC 기준 27개여야 합니다.');
assert.ok(frontendDrinks.every((drink) => drink.category && drink.name && Number.isInteger(drink.prices.Tall) && Number.isInteger(drink.prices.Venti)), '모든 기본 음료는 카테고리/이름/Tall/Venti 가격을 가져야 합니다.');

for (const [source, label] of [[script, '주문 화면'], [adminScript, '관리 화면']]) {
  for (const endpoint of ['/api/config', '/api/drinks', '/api/users', '/api/options']) {
    assert.match(source, new RegExp(endpoint.replace(/\//g, '\\/')), `${label}에서 ${endpoint} 경로를 사용해야 합니다.`);
  }
}
assert.match(script, /const ORDERS_API_URL\s*=\s*"\/api\/orders"/, '주문 화면은 주문 API를 사용해야 합니다.');
assert.match(script, /const EVENTS_API_URL\s*=\s*"\/api\/events"/, '주문 화면은 SSE API를 사용해야 합니다.');
assert.match(script, /const SEASON_MENU_API_URL\s*=\s*"\/api\/season-menu"/, '주문 화면은 시즌메뉴 API를 사용해야 합니다.');

assert.match(script, /getAvailableRequesters[\s\S]*orderedRequesters[\s\S]*filter/, '이미 주문한 주문자를 드롭다운에서 제외해야 합니다.');
assert.match(script, /order\.id !== editingOrderId\.value/, '주문 수정 중에는 현재 주문자를 중복 검사에서 제외해야 합니다.');
assert.match(script, /이미 주문한 주문자입니다/, '중복 주문자 방지 메시지가 필요합니다.');
assert.match(script, /renderMenuOptions[\s\S]*<option value="\$\{escapeHtml\(drink\.name\)\}">\$\{escapeHtml\(drink\.name\)\}<\/option>/, '메뉴 드롭다운 항목 라벨은 메뉴 이름만 표시해야 합니다.');
assert.doesNotMatch(script, /Tall \$\{formatPrice|formatPrice\(drink\.prices/, '메뉴 드롭다운에는 가격을 표시하지 않아야 합니다.');
assert.doesNotMatch(script, /formatPrice\(order\.unitPrice\)/, '주문 목록에는 주문별 가격을 표시하지 않아야 합니다.');
assert.match(script, /getStatementGroups/, '명세서 그룹핑 함수가 필요합니다.');
assert.match(script, /renderStatement/, '명세서 렌더링 함수가 필요합니다.');
assert.match(script, /totalPrice\.textContent/, '총액 UI 갱신이 필요합니다.');
assert.match(script, /ordersToggle|orders-toggle|setOrdersExpanded/, '주문 목록 펼치기/접기 로직이 필요합니다.');
assert.match(script, /showToast/, '변경 알림 토스트 로직이 필요합니다.');
assert.match(script, /diffDrinks/, '음료 변경 감지 로직이 필요합니다.');
assert.match(script, /diffUsers/, '팀원 변경 감지 로직이 필요합니다.');
assert.match(script, /new EventSource\(EVENTS_API_URL\)/, '실시간 동기화를 위해 EventSource를 연결해야 합니다.');
assert.match(script, /addEventListener\("app-state"/, 'SSE app-state 이벤트를 구독해야 합니다.');

assert.match(adminScript, /normalizeUsers/, '관리 페이지는 팀원 정규화가 필요합니다.');
assert.match(adminScript, /serializeUsers/, '관리 페이지는 팀원 구분자 직렬화가 필요합니다.');
assert.match(adminScript, /JSON\.stringify\(\{ users: serializeUsers\(\) \}\)/, '관리 페이지는 팀원 명단을 저장해야 합니다.');
assert.match(adminScript, /normalizeOptions/, '관리 페이지는 옵션 정규화가 필요합니다.');
assert.match(adminScript, /JSON\.stringify\(\{ options: serializeOptions\(\) \}\)/, '관리 페이지는 옵션 목록을 저장해야 합니다.');
assert.match(adminScript, /parseTextarea[\s\S]*category[\s\S]*Tall[\s\S]*Venti/, '관리 페이지는 카테고리|음료명|Tall|Venti 형식을 파싱해야 합니다.');
assert.match(adminScript, /JSON\.stringify\(\{ drinks \}\)/, '관리 페이지는 음료 배열을 저장해야 합니다.');

console.log('OK: 서버/프론트 기본 데이터와 동작 계약 동기화 검증 완료');
