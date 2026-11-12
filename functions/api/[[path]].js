import { getLastSeasonSync, syncSeasonMenus } from "../../lib/season-sync.js";
import { clearCookies, devLoginAllowed, entraConfigured, finishLogin, LoginError, readSession, redirect, safeReturn, sessionCookies, startLogin } from "../../lib/auth.js";
import { nudgeCard, postToChannel, sendDirect, startCard, statusCard, teamsStatus } from "../../lib/teams.js";

// 같은 사람에게 독촉을 다시 보낼 수 있을 때까지 기다리는 시간
const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function isUniqueError(error) {
  return /UNIQUE constraint failed/i.test(String(error?.message || ""));
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
    options: parseJsonArray(row?.options),
    orders_closed: Boolean(row?.orders_closed),
    round_started_at: row?.round_started_at ?? null,
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
  if (config.orders_closed) throw fail(409, "주문이 마감되었습니다.");
}

function cleanOrder(body) {
  const size = String(body.size || "");
  const temp = String(body.temp || "ICE");
  if (!["Tall", "Grande"].includes(size)) throw fail(400, "사이즈를 선택해주세요.");
  if (!["ICE", "HOT"].includes(temp)) throw fail(400, "온도를 선택해주세요.");
  const menuName = String(body.menu_name || "").trim().slice(0, 60);
  if (!menuName) throw fail(400, "메뉴를 선택해주세요.");
  return {
    menu_name: menuName,
    category: String(body.category || "others"),
    size,
    temp,
    options: JSON.stringify(Array.isArray(body.options) ? body.options.map(String).slice(0, 20) : []),
    note: String(body.note || "").slice(0, 200),
    unit_price: Math.max(0, Math.round(Number(body.unit_price) || 0)),
  };
}

// ── 팀원 · 로그인 ───────────────────────────────────────────

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, `이메일 형식이 아닙니다: ${email}`);
  return email;
}
async function getMembers(db) {
  const { results = [] } = await db.prepare("SELECT * FROM members").all();
  return results.sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
}
function publicMember(m) {
  return { id: m.id, name: m.name };
}

// 세션 쿠키의 팀원이 지금도 같은 Entra 계정에 연결되어 있을 때만 로그인한 것으로 본다.
// (관리자가 연결을 끊거나 명단에서 빼면 바로 로그아웃된다)
async function sessionMember(request, env, db, url) {
  const session = await readSession(request, env);
  if (!session?.mid) return null;
  const member = await db.prepare("SELECT id, name, email, oid FROM members WHERE id = ?").bind(session.mid).first();
  if (!member) return null;
  if (session.dev) return devLoginAllowed(env, url) ? member : null;
  return member.oid && member.oid === session.oid ? member : null;
}

// 이름으로 처음 연결하는 것은 TEAM_DEPARTMENTS(쉼표로 구분)에 적힌 부서 사람만 허용한다. 비어 있으면 부서를 보지 않는다.
function nameMatchAllowed(env, profile) {
  const allowed = String(env.TEAM_DEPARTMENTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return !allowed.length || allowed.includes(String(profile.department || "").trim());
}
// Entra 계정을 명단의 팀원과 연결한다. 순서: 이미 연결된 계정(oid) → 이메일 → 이름(이메일이 비어 있는 팀원만)
async function linkMember(db, env, profile) {
  let member = await db.prepare("SELECT * FROM members WHERE oid = ?").bind(profile.oid).first();
  if (!member) {
    for (const email of [...new Set([profile.email, profile.upn].filter(Boolean))]) {
      member = await db.prepare("SELECT * FROM members WHERE email = ?").bind(email).first();
      if (member) break;
    }
    if (member?.oid) throw new LoginError("taken", profile.email || profile.upn);
  }
  if (!member && nameMatchAllowed(env, profile)) {
    const names = [...new Set([profile.name.replace(/\s+/g, ""), ...(profile.name.match(/[가-힣]{2,}/g) || [])].filter(Boolean))];
    if (names.length) {
      const { results = [] } = await db.prepare(`SELECT * FROM members WHERE oid IS NULL AND email IS NULL AND name IN (${names.map(() => "?").join(", ")})`).bind(...names).all();
      if (results.length === 1) member = results[0];
    }
  }
  if (!member) throw new LoginError("not_member", profile.email || profile.upn);

  const now = new Date().toISOString();
  const email = member.email || profile.email || profile.upn || null;
  try {
    await db.prepare("UPDATE members SET oid = ?, email = ?, last_login_at = ? WHERE id = ?").bind(profile.oid, email, now, member.id).run();
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    // 이 이메일을 다른 팀원이 쓰고 있으면 이메일은 그대로 두고 계정만 연결한다.
    await db.prepare("UPDATE members SET oid = ?, last_login_at = ? WHERE id = ?").bind(profile.oid, now, member.id).run();
  }
  return member;
}

async function handleAuth(request, env, url, db) {
  const path = url.pathname;
  if (path === "/api/auth/config" && request.method === "GET") {
    const dev = devLoginAllowed(env, url);
    return json({ entra: entraConfigured(env), dev: dev ? (await getMembers(db)).map(publicMember) : null });
  }
  if (path === "/api/auth/login" && request.method === "GET") {
    if (!entraConfigured(env)) return redirect("/?login_error=config");
    return startLogin(env, url);
  }
  if (path === "/api/auth/callback" && request.method === "GET") {
    try {
      const { profile, returnTo } = await finishLogin(request, env, url);
      const member = await linkMember(db, env, profile);
      return redirect(returnTo, await sessionCookies(env, url, { mid: member.id, oid: profile.oid }));
    } catch (error) {
      console.error("[auth]", error.code || "", error.detail || error.message);
      const query = new URLSearchParams({ login_error: error instanceof LoginError ? error.code : "failed" });
      if (error.code === "not_member" || error.code === "taken") query.set("account", error.detail);
      return redirect(`/?${query}`, clearCookies(url));
    }
  }
  if (path === "/api/auth/dev" && request.method === "GET") {
    if (!devLoginAllowed(env, url)) return json({ error: "요청한 API를 찾을 수 없습니다." }, 404);
    const member = await db.prepare("SELECT id FROM members WHERE id = ?").bind(Number(url.searchParams.get("member"))).first();
    if (!member) return json({ error: "팀원을 찾을 수 없습니다." }, 404);
    return redirect(safeReturn(url.searchParams.get("return")), await sessionCookies(env, url, { mid: member.id, dev: true }));
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    const response = json({ ok: true });
    clearCookies(url).forEach((c) => response.headers.append("set-cookie", c));
    return response;
  }
  return null;
}

// ── 주문 차수 · 팀즈 ────────────────────────────────────────

async function roundSummary(db) {
  const [config, orders, members] = await Promise.all([getConfig(db), getOrders(db), getMembers(db)]);
  const ordered = new Set(orders.map((o) => o.member_id).filter((id) => id != null));
  return { config, orders, members, pending: members.filter((m) => !ordered.has(m.id)) };
}
function appUrl(env, url) {
  return env.APP_URL || `${url.origin}/`;
}
// 팀즈 전송이 실패해도 주문 마감·개시는 그대로 두고 결과만 알려 준다.
async function notifyChannel(env, payload) {
  try {
    await postToChannel(env, payload);
    return { sent: true };
  } catch (error) {
    console.error("[teams]", error.message);
    return { sent: false, error: error.message };
  }
}

async function handleAdmin(request, env, url, db) {
  const path = url.pathname;

  if (path === "/api/admin/members" && request.method === "GET") {
    const { config, orders, members } = await roundSummary(db);
    const byMember = new Map(orders.filter((o) => o.member_id != null).map((o) => [o.member_id, o]));
    return json({
      members: members.map((m) => {
        const o = byMember.get(m.id);
        return {
          id: m.id, name: m.name, email: m.email, linked: Boolean(m.oid), last_login_at: m.last_login_at, last_nudged_at: m.last_nudged_at,
          order: o ? { menu_name: o.menu_name, temp: o.temp, size: o.size, options: o.options, unit_price: o.unit_price, updated_at: o.updated_at } : null,
        };
      }),
      config,
      teams: teamsStatus(env),
    });
  }

  if (path === "/api/admin/members" && request.method === "POST") {
    const body = await request.json();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const result = { added: [], updated: [], skipped: [] };
    for (const entry of entries) {
      const name = String(entry?.name || "").trim().slice(0, 30);
      if (!name) continue;
      const email = cleanEmail(entry?.email);
      const existing = await db.prepare("SELECT * FROM members WHERE name = ?").bind(name).first();
      try {
        if (!existing) {
          await db.prepare("INSERT INTO members (name, email, created_at) VALUES (?, ?, ?)").bind(name, email, new Date().toISOString()).run();
          result.added.push(name);
        } else if (email && existing.email !== email) {
          await db.prepare("UPDATE members SET email = ? WHERE id = ?").bind(email, existing.id).run();
          result.updated.push(name);
        } else {
          result.skipped.push({ name, reason: "이미 명단에 있음" });
        }
      } catch (error) {
        if (!isUniqueError(error)) throw error;
        result.skipped.push({ name, reason: `${email}은(는) 다른 팀원이 쓰는 이메일` });
      }
    }
    return json(result);
  }

  const memberMatch = path.match(/^\/api\/admin\/members\/(\d+)$/);
  if (memberMatch && request.method === "PATCH") {
    const id = Number(memberMatch[1]);
    const member = await db.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
    if (!member) return json({ error: "팀원을 찾을 수 없습니다." }, 404);
    const body = await request.json();
    const name = Object.hasOwn(body, "name") ? String(body.name || "").trim().slice(0, 30) : member.name;
    if (!name) return json({ error: "이름을 입력하세요." }, 400);
    const email = Object.hasOwn(body, "email") ? cleanEmail(body.email) : member.email;
    // 이메일을 바꾸거나 연결 해제를 누르면 Entra 계정 연결을 끊는다. 다음 로그인 때 새 이메일로 다시 연결된다.
    const unlink = body.unlink === true || (Object.hasOwn(body, "email") && email !== member.email);
    try {
      await db.batch([
        db.prepare("UPDATE members SET name = ?, email = ?, oid = ? WHERE id = ?").bind(name, email, unlink ? null : member.oid, id),
        db.prepare("UPDATE orders SET requester = ? WHERE member_id = ?").bind(name, id),
      ]);
    } catch (error) {
      if (isUniqueError(error)) return json({ error: "같은 이름이나 이메일을 쓰는 팀원이 이미 있습니다." }, 409);
      throw error;
    }
    return json({ ok: true });
  }
  if (memberMatch && request.method === "DELETE") {
    await db.prepare("DELETE FROM members WHERE id = ?").bind(Number(memberMatch[1])).run();
    return json({ ok: true });
  }

  // 주문 차수: start = 지금 주문을 내역으로 옮기고 새로 받기, close = 마감, reopen = 마감 취소
  if (path === "/api/admin/round" && request.method === "POST") {
    const body = await request.json();
    const now = new Date().toISOString();
    if (body.action === "start") {
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO order_history
          (id, round_started_at, archived_at, member_id, requester, menu_name, category, size, temp, options, note, unit_price, created_at, updated_at)
          SELECT id, COALESCE((SELECT round_started_at FROM config WHERE id = 1), created_at), ?, member_id, requester, menu_name, category, size, temp, options, note, unit_price, created_at, updated_at
          FROM orders`).bind(now),
        db.prepare("DELETE FROM orders"),
        db.prepare("UPDATE config SET orders_closed = 0, round_started_at = ?, updated_at = ? WHERE id = 1").bind(now, now),
      ]);
    } else if (body.action === "close" || body.action === "reopen") {
      await db.prepare("UPDATE config SET orders_closed = ?, updated_at = ? WHERE id = 1").bind(body.action === "close" ? 1 : 0, now).run();
    } else {
      return json({ error: "알 수 없는 동작입니다." }, 400);
    }
    const summary = await roundSummary(db);
    let teams = null;
    if (body.notify) {
      const note = String(body.note || "").trim().slice(0, 300);
      const startedAt = summary.config.round_started_at;
      teams = await notifyChannel(env, body.action === "start"
        ? startCard({ appUrl: appUrl(env, url), note, startedAt })
        : statusCard({ appUrl: appUrl(env, url), ...summary, closed: summary.config.orders_closed, note, startedAt }));
    }
    return json({ config: summary.config, teams });
  }

  if (path === "/api/admin/teams/status" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const summary = await roundSummary(db);
    const teams = await notifyChannel(env, statusCard({
      appUrl: appUrl(env, url), ...summary, closed: summary.config.orders_closed,
      note: String(body.note || "").trim().slice(0, 300), startedAt: summary.config.round_started_at,
    }));
    return teams.sent ? json({ teams }) : json({ error: teams.error, teams }, 502);
  }

  // 미주문자 독촉: member_ids가 없으면 아직 주문하지 않은 사람 모두에게 보낸다.
  if (path === "/api/admin/nudge" && request.method === "POST") {
    if (!teamsStatus(env).dm) return json({ error: "팀즈 개인 알림 주소(TEAMS_DM_WEBHOOK_URL)가 설정되지 않았습니다." }, 503);
    const body = await request.json().catch(() => ({}));
    const { config, pending, members } = await roundSummary(db);
    if (config.orders_closed) return json({ error: "주문이 마감되어 독촉할 수 없습니다." }, 409);
    const ids = Array.isArray(body.member_ids) && body.member_ids.length ? new Set(body.member_ids.map(Number)) : null;
    const pendingIds = new Set(pending.map((m) => m.id));
    const result = { sent: [], skipped: [], failed: [] };
    if (ids) members.filter((m) => ids.has(m.id) && !pendingIds.has(m.id)).forEach((m) => result.skipped.push({ name: m.name, reason: "이미 주문함" }));
    for (const m of ids ? pending.filter((p) => ids.has(p.id)) : pending) {
      if (!m.email) { result.skipped.push({ name: m.name, reason: "이메일 없음" }); continue; }
      if (m.last_nudged_at && Date.now() - Date.parse(m.last_nudged_at) < NUDGE_COOLDOWN_MS) { result.skipped.push({ name: m.name, reason: "10분 안에 이미 보냄" }); continue; }
      try {
        await sendDirect(env, m.email, nudgeCard({ appUrl: appUrl(env, url), name: m.name, startedAt: config.round_started_at }));
        await db.prepare("UPDATE members SET last_nudged_at = ? WHERE id = ?").bind(new Date().toISOString(), m.id).run();
        result.sent.push(m.name);
      } catch (error) {
        result.failed.push({ name: m.name, error: error.message });
      }
    }
    return json(result);
  }

  if (path === "/api/config" && request.method === "PATCH") {
    const body = await request.json();
    const current = await getConfig(db);
    const options = Array.isArray(body.options) ? body.options.map(String) : current.options;
    await db.prepare("UPDATE config SET options = ?, updated_at = ? WHERE id = 1").bind(JSON.stringify(options), new Date().toISOString()).run();
    return json({ config: await getConfig(db) });
  }

  if (path === "/api/drinks" && request.method === "PUT") {
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
    if (request.method === "GET") return json({ last: await getLastSeasonSync(db) });
    if (!env.AI) return json({ error: "Workers AI 바인딩(AI)이 연결되지 않았습니다." }, 503);
    return json({ last: await syncSeasonMenus(env, "manual") });
  }

  return null;
}

async function handleApi(request, env, url) {
  if (!env.DB) return json({ error: "D1 데이터베이스(DB 바인딩)가 연결되지 않았습니다." }, 503);
  await ensureDatabase(env.DB);
  const db = env.DB;
  const path = url.pathname;

  if (path.startsWith("/api/auth/")) return (await handleAuth(request, env, url, db)) || json({ error: "요청한 API를 찾을 수 없습니다." }, 404);
  if (path === "/api/admin/auth" && request.method === "POST") {
    return isAdmin(request, env) ? json({ ok: true }) : json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }

  const admin = isAdmin(request, env);
  const isAdminRoute = path.startsWith("/api/admin/") || (path === "/api/config" && request.method === "PATCH") || (path === "/api/drinks" && request.method === "PUT");
  if (isAdminRoute) {
    if (!admin) return json({ error: "관리자 인증이 필요합니다." }, 401);
    return (await handleAdmin(request, env, url, db)) || json({ error: "요청한 API를 찾을 수 없습니다." }, 404);
  }

  // 여기부터는 MS 계정으로 로그인한 팀원(또는 관리자)만 쓴다.
  const me = await sessionMember(request, env, db, url);
  if (!me && !admin) return json({ error: "로그인이 필요합니다.", login: true }, 401);

  if (path === "/api/me" && request.method === "GET") {
    if (!me) return json({ error: "로그인이 필요합니다.", login: true }, 401);
    return json({ member: { id: me.id, name: me.name, email: me.email } });
  }

  if (path === "/api/me/history" && request.method === "GET") {
    if (!me) return json({ error: "로그인이 필요합니다.", login: true }, 401);
    const { results = [] } = await db.prepare("SELECT * FROM order_history WHERE member_id = ? ORDER BY round_started_at DESC, created_at DESC LIMIT 20").bind(me.id).all();
    return json({ history: results.map(orderFromRow) });
  }

  if (path === "/api/state" && request.method === "GET") {
    const [config, drinks, orders, members] = await Promise.all([getConfig(db), getDrinks(db), getOrders(db), getMembers(db)]);
    return json({ config, drinks, orders, members: members.map(publicMember), me: me ? { id: me.id, name: me.name, email: me.email } : null });
  }

  if (path === "/api/orders" && request.method === "GET") return json({ orders: await getOrders(db) });
  if (path === "/api/config" && request.method === "GET") {
    const [config, drinks, members] = await Promise.all([getConfig(db), getDrinks(db), getMembers(db)]);
    return json({ config, drinks, members: members.map(publicMember) });
  }

  // 주문은 로그인한 본인 이름으로만 넣는다. 1인 1주문.
  if (path === "/api/orders" && request.method === "POST") {
    if (!me) return json({ error: "주문은 MS 계정으로 로그인해서 할 수 있습니다." }, 403);
    await assertOrdersOpen(db);
    const order = cleanOrder(await request.json());
    const existing = await db.prepare("SELECT id FROM orders WHERE member_id = ? LIMIT 1").bind(me.id).first();
    if (existing) return json({ error: "이미 주문했습니다. 내 주문에서 바꿔 주세요." }, 409);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.prepare(`INSERT INTO orders
        (id, menu_name, category, requester, member_id, size, temp, options, note, unit_price, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, order.menu_name, order.category, me.name, me.id, order.size, order.temp, order.options, order.note, order.unit_price, now, now)
        .run();
    } catch (error) {
      if (isUniqueError(error)) return json({ error: "이미 주문했습니다. 내 주문에서 바꿔 주세요." }, 409);
      throw error;
    }
    return json({ order: orderFromRow(await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first()) }, 201);
  }

  // 수정·삭제는 본인 주문만 (관리자는 모두)
  const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && (request.method === "PUT" || request.method === "DELETE")) {
    await assertOrdersOpen(db);
    const id = decodeURIComponent(orderMatch[1]);
    const current = await db.prepare("SELECT id, member_id FROM orders WHERE id = ?").bind(id).first();
    if (!current) return json({ error: "주문을 찾을 수 없습니다." }, 404);
    if (!admin && current.member_id !== me.id) return json({ error: "본인 주문만 바꿀 수 있습니다." }, 403);
    if (request.method === "DELETE") {
      await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    const order = cleanOrder(await request.json());
    await db.prepare(`UPDATE orders SET
      menu_name = ?, category = ?, size = ?, temp = ?, options = ?, note = ?, unit_price = ?, updated_at = ?
      WHERE id = ?`)
      .bind(order.menu_name, order.category, order.size, order.temp, order.options, order.note, order.unit_price, new Date().toISOString(), id)
      .run();
    return json({ order: orderFromRow(await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first()) });
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
