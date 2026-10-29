import { getLastSeasonSync, syncSeasonMenus } from "../../lib/season-sync.js";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function parseJsonArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function configFromRow(row) {
  return {
    id: row?.id ?? 1,
    users: parseJsonArray(row?.users),
    options: parseJsonArray(row?.options),
    orders_closed: Boolean(row?.orders_closed),
    updated_at: row?.updated_at ?? null,
  };
}

// 관리자 화면에서 받은 유료 옵션을 저장할 수 있는 모양으로 정리한다.
// [{ title, mode: "count" | "pick", max, choices: [{ name, price }] }]
function cleanExtras(groups) {
  return (Array.isArray(groups) ? groups : []).map((g) => {
    const mode = g?.mode === "pick" ? "pick" : "count";
    return {
      title: String(g?.title || "").trim().slice(0, 30),
      mode,
      max: mode === "pick" ? 1 : Math.min(10, Math.max(1, Math.round(Number(g?.max) || 1))),
      choices: (Array.isArray(g?.choices) ? g.choices : [])
        .map((c) => ({ name: String(c?.name || "").trim().slice(0, 30), price: Math.max(0, Math.round(Number(c?.price) || 0)) }))
        .filter((c) => c.name),
    };
  }).filter((g) => g.title && g.choices.length);
}

function drinkFromRow(row) {
  return { ...row, ice_only: Boolean(row.ice_only), hot_only: Boolean(row.hot_only), extras: parseJsonArray(row.extras) };
}

function orderFromRow(row) {
  return { ...row, options: parseJsonArray(row.options) };
}

async function ensureDatabase(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      users TEXT NOT NULL DEFAULT '[]',
      options TEXT NOT NULL DEFAULT '[]',
      orders_closed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS drinks (
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      tall_price INTEGER NOT NULL DEFAULT 0,
      grande_price INTEGER NOT NULL DEFAULT 0,
      ice_only INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (category, name)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      menu_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'others',
      requester TEXT NOT NULL,
      size TEXT NOT NULL CHECK (size IN ('Tall', 'Grande')),
      temp TEXT NOT NULL DEFAULT 'ICE' CHECK (temp IN ('ICE', 'HOT')),
      options TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      unit_price INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at)"),
    db.prepare(`INSERT OR IGNORE INTO config (id, users, options, orders_closed)
      VALUES (1, '[]', '["연하게","덜달게","더달게"]', 0)`),
  ]);
}

// 관리자 아이디(ADMIN_ID)와 비밀번호(ADMIN_PASSWORD)는 Pages 시크릿이다. 둘 중 하나라도 없으면 관리자 요청을 모두 거부한다.
// 아이디는 한글도 쓸 수 있게 브라우저가 encodeURIComponent 로 보낸다.
function safeEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function isAdmin(request, env) {
  if (!env.ADMIN_ID || !env.ADMIN_PASSWORD) return false;
  let id = "";
  try { id = decodeURIComponent(request.headers.get("x-admin-id") || ""); } catch { return false; }
  return safeEqual(id, env.ADMIN_ID) && safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD);
}

async function getConfig(db) {
  return configFromRow(await db.prepare("SELECT * FROM config WHERE id = 1").first());
}

async function getDrinks(db) {
  const { results = [] } = await db.prepare("SELECT * FROM drinks ORDER BY sort_order ASC, name ASC").all();
  return results.map(drinkFromRow);
}

async function getOrders(db) {
  const { results = [] } = await db.prepare("SELECT * FROM orders ORDER BY created_at ASC").all();
  return results.map(orderFromRow);
}

async function assertOrdersOpen(db) {
  const config = await getConfig(db);
  if (config.orders_closed) {
    const error = new Error("주문이 마감되었습니다.");
    error.status = 409;
    throw error;
  }
}

async function handleApi(request, env, url) {
  if (!env.DB) return json({ error: "D1 데이터베이스(DB 바인딩)가 연결되지 않았습니다." }, 503);
  await ensureDatabase(env.DB);
  const db = env.DB;
  const path = url.pathname;

  if (path === "/api/admin/auth" && request.method === "POST") {
    return isAdmin(request, env) ? json({ ok: true }) : json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }

  if (path === "/api/state" && request.method === "GET") {
    const [config, drinks, orders] = await Promise.all([getConfig(db), getDrinks(db), getOrders(db)]);
    return json({ config, drinks, orders });
  }

  if (path === "/api/orders" && request.method === "GET") return json({ orders: await getOrders(db) });
  if (path === "/api/config" && request.method === "GET") {
    const [config, drinks] = await Promise.all([getConfig(db), getDrinks(db)]);
    return json({ config, drinks });
  }

  if (path === "/api/orders" && request.method === "POST") {
    await assertOrdersOpen(db);
    const body = await request.json();
    const requester = String(body.requester || "").trim();
    if (!requester) return json({ error: "주문자를 선택해주세요." }, 400);
    const existing = await db.prepare("SELECT id FROM orders WHERE requester = ? LIMIT 1").bind(requester).first();
    if (existing) return json({ error: "이미 등록된 주문자가 있습니다." }, 409);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO orders
      (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        String(body.menu_name || ""),
        String(body.category || "others"),
        requester,
        String(body.size || ""),
        String(body.temp || "ICE"),
        JSON.stringify(Array.isArray(body.options) ? body.options : []),
        String(body.note || ""),
        Number(body.unit_price) || 0,
        now,
        now,
      ).run();
    return json({ order: orderFromRow(await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first()) }, 201);
  }

  const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && request.method === "PUT") {
    await assertOrdersOpen(db);
    const id = decodeURIComponent(orderMatch[1]);
    const body = await request.json();
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE orders SET
      menu_name = ?, category = ?, requester = ?, size = ?, temp = ?,
      options = ?, note = ?, unit_price = ?, updated_at = ?
      WHERE id = ?`)
      .bind(
        String(body.menu_name || ""),
        String(body.category || "others"),
        String(body.requester || ""),
        String(body.size || ""),
        String(body.temp || "ICE"),
        JSON.stringify(Array.isArray(body.options) ? body.options : []),
        String(body.note || ""),
        Number(body.unit_price) || 0,
        now,
        id,
      ).run();
    if (!result.meta?.changes) return json({ error: "주문을 찾을 수 없습니다." }, 404);
    return json({ order: orderFromRow(await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first()) });
  }

  if (orderMatch && request.method === "DELETE") {
    await assertOrdersOpen(db);
    await db.prepare("DELETE FROM orders WHERE id = ?").bind(decodeURIComponent(orderMatch[1])).run();
    return json({ ok: true });
  }

  if (path === "/api/orders" && request.method === "DELETE") {
    if (!isAdmin(request, env)) return json({ error: "관리자 인증이 필요합니다." }, 401);
    await assertOrdersOpen(db);
    await db.prepare("DELETE FROM orders").run();
    return json({ ok: true });
  }

  if (path === "/api/config" && request.method === "PATCH") {
    const body = await request.json();
    const adminOnly = Object.hasOwn(body, "users") || Object.hasOwn(body, "orders_closed");
    if (adminOnly && !isAdmin(request, env)) return json({ error: "관리자 인증이 필요합니다." }, 401);
    const current = await getConfig(db);
    const users = Object.hasOwn(body, "users") && Array.isArray(body.users) ? body.users : current.users;
    const options = Object.hasOwn(body, "options") && Array.isArray(body.options) ? body.options : current.options;
    const ordersClosed = Object.hasOwn(body, "orders_closed") ? Boolean(body.orders_closed) : current.orders_closed;
    const now = new Date().toISOString();
    await db.prepare("UPDATE config SET users = ?, options = ?, orders_closed = ?, updated_at = ? WHERE id = 1")
      .bind(JSON.stringify(users), JSON.stringify(options), ordersClosed ? 1 : 0, now).run();
    return json({ config: await getConfig(db) });
  }

  if (path === "/api/drinks" && request.method === "PUT") {
    if (!isAdmin(request, env)) return json({ error: "관리자 인증이 필요합니다." }, 401);
    const body = await request.json();
    const drinks = Array.isArray(body.drinks) ? body.drinks : [];
    // 행사 연결 정보는 관리자 화면이 다루지 않으므로 같은 이름의 음료에서 이어 받는다.
    // 유료 옵션은 보내 온 값이 있으면 그것을, 없으면(예전 화면) 같은 이름의 기존 값을 쓴다.
    const { results: kept = [] } = await db.prepare("SELECT name, source_event_id, extras FROM drinks").all();
    const keptByName = new Map(kept.map((row) => [row.name, row]));
    const statements = [db.prepare("DELETE FROM drinks")];
    drinks.forEach((drink, index) => {
      statements.push(db.prepare(`INSERT INTO drinks
        (category, name, tall_price, grande_price, ice_only, hot_only, sort_order, source_event_id, extras)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          String(drink.category || "others"),
          String(drink.name || ""),
          Number(drink.tall_price) || 0,
          Number(drink.grande_price) || 0,
          drink.ice_only ? 1 : 0,
          drink.hot_only && !drink.ice_only ? 1 : 0,
          index,
          keptByName.get(String(drink.name || ""))?.source_event_id ?? null,
          Array.isArray(drink.extras) ? JSON.stringify(cleanExtras(drink.extras)) : keptByName.get(String(drink.name || ""))?.extras ?? "[]",
        ));
    });
    await db.batch(statements);
    return json({ drinks: await getDrinks(db) });
  }

  if (path === "/api/admin/season-sync" && (request.method === "GET" || request.method === "POST")) {
    if (!isAdmin(request, env)) return json({ error: "관리자 인증이 필요합니다." }, 401);
    if (request.method === "GET") return json({ last: await getLastSeasonSync(db) });
    if (!env.AI) return json({ error: "Workers AI 바인딩(AI)이 연결되지 않았습니다." }, 503);
    return json({ last: await syncSeasonMenus(env, "manual") });
  }

  return json({ error: "요청한 API를 찾을 수 없습니다." }, 404);
}

export async function onRequest({ request, env }) {
  try {
    return await handleApi(request, env, new URL(request.url));
  } catch (error) {
    console.error("[api]", error);
    return json({ error: error.message || "서버 오류가 발생했습니다." }, error.status || 500);
  }
}
