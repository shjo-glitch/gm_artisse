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

function drinkFromRow(row) {
  return { ...row, ice_only: Boolean(row.ice_only) };
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
      VALUES (1, '[]', '["연하게","덜달게","디카페인","더달게","두유","오트밀크"]', 0)`),
  ]);
}

function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return true;
  return request.headers.get("x-admin-password") === env.ADMIN_PASSWORD;
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
  if (!env.DB) return json({ error: "Sites D1 데이터베이스가 연결되지 않았습니다." }, 503);
  await ensureDatabase(env.DB);
  const db = env.DB;
  const path = url.pathname;

  if (path === "/api/admin/auth" && request.method === "POST") {
    return isAdmin(request, env) ? json({ ok: true }) : json({ error: "비밀번호가 올바르지 않습니다." }, 401);
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
    const statements = [db.prepare("DELETE FROM drinks")];
    drinks.forEach((drink, index) => {
      statements.push(db.prepare(`INSERT INTO drinks
        (category, name, tall_price, grande_price, ice_only, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(
          String(drink.category || "others"),
          String(drink.name || ""),
          Number(drink.tall_price) || 0,
          Number(drink.grande_price) || 0,
          drink.ice_only ? 1 : 0,
          index,
        ));
    });
    await db.batch(statements);
    return json({ drinks: await getDrinks(db) });
  }

  return json({ error: "요청한 API를 찾을 수 없습니다." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname === "/") {
        url.pathname = "/index.html";
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("[worker]", error);
      return json({ error: error.message || "서버 오류가 발생했습니다." }, error.status || 500);
    }
  },
};
