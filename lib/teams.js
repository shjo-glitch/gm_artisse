// 팀즈 알림. Power Automate 워크플로("Teams 웹후크 요청을 받을 때" 트리거)의 URL로 적응형 카드를 보낸다.
// - TEAMS_CHANNEL_WEBHOOK_URL: 채널에 올리는 주문 개시·현황·마감 알림
// - TEAMS_DM_WEBHOOK_URL: 미주문자 한 명에게 보내는 독촉. 요청 본문의 recipient(회사 이메일)로 Flow bot이 1:1 채팅을 보낸다.
const formatter = new Intl.NumberFormat("ko-KR");
const won = (v) => `${formatter.format(Math.max(0, Math.round(Number(v) || 0)))}원`;
const sizeShort = (size) => (size === "Grande" ? "G" : "P");

export function teamsStatus(env) {
  return { channel: Boolean(env.TEAMS_CHANNEL_WEBHOOK_URL), dm: Boolean(env.TEAMS_DM_WEBHOOK_URL) };
}

function kstTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}
function text(value, extra = {}) {
  return { type: "TextBlock", text: String(value), wrap: true, ...extra };
}
function message(body, appUrl, actionTitle = "주문하러 가기") {
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        msteams: { width: "Full" },
        body,
        actions: appUrl ? [{ type: "Action.OpenUrl", title: actionTitle, url: appUrl }] : [],
      },
    }],
  };
}

// 같은 메뉴·온도·사이즈·옵션은 한 줄로 묶는다. (주문 화면의 주문 명세서와 같은 규칙)
export function statement(orders) {
  const groups = new Map();
  orders.forEach((o) => {
    const options = [...(o.options || [])].sort();
    const key = `${o.menu_name}|${o.size}|${o.temp}|${options.join(",")}`;
    const cur = groups.get(key) || { menu: o.menu_name, temp: o.temp, size: o.size, options, quantity: 0, total: 0 };
    cur.quantity += 1;
    cur.total += Number(o.unit_price) || 0;
    groups.set(key, cur);
  });
  return [...groups.values()].sort((a, b) => a.menu.localeCompare(b.menu, "ko-KR") || a.size.localeCompare(b.size));
}
// 직접 입력한 메뉴명이 팀즈 카드에서 링크([글](주소))로 바뀌지 않게 막는다.
function plain(value) {
  return String(value).replace(/\]\s*\(/g, "] (").replace(/[<>]/g, "");
}
function statementLines(orders) {
  return statement(orders).map((g) => `- ${plain(g.menu)} ${g.temp} ${sizeShort(g.size)}${g.options.length ? ` (${plain(g.options.join(", "))})` : ""} × ${g.quantity} — ${won(g.total)}`).join("\n");
}
function summaryFacts({ orders, pending, members }) {
  const total = orders.reduce((s, o) => s + (Number(o.unit_price) || 0), 0);
  return {
    type: "FactSet",
    facts: [
      { title: "응답", value: `${members.length - pending.length} / ${members.length}명` },
      { title: "주문", value: `${orders.length}건 · ${won(total)}` },
    ],
  };
}

export function startCard({ appUrl, note, startedAt }) {
  return message([
    text("☕ 음료 주문을 시작합니다", { size: "Large", weight: "Bolder" }),
    text(`${kstTime(startedAt)} 시작 · 회사 Microsoft 계정으로 로그인해서 주문하세요.`, { isSubtle: true, spacing: "Small" }),
    ...(note ? [text(note, { spacing: "Medium" })] : []),
  ], appUrl);
}

export function statusCard({ appUrl, orders, pending, members, closed, note, startedAt }) {
  const title = closed ? "🔒 음료 주문을 마감했습니다" : "📋 음료 주문 현황";
  const body = [
    text(title, { size: "Large", weight: "Bolder" }),
    ...(startedAt ? [text(`${kstTime(startedAt)} 시작한 주문`, { isSubtle: true, spacing: "Small" })] : []),
    ...(note ? [text(note, { spacing: "Medium" })] : []),
    summaryFacts({ orders, pending, members }),
  ];
  if (orders.length) body.push(text("주문 명세", { weight: "Bolder", spacing: "Medium" }), text(statementLines(orders), { spacing: "Small" }));
  if (pending.length) body.push(text(closed ? "주문하지 않은 사람" : "아직 주문하지 않은 사람", { weight: "Bolder", spacing: "Medium" }), text(pending.map((m) => m.name).join(", "), { spacing: "Small" }));
  return message(body, closed ? "" : appUrl);
}

export function nudgeCard({ appUrl, name, startedAt }) {
  return message([
    text(`☕ ${name}님, 음료 주문이 아직 없어요`, { size: "Medium", weight: "Bolder" }),
    text(`${startedAt ? `${kstTime(startedAt)}에 시작한 ` : ""}음료 주문이 진행 중입니다. 마감 전에 주문해 주세요. 마시지 않을 거라면 기타 > "주문 안함"을 골라 주세요.`),
  ], appUrl);
}

async function post(url, payload) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`팀즈 전송 실패 (${response.status})${detail ? `: ${detail}` : ""}`);
  }
}
export async function postToChannel(env, payload) {
  if (!env.TEAMS_CHANNEL_WEBHOOK_URL) throw new Error("팀즈 채널 알림 주소(TEAMS_CHANNEL_WEBHOOK_URL)가 설정되지 않았습니다.");
  await post(env.TEAMS_CHANNEL_WEBHOOK_URL, payload);
}
export async function sendDirect(env, email, payload) {
  if (!env.TEAMS_DM_WEBHOOK_URL) throw new Error("팀즈 개인 알림 주소(TEAMS_DM_WEBHOOK_URL)가 설정되지 않았습니다.");
  await post(env.TEAMS_DM_WEBHOOK_URL, { ...payload, recipient: email });
}
