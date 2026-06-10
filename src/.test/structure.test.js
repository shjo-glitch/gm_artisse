const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const frontend = path.join(root, 'src', 'frontend');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertOrdered(source, labels, label) {
  let previous = -1;
  for (const item of labels) {
    const current = source.indexOf(item);
    assert.notEqual(current, -1, `${label} 필수 항목 누락: ${item}`);
    assert.ok(current > previous, `${label} 항목 순서 오류: ${item}`);
    previous = current;
  }
}

for (const file of ['README.md', 'SPEC.md', 'package.json']) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} 파일이 있어야 합니다.`);
}

for (const file of ['index.html', 'admin.html', 'styles.css', 'script.js', 'admin.js']) {
  assert.ok(fs.existsSync(path.join(frontend, file)), `src/frontend/${file} 파일이 있어야 합니다.`);
}

const readme = read('README.md');
const spec = read('SPEC.md');
const indexHtml = read('src/frontend/index.html');
const adminHtml = read('src/frontend/admin.html');
const styles = read('src/frontend/styles.css');

assertOrdered(readme, ['## 빠른 시작', '## 주요 기능', '## 소스코드 구조', '## API 엔드포인트', '## 데이터 자동 관리', '## 주의사항 / 트러블슈팅', '## 검증'], 'README.md');
assertOrdered(spec, ['## 개요', '## 프로젝트 목표', '## 기능 명세', '## 동작 시나리오'], 'SPEC.md');

for (const phrase of [
  '초기에는 팀원이 0명',
  '1인 1주문',
  '주문 명세서 자동 집계',
  '데이터 영속화',
  '로컬호스트',
  'npm run verify',
]) {
  assert.match(readme, new RegExp(phrase), `README.md에 사용자 안내가 필요합니다: ${phrase}`);
}

for (const phrase of [
  '사용자는 하드코딩하지 않는다',
  '메뉴 이름만 표시',
  '이미 주문한 사람은 드롭다운에서 제외',
  '주문별 가격은 표시하지 않는다',
  'data/orders.json',
]) {
  assert.match(spec, new RegExp(phrase), `SPEC.md에 기능 계약이 필요합니다: ${phrase}`);
}

assert.match(indexHtml, /<html lang="ko">/, '주문표 HTML은 한국어 문서여야 합니다.');
for (const id of [
  'order-form',
  'menu-select',
  'custom-menu-name',
  'custom-unit-price',
  'requester-select',
  'size-select',
  'option-list',
  'new-option-name',
  'order-note',
  'season-menu-list',
  'statement-list',
  'total-price',
  'order-list',
  'orders-toggle',
  'toast-container',
]) {
  assert.match(indexHtml, new RegExp(`id="${id}"`), `주문표에 #${id} 요소가 필요합니다.`);
}
assert.match(indexHtml, /가격은 하단 주문 명세서에서만 확인합니다/, '주문 폼은 가격 표시 위치를 안내해야 합니다.');
assert.match(indexHtml, /공식 새메뉴 페이지/, '시즌메뉴 공식 링크 안내가 필요합니다.');
assert.match(indexHtml, /id="reset-order"[^>]*admin-only/, '전체 초기화 버튼은 관리자 전용이어야 합니다.');
assert.match(indexHtml, /script src="script\.js"/, '주문표는 script.js를 연결해야 합니다.');
assert.match(indexHtml, /link rel="stylesheet" href="styles\.css"/, '주문표는 styles.css를 연결해야 합니다.');

assert.match(adminHtml, /<html lang="ko">/, '관리자 HTML은 한국어 문서여야 합니다.');
for (const id of [
  'user-editor',
  'users-textarea',
  'user-preview',
  'option-editor',
  'options-textarea',
  'drink-editor',
  'new-drink-category',
  'new-drink-name',
  'new-drink-tall',
  'new-drink-venti',
  'drinks-textarea',
  'drink-preview',
]) {
  assert.match(adminHtml, new RegExp(`id="${id}"`), `관리자 페이지에 #${id} 요소가 필요합니다.`);
}
assert.match(adminHtml, /관리자 페이지는 서버 장비의 로컬 접속에서만 사용할 수 있습니다/, '관리자 로컬 제한 안내가 필요합니다.');
assert.match(adminHtml, /카테고리\|음료명\|Tall가격\|Venti가격/, '음료 편집 입력 형식 안내가 필요합니다.');
assert.match(adminHtml, /script src="admin\.js"/, '관리자 페이지는 admin.js를 연결해야 합니다.');

assert.match(styles, /\.order-form\s*\{\s*grid-template-columns:\s*minmax\(12rem, 2fr\)\s+minmax\(5rem, \.5fr\)\s+minmax\(9rem, 1fr\)\s+minmax\(7rem, \.75fr\)/, '주문 폼은 메뉴이름 | 온도 | 주문자 | 사이즈 4열 레이아웃이어야 합니다.');
assert.match(styles, /\.order-form__menu-field\s*\{\s*grid-row:\s*1;\s*grid-column:\s*1;\s*\}/, '메뉴 이름 필드는 첫 번째 열이어야 합니다.');
assert.match(styles, /\.order-form__temp-field\s*\{\s*grid-row:\s*1;\s*grid-column:\s*2;\s*\}/, '온도 필드는 두 번째 열이어야 합니다.');
assert.match(styles, /\.order-form__requester-field\s*\{\s*grid-row:\s*1;\s*grid-column:\s*3;\s*\}/, '주문자 필드는 세 번째 열이어야 합니다.');
assert.match(styles, /\.order-form__size-field\s*\{\s*grid-row:\s*1;\s*grid-column:\s*4;\s*\}/, '사이즈 필드는 네 번째 열이어야 합니다.');
assert.match(styles, /\.order-side\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(320px, 0\.72fr\)/, '데스크톱에서는 주문 명세서와 주문 목록을 나란히 배치해야 합니다.');
assert.match(styles, /\.statement-item__divider::before/, '명세서 금액 앞 대시 채움 스타일이 필요합니다.');
assert.match(styles, /\.toast-container/, '토스트 알림 컨테이너 스타일이 필요합니다.');
assert.doesNotMatch(styles, /content:\s*"ON"|content:\s*"OFF"/, '옵션 토글에는 ON/OFF 텍스트를 표시하지 않아야 합니다.');

console.log('OK: README/SPEC 기반 정적 구조 검증 완료');
