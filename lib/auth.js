// Microsoft Entra ID 로그인(OIDC 인가 코드 + PKCE)과 세션 쿠키.
// 필요한 Pages 시크릿: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, SESSION_SECRET
const enc = new TextEncoder();
const dec = new TextDecoder();
const SESSION_COOKIE = "attije_session";
const LOGIN_COOKIE = "attije_login";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_SECONDS = 10 * 60;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LoginError extends Error {
  constructor(code, detail = "") {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

function b64url(bytes) {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(text) {
  const s = atob(String(text).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function randomToken(size = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(size)));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
// 서버만 아는 SESSION_SECRET으로 서명한 "본문.서명" 토큰. 본문에 exp(초)를 넣어 만료를 확인한다.
async function signToken(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}
async function verifyToken(token, secret) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !secret) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return "";
}
// http://localhost 에서도 쿠키가 붙도록 https일 때만 Secure를 단다.
function cookie(url, name, value, maxAge) {
  return [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`, url.protocol === "https:" ? "Secure" : ""].filter(Boolean).join("; ");
}
function redirect(location, cookies = []) {
  const headers = new Headers({ location, "cache-control": "no-store" });
  cookies.forEach((c) => headers.append("set-cookie", c));
  return new Response(null, { status: 302, headers });
}
// 로그인 뒤 돌아갈 주소는 같은 사이트 안의 경로만 받는다.
export function safeReturn(value) {
  const path = String(value || "/");
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export function entraConfigured(env) {
  return Boolean(env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && env.SESSION_SECRET);
}
// 로컬 개발에서만(.dev.vars의 DEV_LOGIN=1 + localhost 접속) MS 로그인 없이 팀원을 골라 들어갈 수 있다.
export function devLoginAllowed(env, url) {
  return env.DEV_LOGIN === "1" && Boolean(env.SESSION_SECRET) && ["localhost", "127.0.0.1"].includes(url.hostname);
}
function redirectUri(url) {
  return `${url.origin}/api/auth/callback`;
}
function authority(env) {
  return `https://login.microsoftonline.com/${encodeURIComponent(env.ENTRA_TENANT_ID)}/oauth2/v2.0`;
}

export async function startLogin(env, url) {
  const verifier = randomToken(32);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
  const tx = { state: randomToken(16), nonce: randomToken(16), verifier, returnTo: safeReturn(url.searchParams.get("return")), exp: Math.floor(Date.now() / 1000) + LOGIN_SECONDS };
  const target = new URL(`${authority(env)}/authorize`);
  target.search = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    response_type: "code",
    response_mode: "query",
    redirect_uri: redirectUri(url),
    scope: "openid profile email User.Read",
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return redirect(target.toString(), [cookie(url, LOGIN_COOKIE, await signToken(tx, env.SESSION_SECRET), LOGIN_SECONDS)]);
}

// 인가 코드를 토큰으로 바꾸고 로그인한 사람의 계정 정보를 돌려준다.
// ID 토큰은 TLS로 토큰 엔드포인트에서 직접 받으므로 서명 대신 aud·iss·tid·nonce·exp를 확인한다(OIDC Core 3.1.3.7).
export async function finishLogin(request, env, url) {
  const tx = await verifyToken(readCookie(request, LOGIN_COOKIE), env.SESSION_SECRET);
  if (url.searchParams.get("error")) throw new LoginError("denied", url.searchParams.get("error_description") || url.searchParams.get("error"));
  if (!tx || url.searchParams.get("state") !== tx.state) throw new LoginError("expired");
  const code = url.searchParams.get("code");
  if (!code) throw new LoginError("failed", "인가 코드가 없습니다.");

  const response = await fetch(`${authority(env)}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.ENTRA_CLIENT_ID,
      client_secret: env.ENTRA_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(url),
      code_verifier: tx.verifier,
      scope: "openid profile email User.Read",
    }),
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.id_token) throw new LoginError("failed", token.error_description || `토큰 발급 실패 (${response.status})`);

  let claims;
  try { claims = JSON.parse(dec.decode(b64urlDecode(token.id_token.split(".")[1]))); } catch { throw new LoginError("failed", "ID 토큰을 읽지 못했습니다."); }
  const tenantOk = GUID.test(env.ENTRA_TENANT_ID) ? claims.tid === env.ENTRA_TENANT_ID.toLowerCase() : Boolean(claims.tid);
  if (claims.aud !== env.ENTRA_CLIENT_ID || !tenantOk || claims.iss !== `https://login.microsoftonline.com/${claims.tid}/v2.0`
    || claims.nonce !== tx.nonce || !(claims.exp * 1000 > Date.now()) || !claims.oid) {
    throw new LoginError("failed", "ID 토큰 검증에 실패했습니다.");
  }

  // 표시 이름·메일·부서는 Graph에서 다시 읽는다. 실패하면 ID 토큰 값을 쓴다.
  let me = {};
  if (token.access_token) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,department", { headers: { authorization: `Bearer ${token.access_token}` } });
    if (res.ok) me = await res.json();
  }
  return {
    returnTo: tx.returnTo,
    profile: {
      oid: claims.oid,
      name: me.displayName || claims.name || "",
      email: String(me.mail || claims.email || "").trim().toLowerCase(),
      upn: String(me.userPrincipalName || claims.preferred_username || "").trim().toLowerCase(),
      department: me.department || "",
    },
  };
}

export async function sessionCookies(env, url, payload) {
  const session = await signToken({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }, env.SESSION_SECRET);
  return [cookie(url, SESSION_COOKIE, session, SESSION_SECONDS), cookie(url, LOGIN_COOKIE, "", 0)];
}
export function clearCookies(url) {
  return [cookie(url, SESSION_COOKIE, "", 0), cookie(url, LOGIN_COOKIE, "", 0)];
}
export function readSession(request, env) {
  return verifyToken(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
}
export { redirect };
