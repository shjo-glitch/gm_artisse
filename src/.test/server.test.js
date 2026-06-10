const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const {
  USERS,
  SIZES,
  ORDER_OPTIONS,
  CATEGORIES,
  DEFAULT_DRINKS,
  requestHandler,
  getRuntimeConfig,
  resetState,
  parseBeverageBundle,
  extractBeverageBundleUrl,
  parseNewMenuJson,
  isApiItemActive,
} = require('../backend/server');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILES = ['drinks.json', 'users.json', 'options.json', 'orders.json'];
const TEST_USERS = ['고민수', '고상태', '박민수'];
const TEST_DRINKS = [
  { category: 'coffee', name: '카페 아메리카노', prices: { Tall: 4900, Venti: 5400 }, iceOnly: false },
  { category: 'tea', name: '시즌 티', prices: { Tall: 6100, Venti: 6600 }, iceOnly: false },
];

function snapshotDataFiles() {
  const snapshot = new Map();
  for (const file of DATA_FILES) {
    const filePath = path.join(DATA_DIR, file);
    snapshot.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null);
  }
  return snapshot;
}

function restoreDataFiles(snapshot) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const [filePath, content] of snapshot.entries()) {
    if (content === null) {
      if (fs.existsSync(filePath)) fs.rmSync(filePath);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

class MockRequest extends Readable {
  constructor(method, url, body, { host = 'localhost:4000', remoteAddress = '127.0.0.1' } = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host };
    this.socket = { remoteAddress };
    this.body = body === undefined ? null : JSON.stringify(body);
  }
  _read() {
    if (this.body !== null) {
      this.push(this.body);
      this.body = null;
    } else {
      this.push(null);
    }
  }
}

class MockResponse {
  constructor({ keepOpen = false } = {}) {
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.finished = keepOpen;
    this.done = keepOpen ? Promise.resolve() : new Promise((resolve) => { this.resolveDone = resolve; });
  }
  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = { ...this.headers, ...headers };
  }
  write(chunk) { this.chunks.push(String(chunk)); }
  end(chunk = '') {
    if (chunk) this.write(chunk);
    this.finished = true;
    if (this.resolveDone) this.resolveDone();
  }
  text() { return this.chunks.join(''); }
  json() { return JSON.parse(this.text()); }
}

async function invoke(method, pathname, body, options) {
  const req = new MockRequest(method, pathname, body, options);
  const res = new MockResponse();
  await requestHandler(req, res);
  await res.done;
  return res;
}

function openSse() {
  const req = new MockRequest('GET', '/api/events');
  const res = new MockResponse({ keepOpen: true });
  requestHandler(req, res);
  return { req, res };
}

function remoteOptions() {
  return { host: '192.168.0.10:4000', remoteAddress: '192.168.0.20' };
}

function assertRemoteControlHidden(html, id) {
  const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`));
  if (!tag) return;
  assert.match(tag[0], /display\s*:\s*none|is-hidden/, `원격 홈에서 #${id}는 보이지 않아야 합니다.`);
}

(async () => {
  const dataSnapshot = snapshotDataFiles();
  try {
    resetState();

    assert.deepEqual(getRuntimeConfig({}), { host: '0.0.0.0', port: 4000 });
    assert.deepEqual(getRuntimeConfig({ HOST: '127.0.0.1', PORT: '5000' }), { host: '127.0.0.1', port: 5000 });
    assert.deepEqual(getRuntimeConfig({ PORT: 'bad' }), { host: '0.0.0.0', port: 4000 });

    assert.deepEqual(USERS, [], '문서 계약상 최초 팀원은 0명이어야 합니다.');
    assert.equal(DEFAULT_DRINKS.length, 27, '기본 음료는 27개여야 합니다.');
    assert.ok(DEFAULT_DRINKS.every((drink) => drink.category && drink.name && Number.isInteger(drink.prices.Tall) && Number.isInteger(drink.prices.Venti)));

    const config = await invoke('GET', '/api/config');
    assert.equal(config.statusCode, 200);
    assert.deepEqual(config.json().users, USERS);
    assert.deepEqual(config.json().sizes, SIZES);
    assert.deepEqual(config.json().options, ORDER_OPTIONS);
    assert.deepEqual(config.json().categories, CATEGORIES);

    const initialDrinks = await invoke('GET', '/api/drinks');
    assert.equal(initialDrinks.statusCode, 200);
    assert.deepEqual(initialDrinks.json().drinks, DEFAULT_DRINKS);

    const initialOrders = await invoke('GET', '/api/orders');
    assert.equal(initialOrders.statusCode, 200);
    assert.deepEqual(initialOrders.json().orders, []);
    assert.equal(initialOrders.json().totalPrice, 0);

    const orderWithoutUsers = await invoke('POST', '/api/orders', { menuName: '카페 아메리카노', requester: '박민수', size: 'Tall' });
    assert.equal(orderWithoutUsers.statusCode, 400);
    assert.match(orderWithoutUsers.json().error, /configured users/);

    const replacedUsers = await invoke('PUT', '/api/users', { users: '홍길동|김철수|홍길동|이영희' });
    assert.equal(replacedUsers.statusCode, 200);
    assert.deepEqual(replacedUsers.json().users, ['김철수', '이영희', '홍길동']);

    const clearedUsers = await invoke('PUT', '/api/users', { users: '' });
    assert.equal(clearedUsers.statusCode, 200);
    assert.deepEqual(clearedUsers.json().users, []);

    const remoteUsers = await invoke('PUT', '/api/users', { users: '외부사용자' }, remoteOptions());
    assert.equal(remoteUsers.statusCode, 403);

    const restoredUsers = await invoke('PUT', '/api/users', { users: TEST_USERS });
    assert.equal(restoredUsers.statusCode, 200);
    assert.deepEqual(restoredUsers.json().users, TEST_USERS);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8')), TEST_USERS, '팀원 목록은 data/users.json에 저장되어야 합니다.');

    const optionAdded = await invoke('POST', '/api/options', { option: '얼음적게' });
    assert.equal(optionAdded.statusCode, 201);
    assert.ok(optionAdded.json().options.includes('얼음적게'));

    const replacedOptions = await invoke('PUT', '/api/options', { options: '연하게|디카페인|오트밀크|연하게' });
    assert.equal(replacedOptions.statusCode, 200);
    assert.deepEqual(replacedOptions.json().options, ['연하게', '디카페인', '오트밀크']);

    const invalidOptions = await invoke('PUT', '/api/options', { options: '' });
    assert.equal(invalidOptions.statusCode, 400);

    const restoreOptions = await invoke('PUT', '/api/options', { options: ORDER_OPTIONS });
    assert.equal(restoreOptions.statusCode, 200);

    const replacedDrinks = await invoke('PUT', '/api/drinks', { drinks: [...TEST_DRINKS, TEST_DRINKS[0]] });
    assert.equal(replacedDrinks.statusCode, 200);
    assert.deepEqual(replacedDrinks.json().drinks, TEST_DRINKS, '음료 저장 시 카테고리+이름 중복은 제거되어야 합니다.');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'drinks.json'), 'utf8')), TEST_DRINKS, '음료 목록은 data/drinks.json에 저장되어야 합니다.');

    const invalidDrinkCategory = await invoke('PUT', '/api/drinks', { drinks: [{ category: 'unknown', name: '테스트', prices: { Tall: 1, Venti: 2 } }] });
    assert.equal(invalidDrinkCategory.statusCode, 400);

    const emptyDrinks = await invoke('PUT', '/api/drinks', { drinks: [] });
    assert.equal(emptyDrinks.statusCode, 400);

    const created = await invoke('POST', '/api/orders', { menuName: '카페 아메리카노', requester: '박민수', size: 'Tall', options: ['덜달게', '오트밀크'], note: '회의실 전달' });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().order.category, 'coffee');
    assert.equal(created.json().order.unitPrice, 4900);
    assert.equal(created.json().totalPrice, 4900);
    assert.deepEqual(created.json().order.options, ['덜달게', '오트밀크']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'orders.json'), 'utf8')).length, 1, '주문은 data/orders.json에 저장되어야 합니다.');

    const custom = await invoke('POST', '/api/orders', { menuName: '직접 입력 시즌 음료', requester: '고민수', size: 'Venti', category: 'others', unitPrice: 7200, options: ['디카페인'] });
    assert.equal(custom.statusCode, 201);
    assert.equal(custom.json().order.unitPrice, 7200);
    assert.equal(custom.json().totalPrice, 12100);

    const duplicateRequester = await invoke('POST', '/api/orders', { menuName: '시즌 티', requester: '박민수', size: 'Tall' });
    assert.equal(duplicateRequester.statusCode, 400);
    assert.match(duplicateRequester.json().error, /already has an order/);

    const duplicateRequesterUpdate = await invoke('PUT', `/api/orders/${custom.json().order.id}`, { requester: '박민수' });
    assert.equal(duplicateRequesterUpdate.statusCode, 400);
    assert.match(duplicateRequesterUpdate.json().error, /already has an order/);

    const invalidOption = await invoke('POST', '/api/orders', { menuName: '카페 아메리카노', requester: '고상태', size: 'Tall', options: ['없는옵션'] });
    assert.equal(invalidOption.statusCode, 400);
    assert.match(invalidOption.json().error, /configured option/);

    const orderId = created.json().order.id;
    const updated = await invoke('PUT', `/api/orders/${orderId}`, { menuName: '시즌 티', size: 'Venti', options: ['연하게'] });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().order.category, 'tea');
    assert.equal(updated.json().order.unitPrice, 6600);
    assert.deepEqual(updated.json().order.options, ['연하게']);

    const { req: sseReq, res: sseRes } = openSse();
    assert.equal(sseRes.statusCode, 200);
    assert.match(sseRes.headers['Content-Type'] || sseRes.headers['content-type'], /text\/event-stream/);
    assert.match(sseRes.text(), /event: app-state/);
    assert.match(sseRes.text(), /"totalPrice"/);
    const broadcastUpdate = await invoke('POST', '/api/orders', { menuName: '시즌 티', requester: '고상태', size: 'Tall', note: '따뜻하게' });
    assert.equal(broadcastUpdate.statusCode, 201);
    assert.match(sseRes.text(), /시즌 티/);
    sseReq.emit('close');

    const deleted = await invoke('DELETE', `/api/orders/${orderId}`);
    assert.equal(deleted.statusCode, 200);
    assert.ok(!deleted.json().orders.some((order) => order.id === orderId));

    const reset = await invoke('POST', '/api/orders/reset');
    assert.equal(reset.statusCode, 200);
    assert.deepEqual(reset.json().orders, []);
    assert.equal(reset.json().totalPrice, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'orders.json'), 'utf8')), [], '주문 초기화는 data/orders.json을 비워야 합니다.');

    const remoteReset = await invoke('POST', '/api/orders/reset', undefined, remoteOptions());
    assert.equal(remoteReset.statusCode, 403);

    const sampleChunkMapping = '<script>window.___chunkMapping={"component---src-pages-menu-beverage-js":["/component---src-pages-menu-beverage-js-test.js"]};</script>';
    assert.equal(extractBeverageBundleUrl(sampleChunkMapping), 'https://www.cafeartisee.com/component---src-pages-menu-beverage-js-test.js');

    const sampleBundle = '{id:"001",korName:"카페 아메리카노",engName:"Cafe Americano",imageUri:"a",price:4900,desc:"hot"},{id:"002",korName:"카페라떼",engName:"Cafe Latte",imageUri:"b",price:5600,desc:"milk"},{id:"001",korName:"오렌지주스",engName:"Orange",imageUri:"c",price:8300,desc:"fruit"}';
    assert.deepEqual(parseBeverageBundle(sampleBundle), [
      { category: 'coffee', name: '카페 아메리카노', prices: { Tall: 4900, Venti: 5400 }, iceOnly: false },
      { category: 'coffee', name: '카페라떼', prices: { Tall: 5600, Venti: 6100 }, iceOnly: false },
      { category: 'real-fruit-beverage', name: '오렌지주스', prices: { Tall: 8300, Venti: 8800 }, iceOnly: false },
    ]);

    const parsedMenus = parseNewMenuJson(JSON.stringify([
      { id: 'expired-beverage', title: '겨울 시즌 음료 출시', release_date: '2025-10-31T00:00:00.000+09:00', expire_date: '2025-12-30T00:00:00.000+09:00' },
      { id: 'bread', title: 'BAKE-IT LIST 첫 번째 "르빵"', release_date: '2025-09-22T00:00:00.000+09:00', expire_date: null },
      { id: 'active-beverage', title: '봄 시즌 음료 출시', release_date: '2026-04-30T00:00:00.000+09:00', expire_date: '2026-06-29T00:00:00.000+09:00' },
      { id: 'cake', title: '봄 시즌 케이크 출시', release_date: '2026-04-30T00:00:00.000+09:00', expire_date: '2026-06-29T00:00:00.000+09:00' },
      { id: 'always-beverage', title: '디카페인 콜드브루 음료 4종 출시', release_date: '2023-06-26T00:00:00.000+09:00', expire_date: null },
    ]), new Date('2026-06-04T12:00:00+09:00'));
    assert.deepEqual(parsedMenus.map((item) => item.title), ['봄 시즌 음료 출시', '디카페인 콜드브루 음료 4종 출시']);
    assert.ok(parsedMenus.every((item) => item.active && item.url.startsWith('https://www.cafeartisee.com/news/new/view/?')));
    assert.equal(isApiItemActive({ release_date: '2026-04-30T00:00:00.000+09:00', expire_date: '2026-06-29T00:00:00.000+09:00' }, new Date('2026-06-04T12:00:00+09:00')), true);
    assert.equal(isApiItemActive({ release_date: '2026-06-05T00:00:00.000+09:00', expire_date: null }, new Date('2026-06-04T12:00:00+09:00')), false);

    const localAdmin = await invoke('GET', '/admin.html');
    assert.equal(localAdmin.statusCode, 200);
    assert.match(localAdmin.text(), /관리자 페이지/);

    const remoteAdmin = await invoke('GET', '/admin.html', undefined, remoteOptions());
    assert.equal(remoteAdmin.statusCode, 403);
    const remoteAdminScript = await invoke('GET', '/admin.js', undefined, remoteOptions());
    assert.equal(remoteAdminScript.statusCode, 403);

    const remoteHome = await invoke('GET', '/', undefined, remoteOptions());
    assert.equal(remoteHome.statusCode, 200);
    assertRemoteControlHidden(remoteHome.text(), 'admin-link');
    assertRemoteControlHidden(remoteHome.text(), 'reset-order');

    const localHome = await invoke('GET', '/');
    assert.equal(localHome.statusCode, 200);
    assert.match(localHome.text(), /주문 명세서/);
    assert.match(localHome.text(), /id="admin-link"/);
    assert.match(localHome.text(), /id="reset-order"/);

    console.log('OK: README/SPEC 기반 서버 API·SSE·영속화 검증 완료');
  } finally {
    restoreDataFiles(dataSnapshot);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
