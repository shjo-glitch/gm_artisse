// 아티제 앱에서 수집한 메뉴(JSON)를 D1 drinks 테이블용 SQL로 바꾼다.
// 사용법: node scripts/build-menu-seed.mjs seeds/app-menu-2026-10-29.json [menu-events.json] [current-drinks.json] > seeds/app-menu-2026-10-29.sql
import { readFileSync } from "node:fs";
import { normalizeName } from "../lib/season-sync.js";

const [menuPath, eventsPath, currentPath] = process.argv.slice(2);
const products = Object.values(JSON.parse(readFileSync(menuPath, "utf8")));
// [{ id, items: [{ name }] }] — 새메뉴 자동 반영이 기록한 행사. 시즌음료를 행사에 연결하는 데 쓴다.
const events = eventsPath ? JSON.parse(readFileSync(eventsPath, "utf8")) : [];
// 지금 운영 중인 음료 목록(/api/config의 drinks). 품절이라 가격을 못 읽은 사이즈의 차액을 여기서 가져온다.
const current = currentPath ? JSON.parse(readFileSync(currentPath, "utf8")) : [];
const estimated = [];

const CATEGORY_KEYS = {
  "시즌": "season", "에스프레소": "coffee", "콜드브루": "cold-brew", "스무디&에이드": "smoothie-ade",
  "티&기타": "tea", "프라페": "frappe", "리얼후르츠음료": "real-fruit-beverage", "음료": "bottled",
};
// 앱에 HOT/ICE 상품이 따로 없을 때 카테고리로 정하는 온도
const ICE_CATEGORIES = new Set(["cold-brew", "smoothie-ade", "frappe", "real-fruit-beverage", "bottled"]);
const CHOICE_NAMES = { "샷추가": "샷 추가", "바닐라시럽추가": "바닐라 시럽 추가", "휘핑추가": "휘핑 추가", "디카페인W": "디카페인" };
const GROUP_NAMES = { "옵션 추가": "옵션 추가", "디카페인변경": "디카페인 변경", "우유변경": "우유 변경" };

// 앱 상품명은 "아이스 ○○(P)", "○○(G)" 외에 "(P)아이스 ○○"처럼 사이즈가 앞에 붙기도 한다.
const isIce = (name) => /^(\((P|G)\))?아이스\s/.test(name);
const isGrande = (name) => /\(G\)$|^\(G\)/.test(name);
const baseName = (name) => name.replace(/^\((P|G)\)/, "").replace(/^아이스\s+/, "").replace(/\((P|G)\)$/, "").trim();

function extrasOf(groups) {
  const out = [];
  for (const g of groups) {
    const m = g.title.match(/^(.*?)\s*\((?:(\d+)~(\d+)개|최대 (\d+)개) 선택\)$/);
    if (!m) continue;
    const key = m[1].replace(/\s+/g, "");
    if (key === "사이즈업") continue;
    const title = GROUP_NAMES[m[1]] || GROUP_NAMES[key] || m[1];
    const max = Number(m[3] || m[4] || 1);
    const mode = m[3] ? "count" : "pick";
    // 품절은 수집 시점의 매장 재고라 저장하지 않는다.
    const choices = g.choices.map((c) => ({ name: CHOICE_NAMES[c.name] || c.name, price: c.price || 0 }));
    out.push({ title, mode, max, choices });
  }
  return out;
}
function mergeExtras(list) {
  const byTitle = new Map();
  for (const groups of list) for (const g of groups) {
    const cur = byTitle.get(g.title) || { ...g, choices: [] };
    for (const c of g.choices) if (!cur.choices.some((x) => x.name === c.name)) cur.choices.push(c);
    byTitle.set(g.title, cur);
  }
  return [...byTitle.values()];
}

const groups = new Map();
for (const p of products) {
  const category = CATEGORY_KEYS[p.cat];
  if (!category) continue;
  const key = `${category}|${baseName(p.name)}`;
  if (!groups.has(key)) groups.set(key, { category, name: baseName(p.name), products: [] });
  groups.get(key).products.push(p);
}

const drinks = [];
for (const g of groups.values()) {
  const sold = g.products.filter((p) => p.available !== false && p.price);
  if (!sold.length) continue;
  const anyIceVariant = g.products.some((p) => isIce(p.name));
  const anyHotVariant = g.products.some((p) => !isIce(p.name));
  let hot, ice;
  if (anyIceVariant && anyHotVariant) {
    hot = sold.some((p) => !isIce(p.name));
    ice = sold.some((p) => isIce(p.name));
  } else if (anyIceVariant) {
    hot = false; ice = true;
  } else {
    ice = ICE_CATEGORIES.has(g.category) || /only ice/i.test(g.products[0].desc || "");
    hot = !ice;
  }
  // 품절(SOLD OUT) 상품은 상세를 열 수 없어 가격을 모른다. 메뉴·온도에는 넣되 가격은 열어 본 상품으로만 정한다.
  const priced = sold.filter((p) => !p.soldOut);
  const petitPrices = priced.filter((p) => !isGrande(p.name)).map((p) => p.price);
  const grandePrices = priced.filter((p) => isGrande(p.name)).map((p) => p.price);
  let tall = petitPrices.length ? Math.min(...petitPrices) : 0;
  let grande = grandePrices.length ? Math.min(...grandePrices) : 0;
  const sizeUp = sold.flatMap((p) => p.groups || []).find((x) => x.title.startsWith("사이즈업"));
  if (!grande && tall && sizeUp) grande = tall + (sizeUp.choices[0]?.price || 0);
  // 품절인 사이즈도 메뉴에 남긴다. 가격은 운영 중인 같은 메뉴의 차액, 없으면 500원 차이로 추정한다.
  const hasSoldOutGrande = sold.some((p) => p.soldOut && isGrande(p.name));
  const hasSoldOutPetit = sold.some((p) => p.soldOut && !isGrande(p.name));
  const known = current.find((d) => normalizeName(d.name) === normalizeName(g.name) && d.tall_price && d.grande_price);
  const gap = known ? known.grande_price - known.tall_price : 500;
  if (!grande && tall && hasSoldOutGrande) { grande = tall + gap; estimated.push(`${g.name} Grande ${grande}원 (${known ? "기존 목록 차액" : "+500원 추정"})`); }
  if (!tall && grande && hasSoldOutPetit) { tall = grande - gap; estimated.push(`${g.name} Petit ${tall}원 (${known ? "기존 목록 차액" : "-500원 추정"})`); }
  drinks.push({
    category: g.category, name: g.name, tall, grande,
    ice_only: ice && !hot ? 1 : 0, hot_only: hot && !ice ? 1 : 0,
    extras: mergeExtras(sold.map((p) => extrasOf(p.groups || []))),
  });
}

const order = Object.values(CATEGORY_KEYS);
drinks.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
const sourceOf = (name) => events.find((ev) => ev.items.some((it) => normalizeName(it.name) === normalizeName(name)))?.id ?? null;
const q = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

console.log(`-- 아티제 앱 음료 메뉴 (${menuPath.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ""} 수집). scripts/build-menu-seed.mjs 로 만든다.`);
console.log("-- 기존 음료 목록을 앱 메뉴로 바꾼다. \"주문 안함\"은 기타로 남긴다.");
console.log("DELETE FROM drinks WHERE name <> '주문 안함';");
drinks.forEach((d, i) => {
  console.log(`INSERT INTO drinks (category, name, tall_price, grande_price, ice_only, hot_only, sort_order, source_event_id, extras) VALUES (${q(d.category)}, ${q(d.name)}, ${d.tall}, ${d.grande}, ${d.ice_only}, ${d.hot_only}, ${i}, ${d.category === "season" ? q(sourceOf(d.name)) : "NULL"}, ${q(JSON.stringify(d.extras))});`);
});
console.log(`UPDATE drinks SET category = 'others', sort_order = ${drinks.length} WHERE name = '주문 안함';`);
console.error(`${drinks.length} drinks`);
if (estimated.length) console.error(`추정 가격 (확인 필요):\n  ${estimated.join("\n  ")}`);
