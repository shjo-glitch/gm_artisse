const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { randomUUID } = require('node:crypto');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 4000;
const NEWS_NEW_URL = 'https://www.cafeartisee.com/news/new/';
const NEWS_API_URL = 'https://cafeartisee.apis.flyground.co.kr/new-menu';
const NEWS_VIEW_BASE = 'https://www.cafeartisee.com/news/new/view/?';
const BEVERAGE_PAGE_URL = 'https://www.cafeartisee.com/';
const BEVERAGE_CHUNK_NAME = 'component---src-pages-menu-beverage-js';
const BEVERAGE_CATEGORIES = Object.freeze(['coffee', 'real-fruit-beverage', 'tea', 'others']);
const BEVERAGE_REFRESH_MS = 60 * 60 * 1000;
const SEASON_MENU_REFRESH_MS = 30 * 60 * 1000;
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'src', 'frontend');

const USERS = Object.freeze([]);
const SIZES = Object.freeze(['Tall', 'Venti']);
const ORDER_OPTIONS = Object.freeze(['연하게', '덜달게', '디카페인', '더달게', '두유', '오트밀크']);
const CATEGORIES = Object.freeze([
  { key: 'coffee', label: '커피', sourceLabel: 'Coffee' },
  { key: 'real-fruit-beverage', label: '과일음료', sourceLabel: 'Real fruit beverage' },
  { key: 'tea', label: '차', sourceLabel: 'Tea' },
  { key: 'others', label: '기타', sourceLabel: 'Others' },
]);
const CATEGORY_KEYS = new Set(CATEGORIES.map((category) => category.key));
const DEFAULT_DRINKS = Object.freeze([
  { category: 'coffee', name: '카페 아메리카노', prices: { Tall: 4900, Venti: 5400 }, iceOnly: false },
  { category: 'coffee', name: '카페라떼', prices: { Tall: 5600, Venti: 6100 }, iceOnly: false },
  { category: 'coffee', name: '카푸치노', prices: { Tall: 5600, Venti: 6100 }, iceOnly: false },
  { category: 'coffee', name: '캐러멜 마끼아또', prices: { Tall: 6500, Venti: 7000 }, iceOnly: false },
  { category: 'coffee', name: '바닐라라떼', prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: 'coffee', name: '스패니쉬라떼', prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: 'coffee', name: '플랫화이트', prices: { Tall: 5600, Venti: 6100 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '리얼후르츠 오렌지주스', prices: { Tall: 8300, Venti: 8800 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '리얼후르츠 자몽주스', prices: { Tall: 8300, Venti: 8800 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '리얼후르츠 토마토주스', prices: { Tall: 8300, Venti: 8800 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '로열자몽티', prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '클래식 레몬 허니 티', prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '시그니처 오렌지 에이드', prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '시그니처 레몬 에이드', prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: 'real-fruit-beverage', name: '시그니처 자몽 에이드', prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: 'tea', name: '캐모마일', prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  { category: 'tea', name: '페퍼민트', prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  { category: 'tea', name: '잉글리쉬 블랙퍼스트', prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  { category: 'tea', name: '루이보스', prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  { category: 'others', name: '데일리 요거트 스무디', prices: { Tall: 6600, Venti: 7100 }, iceOnly: false },
  { category: 'others', name: '레몬 요거트 스무디', prices: { Tall: 6900, Venti: 7400 }, iceOnly: false },
  { category: 'others', name: '발로나 초코 프라페', prices: { Tall: 6900, Venti: 7400 }, iceOnly: false },
  { category: 'others', name: '발로나 더블 초콜릿', prices: { Tall: 6900, Venti: 7400 }, iceOnly: false },
  { category: 'others', name: '애플밀크티', prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: 'others', name: '잉글리쉬 티 라떼', prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: 'others', name: '제주 말차 라떼', prices: { Tall: 6200, Venti: 6700 }, iceOnly: false },
  { category: 'others', name: '발로나 자바칩 프라페', prices: { Tall: 6400, Venti: 6900 }, iceOnly: false },
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const DB_DIR = path.join(ROOT_DIR, 'data');
const DB_FILES = {
  drinks: path.join(DB_DIR, 'drinks.json'),
  users: path.join(DB_DIR, 'users.json'),
  options: path.join(DB_DIR, 'options.json'),
  orders: path.join(DB_DIR, 'orders.json'),
};

function ensureDbDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function saveDb(key, data) {
  try {
    ensureDbDir();
    _dbWriteLock = true;
    fs.writeFileSync(DB_FILES[key], JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[db] save ${key} failed: ${e.message}`);
  } finally {
    setTimeout(() => { _dbWriteLock = false; }, 500);
  }
}

let _dbWriteLock = false;

function reloadDbFile(key) {
  if (_dbWriteLock) return;
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILES[key], 'utf8'));
    let changed = false;
    if (key === 'drinks' && Array.isArray(raw) && raw.length > 0) {
      appState.drinks = raw;
      changed = true;
    } else if (key === 'users' && Array.isArray(raw)) {
      appState.users = sortUsers(raw.filter((u) => typeof u === 'string' && u.trim()));
      changed = true;
    } else if (key === 'options' && Array.isArray(raw)) {
      appState.options = raw.filter((o) => typeof o === 'string' && o.trim());
      changed = true;
    }
    if (changed) {
      touchState();
      broadcastAppState();
      console.log(`[db] ${key}.json 변경 감지 → 메모리 반영 완료`);
    }
  } catch (e) {
    console.error(`[db] ${key}.json 재로드 실패: ${e.message}`);
  }
}

function watchDbFiles() {
  if (!fs.existsSync(DB_DIR)) return;
  const watchTargets = { 'drinks.json': 'drinks', 'users.json': 'users', 'options.json': 'options' };
  const debounceMap = {};
  fs.watch(DB_DIR, (eventType, filename) => {
    if (eventType !== 'change' || !filename || !watchTargets[filename]) return;
    if (_dbWriteLock) return;
    clearTimeout(debounceMap[filename]);
    debounceMap[filename] = setTimeout(() => reloadDbFile(watchTargets[filename]), 300);
  });
}

function loadDb(key, fallback) {
  try {
    return JSON.parse(fs.readFileSync(DB_FILES[key], 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDbOrders() {
  const raw = loadDb('orders', []);
  return raw.filter((o) => o && o.id && o.menuName && o.requester && o.size).map((o) => ({
    id: String(o.id),
    menuName: String(o.menuName),
    category: String(o.category || 'others'),
    requester: String(o.requester),
    size: ['Tall', 'Venti'].includes(o.size) ? o.size : 'Tall',
    temp: ['ICE', 'HOT'].includes(o.temp) ? o.temp : 'ICE',
    options: Array.isArray(o.options) ? o.options.map(String) : [],
    note: String(o.note || ''),
    unitPrice: Number(o.unitPrice) || 0,
    createdAt: o.createdAt || new Date().toISOString(),
    updatedAt: o.updatedAt || new Date().toISOString(),
  }));
}

function sortUsers(users) {
  return [...users].sort((a, b) => a.localeCompare(b, 'ko-KR'));
}

const appState = {
  version: 0,
  updatedAt: new Date(0).toISOString(),
  orders: loadDbOrders(),
  users: sortUsers(loadDb('users', [...USERS])),
  options: loadDb('options', [...ORDER_OPTIONS]),
  drinks: loadDb('drinks', DEFAULT_DRINKS.map((drink) => ({ category: drink.category, name: drink.name, prices: { ...drink.prices } }))),
  seasonalMenus: [],
  seasonalMenusUpdatedAt: new Date(0).toISOString(),
  seasonalMenusLoading: false,
  seasonalMenusError: '',
};
const sseClients = new Set();

function getRuntimeConfig(env = process.env) {
  const port = Number.parseInt(env.PORT || String(DEFAULT_PORT), 10);
  return { host: env.HOST || DEFAULT_HOST, port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT };
}

function cloneDrink(drink) {
  return { category: drink.category, name: drink.name, prices: { Tall: drink.prices.Tall, Venti: drink.prices.Venti }, iceOnly: Boolean(drink.iceOnly) };
}

function cloneOrder(order) {
  return {
    id: order.id,
    menuName: order.menuName,
    category: order.category,
    requester: order.requester,
    size: order.size,
    temp: order.temp || 'ICE',
    options: [...order.options],
    note: order.note,
    unitPrice: order.unitPrice,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function cloneState() {
  return {
    version: appState.version,
    updatedAt: appState.updatedAt,
    users: [...appState.users],
    sizes: [...SIZES],
    options: [...appState.options],
    categories: CATEGORIES.map((category) => ({ ...category })),
    drinks: appState.drinks.map(cloneDrink),
    seasonalMenus: appState.seasonalMenus.map((item) => ({ ...item })),
    seasonalMenusUpdatedAt: appState.seasonalMenusUpdatedAt,
    seasonalMenusLoading: appState.seasonalMenusLoading,
    seasonalMenusError: appState.seasonalMenusError,
    orders: appState.orders.map(cloneOrder),
    totalPrice: getTotalPrice(),
  };
}

function cloneConfig() {
  return { users: [...appState.users], sizes: [...SIZES], options: [...appState.options], categories: CATEGORIES.map((category) => ({ ...category })) };
}

function cloneOrdersPayload() {
  return { version: appState.version, updatedAt: appState.updatedAt, orders: appState.orders.map(cloneOrder), totalPrice: getTotalPrice() };
}

function cloneDrinksPayload() {
  return { version: appState.version, updatedAt: appState.updatedAt, drinks: appState.drinks.map(cloneDrink) };
}

function cloneUsersPayload() {
  return { version: appState.version, updatedAt: appState.updatedAt, users: [...appState.users] };
}

function cloneOptionsPayload() {
  return { version: appState.version, updatedAt: appState.updatedAt, options: [...appState.options] };
}

function cloneSeasonalMenusPayload() {
  return {
    updatedAt: appState.seasonalMenusUpdatedAt,
    loading: appState.seasonalMenusLoading,
    error: appState.seasonalMenusError,
    sourceUrl: NEWS_NEW_URL,
    items: appState.seasonalMenus.map((item) => ({ ...item })),
  };
}

function getTotalPrice() {
  return appState.orders.reduce((sum, order) => sum + order.unitPrice, 0);
}

function touchState() {
  appState.version += 1;
  appState.updatedAt = new Date().toISOString();
}

function normalizeText(value, fieldName, { required = true, maxLength = 100 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`${fieldName} must be a string.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${fieldName} is required.`);
  return normalized.slice(0, maxLength);
}

function normalizeRequester(requester) {
  const normalized = normalizeText(requester, 'requester', { maxLength: 30 });
  if (!appState.users.includes(normalized)) throw new Error('requester must be one of the configured users.');
  return normalized;
}

function normalizeSize(size) {
  const normalized = normalizeText(size, 'size', { maxLength: 10 });
  if (!SIZES.includes(normalized)) throw new Error('size must be Tall or Venti.');
  return normalized;
}

function normalizeCategory(category) {
  const normalized = normalizeText(category || 'others', 'category', { maxLength: 50 });
  if (!CATEGORY_KEYS.has(normalized)) throw new Error('category must be one of the configured categories.');
  return normalized;
}

function normalizePrice(value, fieldName = 'price') {
  const price = Number(value);
  if (!Number.isInteger(price) || price < 0 || price > 1000000) throw new Error(`${fieldName} must be a non-negative integer.`);
  return price;
}

function normalizeOptions(options) {
  if (options === undefined || options === null) return [];
  if (!Array.isArray(options)) throw new Error('options must be an array.');
  const normalized = [...new Set(options.map((option) => normalizeText(option, 'option', { maxLength: 30 })))];
  const invalid = normalized.find((option) => !appState.options.includes(option));
  if (invalid) throw new Error('options must use configured option names.');
  return normalized;
}

function normalizeNote(note) {
  return normalizeText(note, 'note', { required: false, maxLength: 500 });
}

function normalizeDrink(input) {
  if (typeof input === 'string') {
    return { category: 'others', name: normalizeText(input, 'drink name'), prices: { Tall: 0, Venti: 0 }, iceOnly: false };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('drink must be an object.');
  const prices = input.prices || {};
  return {
    category: normalizeCategory(input.category),
    name: normalizeText(input.name, 'drink name', { maxLength: 100 }),
    prices: { Tall: normalizePrice(prices.Tall ?? input.tallPrice ?? 0, 'Tall price'), Venti: normalizePrice(prices.Venti ?? input.ventiPrice ?? 0, 'Venti price') },
    iceOnly: Boolean(input.iceOnly),
  };
}

function normalizeDrinks(input) {
  const drinks = Array.isArray(input) ? input : input && input.drinks;
  if (!Array.isArray(drinks)) throw new Error('drinks must be an array.');
  const normalized = [];
  const seen = new Set();
  for (const rawDrink of drinks) {
    const drink = normalizeDrink(rawDrink);
    const key = `${drink.category}:${drink.name}`;
    if (!seen.has(key)) {
      normalized.push(drink);
      seen.add(key);
    }
  }
  if (normalized.length === 0) throw new Error('drinks must contain at least one drink.');
  if (normalized.length > 150) throw new Error('drinks cannot contain more than 150 entries.');
  return normalized;
}

function normalizeUsers(input) {
  const rawUsers = Array.isArray(input) ? input : input && (Array.isArray(input.users) ? input.users : String(input.users || '').split('|'));
  if (!Array.isArray(rawUsers)) throw new Error('users must be an array or a pipe-delimited string.');
  const seen = new Set();
  const normalized = [];
  for (const rawUser of rawUsers) {
    const rawText = String(rawUser || '').trim();
    if (!rawText) continue;
    const user = normalizeText(rawText, 'user', { maxLength: 30 });
    if (!seen.has(user)) {
      normalized.push(user);
      seen.add(user);
    }
  }
  if (normalized.length > 100) throw new Error('users cannot contain more than 100 entries.');
  return sortUsers(normalized);
}

function normalizeOptionName(value) {
  return normalizeText(String(value || ''), 'option', { maxLength: 30 });
}

function normalizeOptionList(input) {
  const rawOptions = Array.isArray(input) ? input : input && (Array.isArray(input.options) ? input.options : String(input.options || '').split('|'));
  if (!Array.isArray(rawOptions)) throw new Error('options must be an array or a pipe-delimited string.');
  const seen = new Set();
  const normalized = [];
  for (const rawOption of rawOptions) {
    const rawText = String(rawOption || '').trim();
    if (!rawText) continue;
    const option = normalizeOptionName(rawText);
    if (!seen.has(option)) {
      normalized.push(option);
      seen.add(option);
    }
  }
  if (normalized.length === 0) throw new Error('options must contain at least one option.');
  if (normalized.length > 100) throw new Error('options cannot contain more than 100 entries.');
  return normalized;
}


function findDrink(menuName) {
  return appState.drinks.find((drink) => drink.name === menuName);
}

function normalizeOrderInput(input, existingOrder) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('order body must be a JSON object.');
  const next = existingOrder ? cloneOrder(existingOrder) : {};

  if (!existingOrder || Object.prototype.hasOwnProperty.call(input, 'menuName')) next.menuName = normalizeText(input.menuName, 'menuName', { maxLength: 100 });
  if (!existingOrder || Object.prototype.hasOwnProperty.call(input, 'requester')) next.requester = normalizeRequester(input.requester);
  if (!existingOrder || Object.prototype.hasOwnProperty.call(input, 'size')) next.size = normalizeSize(input.size);
  if (!existingOrder || Object.prototype.hasOwnProperty.call(input, 'temp')) next.temp = ['ICE', 'HOT'].includes(input.temp) ? input.temp : (next.temp || 'ICE');
  if (Object.prototype.hasOwnProperty.call(input, 'options') || !existingOrder) next.options = normalizeOptions(input.options);
  if (Object.prototype.hasOwnProperty.call(input, 'note') || !existingOrder) next.note = normalizeNote(input.note);

  const drink = findDrink(next.menuName);
  if (drink) {
    next.category = drink.category;
    if (drink.prices.Venti === 0 && next.size === 'Venti') throw new Error('this drink does not have a Venti size.');
    if (drink.iceOnly && next.temp === 'HOT') throw new Error('this drink is ICE only.');
    next.unitPrice = drink.prices[next.size];
  } else {
    next.category = normalizeCategory(input.category || next.category || 'others');
    next.unitPrice = normalizePrice(input.unitPrice ?? next.unitPrice ?? 0, 'unitPrice');
  }
  return next;
}

function assertUniqueRequester(order) {
  const duplicate = appState.orders.find((item) => item.requester === order.requester && item.id !== order.id);
  if (duplicate) throw new Error('requester already has an order.');
}

function createOrder(input) {
  const now = new Date().toISOString();
  const order = { ...normalizeOrderInput(input), id: randomUUID(), createdAt: now, updatedAt: now };
  assertUniqueRequester(order);
  appState.orders.push(order);
  touchState();
  broadcastAppState();
  saveDb('orders', appState.orders);
  return cloneOrder(order);
}

function updateOrder(id, input) {
  const index = appState.orders.findIndex((order) => order.id === id);
  if (index === -1) return null;
  const existingOrder = appState.orders[index];
  const nextOrder = { ...normalizeOrderInput(input, existingOrder), id: existingOrder.id, createdAt: existingOrder.createdAt, updatedAt: new Date().toISOString() };
  assertUniqueRequester(nextOrder);
  appState.orders[index] = nextOrder;
  touchState();
  broadcastAppState();
  saveDb('orders', appState.orders);
  return cloneOrder(nextOrder);
}

function deleteOrder(id) {
  const index = appState.orders.findIndex((order) => order.id === id);
  if (index === -1) return false;
  appState.orders.splice(index, 1);
  touchState();
  broadcastAppState();
  saveDb('orders', appState.orders);
  return true;
}

function replaceUsers(input) {
  appState.users = normalizeUsers(input);
  touchState();
  broadcastAppState();
  saveDb('users', appState.users);
  return cloneUsersPayload();
}

function replaceOptions(input) {
  appState.options = normalizeOptionList(input);
  appState.orders = appState.orders.map((order) => ({ ...order, options: order.options.filter((option) => appState.options.includes(option)) }));
  touchState();
  broadcastAppState();
  saveDb('options', appState.options);
  saveDb('orders', appState.orders);
  return cloneOptionsPayload();
}

function addOption(input) {
  const option = normalizeOptionName(input && input.option);
  if (!appState.options.includes(option)) appState.options = [...appState.options, option];
  touchState();
  broadcastAppState();
  saveDb('options', appState.options);
  return cloneOptionsPayload();
}

function replaceDrinks(input) {
  appState.drinks = normalizeDrinks(input);
  appState.orders = appState.orders.map((order) => {
    const drink = findDrink(order.menuName);
    return drink ? { ...order, category: drink.category, unitPrice: drink.prices[order.size], updatedAt: new Date().toISOString() } : order;
  });
  touchState();
  broadcastAppState();
  saveDb('drinks', appState.drinks);
  saveDb('orders', appState.orders);
  return cloneDrinksPayload();
}

function resetOrders() {
  appState.orders = [];
  touchState();
  broadcastAppState();
  saveDb('orders', []);
  return cloneOrdersPayload();
}

function resetState() {
  appState.version = 0;
  appState.updatedAt = new Date(0).toISOString();
  appState.orders = [];
  appState.users = [...USERS];
  appState.options = [...ORDER_OPTIONS];
  appState.drinks = DEFAULT_DRINKS.map((drink) => ({ category: drink.category, name: drink.name, prices: { ...drink.prices } }));
  appState.seasonalMenus = [];
  appState.seasonalMenusUpdatedAt = new Date(0).toISOString();
  appState.seasonalMenusLoading = false;
  appState.seasonalMenusError = '';
  saveDb('orders', []);
  saveDb('users', appState.users);
  saveDb('options', appState.options);
  saveDb('drinks', appState.drinks);
  return cloneState();
}


function extractBeverageBundleUrl(html) {
  const m = html.match(/window\.___chunkMapping\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    const mapping = JSON.parse(m[1]);
    const chunks = mapping[BEVERAGE_CHUNK_NAME];
    return chunks && chunks.length ? `https://www.cafeartisee.com${chunks[0]}` : null;
  } catch { return null; }
}

function parseBeverageBundle(bundleText) {
  const itemRe = /\{id:"(\d+)",korName:"([^"]+)",engName:"([^"]+)",imageUri:[^,]+,price:(\d+),desc:"([^"]+)"\}/g;
  let categoryIndex = 0;
  let prevId = null;
  const drinks = [];
  let m;
  while ((m = itemRe.exec(bundleText)) !== null) {
    const id = m[1];
    const korName = m[2];
    const price = parseInt(m[4], 10);
    if (id === '001' && prevId !== null) {
      categoryIndex = Math.min(categoryIndex + 1, BEVERAGE_CATEGORIES.length - 1);
    }
    prevId = id;
    drinks.push({ category: BEVERAGE_CATEGORIES[categoryIndex], name: korName, prices: { Tall: price, Venti: price + 500 }, iceOnly: false });
  }
  return drinks;
}

function mergeDrinks(existing, incoming) {
  const existingMap = new Map(existing.map((d) => [d.name, d]));
  const incomingNames = new Set(incoming.map((d) => d.name));
  const customDrinks = existing.filter((d) => !incomingNames.has(d.name));
  const existingOfficialCount = existing.filter((d) => incomingNames.has(d.name)).length;
  let changed = existingOfficialCount !== incoming.length;
  const result = incoming.map((drink) => {
    const prev = existingMap.get(drink.name);
    if (!prev || prev.category !== drink.category || prev.prices.Tall !== drink.prices.Tall) changed = true;
    return cloneDrink(drink);
  });
  result.push(...customDrinks.map(cloneDrink));
  return { drinks: result, changed };
}

let beverageRefreshPromise = null;

async function refreshBeverageMenu({ broadcastUpdate = true } = {}) {
  if (beverageRefreshPromise) return beverageRefreshPromise;
  beverageRefreshPromise = (async () => {
    try {
      const html = await fetchText(BEVERAGE_PAGE_URL);
      const bundleUrl = extractBeverageBundleUrl(html);
      if (!bundleUrl) throw new Error('beverage bundle URL not found in chunk mapping');
      const bundleText = await fetchText(bundleUrl);
      const incoming = parseBeverageBundle(bundleText);
      if (!incoming.length) throw new Error('no drinks parsed from bundle');
      const { drinks, changed } = mergeDrinks(appState.drinks, incoming);
      if (changed) {
        appState.drinks = drinks;
        appState.orders = appState.orders.map((order) => {
          const drink = drinks.find((d) => d.name === order.menuName);
          return drink ? { ...order, category: drink.category, unitPrice: drink.prices[order.size], updatedAt: new Date().toISOString() } : order;
        });
        touchState();
        if (broadcastUpdate) broadcastAppState();
        saveDb('drinks', appState.drinks);
        console.log(`[beverage-menu] updated: ${drinks.length} drinks`);
      } else {
        console.log(`[beverage-menu] no changes (${drinks.length} drinks)`);
      }
    } catch (error) {
      console.error(`[beverage-menu] refresh failed: ${error.message}`);
    } finally {
      beverageRefreshPromise = null;
    }
  })();
  return beverageRefreshPromise;
}

function scheduleBeverageMenuRefresh() {
  refreshBeverageMenu().catch((e) => console.error(`[beverage-menu] ${e.message}`));
  return setInterval(() => {
    refreshBeverageMenu().catch((e) => console.error(`[beverage-menu] ${e.message}`));
  }, BEVERAGE_REFRESH_MS);
}

function isoToKstDate(iso) {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function isApiItemActive(item, now = new Date()) {
  if (now < new Date(item.release_date)) return false;
  if (!item.expire_date) return true;
  return now <= new Date(new Date(item.expire_date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

function parseNewMenuJson(jsonText, now = new Date()) {
  let data;
  try { data = JSON.parse(jsonText); } catch { return []; }
  if (!Array.isArray(data)) return [];

  const items = [];
  const seen = new Set();
  for (const item of data) {
    if (!item.title || !item.title.includes('음료')) continue;
    if (!isApiItemActive(item, now)) continue;
    const key = item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const startDate = isoToKstDate(item.release_date);
    const endDate = item.expire_date ? isoToKstDate(item.expire_date) : '상시';
    items.push({
      status: '판매 중',
      title: item.title,
      startDate,
      endDate,
      url: NEWS_VIEW_BASE + item.id,
      active: true,
    });
  }
  console.log(`[season-menu] parsed ${items.length} active beverage items from API`);
  return items;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'attije-order-sheet/1.0' } }, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
        response.resume();
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

let seasonalRefreshPromise = null;

async function refreshSeasonalMenus({ broadcastUpdate = true } = {}) {
  if (seasonalRefreshPromise) return seasonalRefreshPromise;
  appState.seasonalMenusLoading = true;
  appState.seasonalMenusError = '';
  if (broadcastUpdate) broadcastAppState();
  seasonalRefreshPromise = (async () => {
    try {
      const json = await fetchText(NEWS_API_URL);
      appState.seasonalMenus = parseNewMenuJson(json, new Date());
      appState.seasonalMenusUpdatedAt = new Date().toISOString();
      appState.seasonalMenusError = '';
    } catch (error) {
      appState.seasonalMenusError = error.message || '새메뉴 페이지 갱신 실패';
      console.error(`새메뉴 페이지 갱신 실패: ${appState.seasonalMenusError}`);
    } finally {
      appState.seasonalMenusLoading = false;
      seasonalRefreshPromise = null;
      if (broadcastUpdate) broadcastAppState();
    }
    return cloneSeasonalMenusPayload();
  })();
  return seasonalRefreshPromise;
}

async function ensureSeasonalMenusReady() {
  if (appState.seasonalMenusUpdatedAt === new Date(0).toISOString() || appState.seasonalMenusLoading) {
    return refreshSeasonalMenus({ broadcastUpdate: true });
  }
  return cloneSeasonalMenusPayload();
}

function scheduleSeasonalMenuRefresh() {
  refreshSeasonalMenus().catch((error) => {
    console.error(`새메뉴 페이지 갱신 실패: ${error.message}`);
  });
  return setInterval(() => {
    refreshSeasonalMenus().catch((error) => {
      console.error(`새메뉴 페이지 갱신 실패: ${error.message}`);
    });
  }, SEASON_MENU_REFRESH_MS);
}

function isLocalRequest(req) {
  const remote = req.socket && req.socket.remoteAddress;
  const host = (req.headers.host || '').split(':')[0];
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(remote) || ['127.0.0.1', '::1', 'localhost'].includes(host);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
  });
  if (statusCode === 204) res.end();
  else res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) resolve({});
      else {
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('request body must be valid JSON.')); }
      }
    });
    req.on('error', reject);
  });
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of sseClients) writeSse(res, event, data);
}

function broadcastAppState() {
  broadcast('app-state', cloneState());
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');
  writeSse(res, 'app-state', cloneState());
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
}

function safeStaticPath(pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(normalizedPath);
  const filePath = path.resolve(FRONTEND_DIR, `.${decoded}`);
  if (!filePath.startsWith(FRONTEND_DIR + path.sep) && filePath !== FRONTEND_DIR) return null;
  return filePath;
}

function serveStatic(req, res, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath) return sendError(res, 403, 'Forbidden');
  fs.readFile(filePath, (error, content) => {
    if (error) return sendError(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
    let responseContent = content;
    if (path.basename(filePath) === 'index.html' && !isLocalRequest(req)) {
      responseContent = String(content)
        .replace(/(<a id="admin-link")/, '$1 style="display:none"')
        .replace(/(<button id="reset-order")/, '$1 style="display:none"');
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? '' : responseContent);
  });
}

async function requestHandler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (url.pathname === '/health') return sendJson(res, 200, { ok: true });
  if (url.pathname === '/api/config' && req.method === 'GET') return sendJson(res, 200, cloneConfig());
  if (url.pathname === '/api/users' && req.method === 'GET') return sendJson(res, 200, cloneUsersPayload());
  if (url.pathname === '/api/users' && req.method === 'PUT') {
    if (!isLocalRequest(req)) return sendError(res, 403, 'User management is only available from localhost.');
    try { return sendJson(res, 200, replaceUsers(await readJson(req))); } catch (error) { return sendError(res, 400, error.message); }
  }
  if (url.pathname === '/api/options' && req.method === 'GET') return sendJson(res, 200, cloneOptionsPayload());
  if (url.pathname === '/api/options' && req.method === 'PUT') {
    try { return sendJson(res, 200, replaceOptions(await readJson(req))); } catch (error) { return sendError(res, 400, error.message); }
  }
  if (url.pathname === '/api/options' && req.method === 'POST') {
    try { return sendJson(res, 201, addOption(await readJson(req))); } catch (error) { return sendError(res, 400, error.message); }
  }
  if (url.pathname === '/api/events' && req.method === 'GET') return handleSse(req, res);
  if (url.pathname === '/api/season-menu' && req.method === 'GET') return sendJson(res, 200, await ensureSeasonalMenusReady());
  if (url.pathname === '/api/drinks' && req.method === 'GET') return sendJson(res, 200, cloneDrinksPayload());
  if (url.pathname === '/api/drinks' && req.method === 'PUT') {
    try { return sendJson(res, 200, replaceDrinks(await readJson(req))); } catch (error) { return sendError(res, 400, error.message); }
  }
  if (url.pathname === '/api/orders' && req.method === 'GET') return sendJson(res, 200, cloneOrdersPayload());
  if (url.pathname === '/api/orders' && req.method === 'POST') {
    try {
      const order = createOrder(await readJson(req));
      return sendJson(res, 201, { order, ...cloneOrdersPayload() });
    } catch (error) { return sendError(res, 400, error.message); }
  }
  if (url.pathname === '/api/orders/reset' && req.method === 'POST') {
    if (!isLocalRequest(req)) return sendError(res, 403, 'Order reset is only available from localhost.');
    return sendJson(res, 200, resetOrders());
  }
  if (orderMatch && req.method === 'PUT') {
    try {
      const order = updateOrder(orderMatch[1], await readJson(req));
      return order ? sendJson(res, 200, { order, ...cloneOrdersPayload() }) : sendError(res, 404, 'Order not found');
    } catch (error) { return sendError(res, 400, error.message); }
  }
  if (orderMatch && req.method === 'DELETE') return deleteOrder(orderMatch[1]) ? sendJson(res, 200, cloneOrdersPayload()) : sendError(res, 404, 'Order not found');
  if ((url.pathname === '/admin.html' || url.pathname === '/admin.js') && !isLocalRequest(req)) return sendError(res, 403, 'Admin page is only available from localhost.');
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
  return sendError(res, 405, 'Method Not Allowed');
}

function createServer() {
  return http.createServer((req, res) => requestHandler(req, res).catch((error) => sendError(res, 500, error.message || 'Internal Server Error')));
}

function startServer(env = process.env) {
  const { host, port } = getRuntimeConfig(env);
  const server = createServer();
  const seasonalTimer = scheduleSeasonalMenuRefresh();
  const beverageTimer = scheduleBeverageMenuRefresh();
  watchDbFiles();
  const stopTimers = () => { clearInterval(seasonalTimer); clearInterval(beverageTimer); };
  server.on('error', (error) => {
    stopTimers();
    console.error(`아띠제 주문표 서버 시작 실패: ${host}:${port}`);
    console.error(error.message);
    if (require.main === module) process.exitCode = 1;
  });
  server.on('close', stopTimers);
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`아띠제 주문표 서버 실행: http://${host}:${address.port}`);
    console.log('주문 API: /api/config, /api/drinks, /api/orders, SSE /api/events');
  });
  return server;
}

if (require.main === module) startServer();

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  USERS,
  SIZES,
  ORDER_OPTIONS,
  CATEGORIES,
  DEFAULT_DRINKS,
  saveDb,
  loadDb,
  parseBeverageBundle,
  extractBeverageBundleUrl,
  mergeDrinks,
  refreshBeverageMenu,
  createServer,
  requestHandler,
  getRuntimeConfig,
  resetState,
  resetOrders,
  replaceUsers,
  replaceOptions,
  addOption,
  replaceDrinks,
  createOrder,
  updateOrder,
  deleteOrder,
  cloneState,
  parseNewMenuJson,
  isApiItemActive,
  refreshSeasonalMenus,
  cloneUsersPayload,
  cloneOptionsPayload,
  cloneSeasonalMenusPayload,
  ensureSeasonalMenusReady,
  isLocalRequest,
};
