import { Buffer } from "node:buffer";

// 아띠제 새메뉴 자동 반영. 매달 1일 09:00 크론 Worker와 관리자 화면의 "지금 확인" 버튼이 함께 쓴다.
const NEW_MENU_API_URL = "https://cafeartisee.apis.flyground.co.kr/new-menu";
const VISION_MODEL = "@cf/qwen/qwen3.8-27b";
const MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROMPT = `이 이미지는 카페 아티제의 신메뉴 안내 포스터입니다.
포스터에 있는 음료 메뉴만 찾아 JSON 배열로만 답하세요. 다른 설명은 쓰지 마세요.
각 항목 형식: {"name": "한글 메뉴명", "petit": "P" 옆 가격 숫자(예: 7.8) 또는 null, "grande": "G" 옆 가격 숫자 또는 null}
- 메뉴명은 포스터에 인쇄된 한글 글자를 그대로 옮기세요. 외래어 표기나 띄어쓰기를 고치거나 영어 이름을 번역하지 마세요.
- 가격은 앞에 붙은 글자(P 또는 G)에 맞는 칸에만 넣고, 그 글자가 없는 사이즈는 null로 두세요.
- 빙수, 케이크, 빵, 디저트처럼 음료가 아닌 메뉴와 하단의 미운영 매장 안내는 제외하세요.`;

function isDrinkEvent(event) {
  return typeof event?.title === "string" && event.title.includes("음료") && Boolean(event.id);
}
// 새메뉴 API의 종료일은 마지막 판매일 0시(KST)라서 그날이 끝날 때까지는 판매 중으로 본다.
function isEnded(event, now) {
  return Boolean(event.expire_date) && now.getTime() > new Date(event.expire_date).getTime() + DAY_MS - 1;
}
function isActive(event, now) {
  return now >= new Date(event.release_date) && !isEnded(event, now);
}
// 포스터와 앱의 메뉴명은 단어 순서나 "아이스", "(P)" 표기가 다를 수 있어 그 차이는 무시하고 비교한다.
// 예: 포스터 "보늬밤 몽블랑 카페라떼" = 앱 "몽블랑 보늬밤 카페라떼"
export function normalizeName(name) {
  return String(name).replace(/^\((P|G)\)/, "").replace(/^아이스\s+/, "").replace(/\((P|G)\)$/, "").trim().split(/\s+/).sort().join(" ");
}
// 포스터 가격은 천 원 단위(7.8 = 7,800원)로 적혀 있다.
function toWon(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n < 100 ? n * 1000 : n) / 100) * 100;
}
function isPlausiblePrice(won) {
  return won === 0 || (won >= 1000 && won <= 15000);
}

function parseItems(text) {
  const match = String(text).match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AI 응답에서 메뉴 목록을 찾지 못했습니다.");
  const raw = JSON.parse(match[0]);
  if (!Array.isArray(raw)) throw new Error("AI 응답 형식이 올바르지 않습니다.");
  return raw
    .map((item) => ({ name: String(item?.name || "").trim(), petit: toWon(item?.petit), grande: toWon(item?.grande) }))
    .filter((item) => item.name && item.name.length <= 40 && (item.petit || item.grande))
    .filter((item) => isPlausiblePrice(item.petit) && isPlausiblePrice(item.grande));
}

async function readPoster(env, imageUrl) {
  if (!imageUrl) throw new Error("포스터 이미지 주소가 없습니다.");
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`포스터를 받지 못했습니다. (HTTP ${res.status})`);
  const type = res.headers.get("content-type") || "image/jpeg";
  // Workers AI는 외부 이미지 주소를 받지 않아 data URL로 보낸다. 무료 요금제 CPU 한도 때문에 네이티브 Buffer로 인코딩한다.
  const image = Buffer.from(await res.arrayBuffer()).toString("base64");
  const result = await env.AI.run(VISION_MODEL, {
    messages: [{ role: "user", content: [
      { type: "text", text: PROMPT },
      { type: "image_url", image_url: { url: `data:${type};base64,${image}` } },
    ] }],
    max_tokens: 800,
    temperature: 0,
  });
  return parseItems(result?.response ?? result?.choices?.[0]?.message?.content ?? "");
}

function saveEvent(db, event, { status, items = [], error = "" }, now) {
  return db.prepare(`INSERT INTO menu_events (id, title, release_date, expire_date, status, items, attempts, error, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, release_date = excluded.release_date, expire_date = excluded.expire_date,
      status = excluded.status, items = excluded.items, attempts = menu_events.attempts + 1, error = excluded.error, checked_at = excluded.checked_at`)
    .bind(event.id, event.title, event.release_date, event.expire_date ?? null, status, JSON.stringify(items), error, now.toISOString());
}

export async function syncSeasonMenus(env, trigger) {
  const db = env.DB;
  const now = new Date();
  const report = { checked: [], added: [], linked: [], removed: [], failed: [] };

  const res = await fetch(NEW_MENU_API_URL);
  if (!res.ok) throw new Error(`새메뉴 API 응답 오류 (HTTP ${res.status})`);
  const data = await res.json();
  const events = (Array.isArray(data) ? data : []).filter(isDrinkEvent);
  const { results: knownRows = [] } = await db.prepare("SELECT * FROM menu_events").all();
  const known = new Map(knownRows.map((row) => [row.id, row]));

  // 판매 기간이 바뀐 행사는 종료일을 최신으로 맞춘다.
  for (const event of events) {
    const row = known.get(event.id);
    if (!row || (row.expire_date ?? null) === (event.expire_date ?? null)) continue;
    row.expire_date = event.expire_date ?? null;
    await db.prepare("UPDATE menu_events SET expire_date = ? WHERE id = ?").bind(row.expire_date, row.id).run();
  }

  // 2. 판매가 끝난 행사의 음료를 메뉴에서 뺀다.
  for (const row of known.values()) {
    if (row.status !== "added" || !isEnded(row, now)) continue;
    const { results = [] } = await db.prepare("SELECT name FROM drinks WHERE source_event_id = ?").bind(row.id).all();
    await db.batch([
      db.prepare("DELETE FROM drinks WHERE source_event_id = ?").bind(row.id),
      db.prepare("UPDATE menu_events SET status = 'expired', checked_at = ? WHERE id = ?").bind(now.toISOString(), row.id),
    ]);
    report.removed.push(...results.map((r) => r.name));
  }

  // 1·3. 판매 중인데 아직 처리하지 않은 행사는 포스터를 읽어 시즌음료로 넣는다.
  for (const event of events) {
    if (!isActive(event, now)) continue;
    const row = known.get(event.id);
    // 읽기에 실패한 행사는 자동 실행에서 3번까지만 다시 시도하고, "지금 확인"은 횟수와 상관없이 다시 시도한다.
    if (row && (row.status !== "failed" || (trigger === "cron" && row.attempts >= MAX_ATTEMPTS))) continue;
    report.checked.push(event.title);
    try {
      const items = await readPoster(env, event.detail_image?.url);
      if (!items.length) throw new Error("포스터에서 음료를 찾지 못했습니다.");
      const { results: drinks = [] } = await db.prepare("SELECT category, name, sort_order FROM drinks").all();
      let sortOrder = drinks.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1;
      const statements = [];
      for (const item of items) {
        const existing = drinks.find((d) => normalizeName(d.name) === normalizeName(item.name));
        if (existing) {
          // 이미 손으로 넣어 둔 시즌음료는 행사에 연결만 한다. 상시 메뉴에 있는 음료는 건드리지 않는다.
          if (existing.category === "season") {
            statements.push(db.prepare("UPDATE drinks SET source_event_id = ? WHERE category = 'season' AND name = ?").bind(event.id, existing.name));
            report.linked.push(existing.name);
          }
          continue;
        }
        statements.push(db.prepare(`INSERT OR IGNORE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order, source_event_id)
          VALUES ('season', ?, ?, ?, 0, ?, ?)`).bind(item.name, item.petit, item.grande, sortOrder++, event.id));
        report.added.push(item);
      }
      statements.push(saveEvent(db, event, { status: "added", items }, now));
      await db.batch(statements);
    } catch (error) {
      await saveEvent(db, event, { status: "failed", error: error.message }, now).run();
      report.failed.push({ title: event.title, error: error.message });
    }
  }

  await db.prepare(`INSERT INTO season_sync (id, ran_at, trigger, report) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET ran_at = excluded.ran_at, trigger = excluded.trigger, report = excluded.report`)
    .bind(now.toISOString(), trigger, JSON.stringify(report)).run();
  return { ran_at: now.toISOString(), trigger, report };
}

export async function getLastSeasonSync(db) {
  const row = await db.prepare("SELECT * FROM season_sync WHERE id = 1").first();
  if (!row) return null;
  try {
    return { ran_at: row.ran_at, trigger: row.trigger, report: JSON.parse(row.report) };
  } catch {
    return { ran_at: row.ran_at, trigger: row.trigger, report: {} };
  }
}
