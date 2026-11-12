// 사내 쿠버네티스(도커)용 Node 서버. Cloudflare Pages가 하던 일을 한 프로세스에서 한다.
// - /api/*      → functions/api/[[path]].js 의 onRequest를 그대로 호출 (env.DB = SQLite 어댑터, env.AI = AI 어댑터)
// - 그 밖       → src/frontend 정적 파일 (Pages처럼 /admin → admin.html, _redirects 적용)
// - /healthz    → 쿠버네티스 상태 확인
// - 매달 1일 09:00(KST) 이후 첫 확인 때 새메뉴 자동 반영 (Cron Worker 대신)
// SQLite 파일 하나를 쓰므로 파드는 하나만 띄운다.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onRequest } from "../functions/api/[[path]].js";
import { syncSeasonMenus } from "../lib/season-sync.js";
import { openD1 } from "./d1.mjs";
import { applyMigrations } from "./migrate.mjs";
import { createAI } from "./ai.mjs";
import { importD1Export } from "./import-d1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_DIR = path.join(ROOT, "src/frontend");
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const MAX_BODY = 1024 * 1024;
const log = (...args) => console.log(new Date().toISOString(), ...args);

// ── 준비: DB · 마이그레이션 · AI · 환경 값 ─────────────────────────

mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, "attije.db");

// 데이터 옮기기: $DATA_DIR/import.sql (wrangler d1 export 결과)이 있으면 지금 DB를 .bak-<시각>으로 치우고 그것을 넣는다.
// 실패하면 원래 DB를 되돌려 놓고 import.sql 은 .failed-<시각>으로 이름을 바꾼다.
const IMPORT_FILE = path.join(DATA_DIR, "import.sql");
if (existsSync(IMPORT_FILE)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parts = ["", "-wal", "-shm"].filter((s) => existsSync(DB_FILE + s));
  parts.forEach((s) => renameSync(DB_FILE + s, `${DB_FILE}.bak-${stamp}${s}`));
  try {
    const r = importD1Export(IMPORT_FILE, DB_FILE);
    renameSync(IMPORT_FILE, `${IMPORT_FILE}.done-${stamp}`);
    log(`[import] import.sql을 넣었습니다: members ${r.members} · drinks ${r.drinks} · orders ${r.orders} · 마이그레이션 ${r.applied.length}개 기록${parts.length ? ` · 이전 DB는 attije.db.bak-${stamp}` : ""}`);
  } catch (error) {
    ["", "-wal", "-shm"].forEach((s) => rmSync(DB_FILE + s, { force: true }));
    parts.forEach((s) => renameSync(`${DB_FILE}.bak-${stamp}${s}`, DB_FILE + s));
    renameSync(IMPORT_FILE, `${IMPORT_FILE}.failed-${stamp}`);
    log(`[import] 실패, 원래 DB로 계속합니다: ${error.message}`);
  }
}

const DB = openD1(DB_FILE);
applyMigrations(DB.sqlite, path.join(ROOT, "migrations"), (m) => log(m));

const env = { ...process.env, DB, AI: createAI(process.env) };
const publicUrl = env.PUBLIC_URL ? new URL(env.PUBLIC_URL) : null;
// 개발용 로그인은 localhost에서만 열린다. 실제 주소(PUBLIC_URL)로 운영할 때는 켜 두었더라도 끈다.
if (env.DEV_LOGIN === "1" && publicUrl && !["localhost", "127.0.0.1"].includes(publicUrl.hostname)) {
  delete env.DEV_LOGIN;
  log("[warn] PUBLIC_URL이 localhost가 아니어서 DEV_LOGIN을 껐습니다.");
}

// ── 정적 파일 ─────────────────────────────────────────────

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
};
// _redirects: "출발 도착 [상태]" 한 줄씩. 출발이 /경로/* 이면 그 아래 전부.
const REDIRECTS = (() => {
  try {
    return readFileSync(path.join(STATIC_DIR, "_redirects"), "utf8").split(/\r?\n/)
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => { const [from, to, status] = l.split(/\s+/); return { from, to, status: Number(status) || 302 }; });
  } catch {
    return [];
  }
})();
function findRedirect(pathname) {
  return REDIRECTS.find((r) => (r.from.endsWith("/*") ? pathname.startsWith(r.from.slice(0, -1)) : pathname === r.from));
}
function isFile(file) {
  try { return statSync(file).isFile(); } catch { return false; }
}
function isDir(file) {
  try { return statSync(file).isDirectory(); } catch { return false; }
}
// Pages와 같은 주소 규칙: /a/ → a/index.html, /admin → admin.html, /admin.html → /admin 으로 이동
function resolveStatic(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return { status: 400 }; }
  const file = path.normalize(path.join(STATIC_DIR, decoded));
  if (!(file === STATIC_DIR || file.startsWith(STATIC_DIR + path.sep)) || path.basename(file).startsWith("_")) return { status: 404 };
  if (decoded.endsWith(".html")) return { redirect: decoded.replace(/(index)?\.html$/, "") || "/" };
  if (decoded.endsWith("/")) return isFile(path.join(file, "index.html")) ? { file: path.join(file, "index.html") } : { status: 404 };
  if (isFile(file)) return { file };
  if (isFile(`${file}.html`)) return { file: `${file}.html` };
  if (isDir(file) && isFile(path.join(file, "index.html"))) return { redirect: `${decoded}/` };
  return { status: 404 };
}
async function serveStatic(req, res, url) {
  const redirect = findRedirect(url.pathname);
  if (redirect) return send(res, redirect.status, { location: redirect.to });
  const found = resolveStatic(url.pathname);
  if (found.redirect) return send(res, 308, { location: found.redirect + url.search });
  if (!found.file) return send(res, found.status || 404, { "content-type": "text/plain; charset=utf-8" }, "Not found");
  const stat = statSync(found.file);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    "content-type": TYPES[path.extname(found.file)] || "application/octet-stream",
    "cache-control": "public, max-age=0, must-revalidate",
    "x-content-type-options": "nosniff",
    etag,
  };
  if (req.headers["if-none-match"] === etag) return send(res, 304, headers);
  return send(res, 200, headers, req.method === "HEAD" ? null : await readFile(found.file));
}
function send(res, status, headers = {}, body = null) {
  res.writeHead(status, headers);
  res.end(body);
}

// ── API: Node 요청 ↔ 웹 표준 Request/Response ────────────────────

// 인그레스 뒤에서는 PUBLIC_URL을 기준 주소로 쓴다. (MS 로그인 돌아올 주소, Secure 쿠키, 팀즈 카드 링크가 여기서 정해진다)
function requestUrl(req) {
  if (!String(req.url).startsWith("/")) throw Object.assign(new Error("잘못된 요청 주소입니다."), { status: 400 });
  if (publicUrl) return new URL(req.url, publicUrl.origin);
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  return new URL(req.url, `${proto}://${req.headers.host || `localhost:${PORT}`}`);
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("요청 본문이 너무 큽니다."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
// 연결에만 의미가 있는 헤더는 Request로 넘기지 않는다.
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "expect", "http2-settings"]);
async function serveApi(req, res, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.startsWith(":") || HOP_BY_HOP.has(k)) continue;
    headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const request = new Request(url, { method: req.method, headers, body: hasBody ? await readBody(req) : undefined });
  const response = await onRequest({ request, env });
  const out = {};
  response.headers.forEach((v, k) => { if (k !== "set-cookie") out[k] = v; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out["set-cookie"] = cookies;
  const body = req.method === "HEAD" || !response.body ? null : Buffer.from(await response.arrayBuffer());
  send(res, response.status, out, body);
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  let url;
  try {
    url = requestUrl(req);
    if (url.pathname === "/healthz") {
      DB.sqlite.prepare("SELECT 1").get();
      return send(res, 200, { "content-type": "text/plain" }, "ok");
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) await serveApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    log("[error]", req.method, req.url, error.message);
    if (!res.headersSent) send(res, error.status || 500, { "content-type": "application/json; charset=utf-8" }, JSON.stringify({ error: error.status ? error.message : "서버 오류가 발생했습니다." }));
  } finally {
    if (url?.pathname !== "/healthz") log(req.method, url?.pathname || req.url, res.statusCode, `${Date.now() - started}ms`);
  }
});

// ── 새메뉴 자동 반영 (매달 1일 09:00 KST 이후) ───────────────────

// 10분마다 확인하고, 이번 달에 자동 실행 기록이 없으면 돌린다. 1일에 파드가 다시 떠도 한 번만 돈다.
const kstMonth = (date) => new Date(date.getTime() + 9 * 3600e3).toISOString().slice(0, 7);
let seasonRunning = false;
async function seasonTick() {
  if (process.env.SEASON_CRON === "0" || !env.AI || seasonRunning) return;
  const kst = new Date(Date.now() + 9 * 3600e3);
  if (kst.getUTCDate() !== 1 || kst.getUTCHours() < 9) return;
  const last = DB.sqlite.prepare("SELECT ran_at, trigger FROM season_sync WHERE id = 1").get();
  const month = kstMonth(new Date());
  const doneThisMonth = (row) => row && row.trigger === "cron" && kstMonth(new Date(row.ran_at)) === month;
  if (doneThisMonth(last)) return;
  seasonRunning = true;
  try {
    const { report } = await syncSeasonMenus(env, "cron");
    log("[season-sync]", JSON.stringify(report));
  } catch (error) {
    // 새메뉴 API가 응답하지 않는 등으로 실패하면 기록을 남겨 그날 다시 돌지 않게 한다. (Cron Worker도 다시 돌지 않았다)
    DB.sqlite.prepare(`INSERT INTO season_sync (id, ran_at, trigger, report) VALUES (1, ?, 'cron', ?)
      ON CONFLICT(id) DO UPDATE SET ran_at = excluded.ran_at, trigger = excluded.trigger, report = excluded.report`)
      .run(new Date().toISOString(), JSON.stringify({ checked: [], added: [], linked: [], removed: [], failed: [{ title: "자동 실행", error: error.message }] }));
    log("[season-sync] 실패:", error.message);
  } finally {
    seasonRunning = false;
  }
}
const seasonTimer = setInterval(() => { seasonTick().catch((e) => log("[season-sync]", e.message)); }, 10 * 60 * 1000);

// ── 시작 · 종료 ──────────────────────────────────────────

server.listen(PORT, "0.0.0.0", () => {
  log(`listening on :${PORT} · data ${DATA_DIR} · public ${publicUrl?.origin || "(요청 주소)"}`);
  log(`MS 로그인 ${env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && env.SESSION_SECRET ? "켜짐" : "꺼짐(설정 없음)"} · 팀즈 채널 ${env.TEAMS_CHANNEL_WEBHOOK_URL ? "켜짐" : "꺼짐"} · 팀즈 독촉 ${env.TEAMS_DM_WEBHOOK_URL ? "켜짐" : "꺼짐"} · AI ${env.AI?.provider || "없음"}${env.DEV_LOGIN === "1" ? " · DEV_LOGIN" : ""}`);
});
function shutdown(signal) {
  log(`${signal} 받음, 종료합니다.`);
  clearInterval(seasonTimer);
  server.close(() => {
    DB.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
