// 아띠제 음료 주문 (키오스크 화면). 회사 Microsoft 계정으로 로그인한 본인 이름으로 주문한다.
const CATEGORIES = [
  { key: "season", label: "시즌", icon: "✨" },
  { key: "coffee", label: "에스프레소", icon: "☕" },
  { key: "cold-brew", label: "콜드브루", icon: "🧊" },
  { key: "smoothie-ade", label: "스무디&에이드", icon: "🥤" },
  { key: "tea", label: "티&기타", icon: "🍵" },
  { key: "frappe", label: "프라페", icon: "🍫" },
  { key: "real-fruit-beverage", label: "리얼후르츠", icon: "🍊" },
  { key: "bottled", label: "병음료", icon: "🍾" },
  { key: "others", label: "기타", icon: "📝" },
];
const SIZES = ["Tall", "Grande"];
// 저장 값은 Tall/Grande 그대로 두고 화면에는 아띠제 표기(Petit/Grande)로 보여준다.
const SIZE_LABELS = { Tall: "Petit", Grande: "Grande" };
const CUSTOM = "__custom__";
const LOGIN_ERRORS = {
  not_member: (account) => `로그인한 계정${account ? `(${account})` : ""}이 팀원 명단에 없습니다. 다른 계정으로 로그인하거나 관리자에게 명단 추가를 요청하세요.`,
  taken: (account) => `${account || "이 계정"}으로 등록된 팀원이 이미 다른 Microsoft 계정과 연결되어 있습니다. 관리자에게 연결 해제를 요청하세요.`,
  expired: () => "로그인 시간이 지났습니다. 다시 로그인해 주세요.",
  denied: () => "Microsoft 로그인이 취소되었습니다.",
  config: () => "Microsoft 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요.",
  failed: () => "로그인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};
const formatter = new Intl.NumberFormat("ko-KR");

const state = {
  me: null,
  members: [],
  requests: [],
  drinks: [],
  orders: [],
  closed: false,
  roundStartedAt: null,
  history: null,
  category: "season",
};
// 5초 동기화에서 내용이 그대로면 화면을 다시 그리지 않는다.
const signatures = { config: "", orders: "" };
// 옵션 창에서 고르고 있는 값. editingId가 있으면 그 주문(=내 주문)을 고친다.
const draft = { drink: null, editingId: "", replacing: false, temp: "ICE", size: "Tall", extras: {}, requests: new Set() };
let syncTimer = null;

const $ = (sel) => document.querySelector(sel);
const tabs = $("#category-tabs");
const grid = $("#drink-grid");
const kioskStatus = $("#kiosk-status");
const closedBanner = $("#closed-banner");
const sheet = $("#drink-sheet");
const sheetForm = $("#sheet-form");
const ordersSheet = $("#orders-sheet");
const meSheet = $("#me-sheet");
const confirmSheet = $("#confirm-sheet");

// ── 유틸리티 ─────────────────────────────────────────────

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function won(value) { return formatter.format(Math.max(0, Math.round(Number(value) || 0))); }
function sizeLabel(size) { return SIZE_LABELS[size] || size; }
function roundDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
}
function roundTime(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}
function showToast(message, type = "info", duration = 3500) {
  const icons = { info: "ℹ️", success: "✅", warning: "⚠️" };
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast__icon">${icons[type] || ""}</span><span>${escapeHtml(message)}</span>`;
  $("#toast-container").appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("toast--visible")));
  setTimeout(() => { el.classList.remove("toast--visible"); setTimeout(() => el.remove(), 300); }, duration);
}
async function apiRequest(path, { method = "GET", body } = {}) {
  const headers = body === undefined ? {} : { "content-type": "application/json" };
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin();
    throw new Error(data.error || "로그인이 필요합니다.");
  }
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}

// ── 데이터 변환 ───────────────────────────────────────────

function rowToDrink(row) {
  return {
    category: row.category,
    name: row.name,
    prices: { Tall: Number(row.tall_price) || 0, Grande: Number(row.grande_price) || 0 },
    iceOnly: Boolean(row.ice_only),
    hotOnly: Boolean(row.hot_only),
    extras: Array.isArray(row.extras) ? row.extras : [],
  };
}
function rowToOrder(row) {
  return {
    id: row.id, menuName: row.menu_name, category: row.category, requester: row.requester, memberId: row.member_id ?? null,
    size: row.size, temp: row.temp || "ICE", options: Array.isArray(row.options) ? row.options : [],
    note: row.note || "", unitPrice: Number(row.unit_price) || 0,
    roundStartedAt: row.round_started_at || null, updatedAt: row.updated_at || null,
  };
}
function applyConfig(config, members) {
  state.requests = config.options || [];
  state.closed = Boolean(config.orders_closed);
  state.roundStartedAt = config.round_started_at || null;
  state.members = members || [];
}
function findDrink(name) { return state.drinks.find((d) => d.name === name); }
function myOrder() { return state.me ? state.orders.find((o) => o.memberId === state.me.id) || null : null; }
function pendingMembers() {
  const ordered = new Set(state.orders.map((o) => o.memberId));
  return state.members.filter((m) => !ordered.has(m.id));
}
function soldSizes(drink) {
  // 가격이 0인 사이즈는 팔지 않는 사이즈로 본다. ("주문 안함"처럼 모두 0이면 Petit만 둔다)
  const sold = SIZES.filter((s) => drink.prices[s] > 0);
  return sold.length ? sold : ["Tall"];
}
function temps(drink) {
  if (drink.iceOnly) return ["ICE"];
  if (drink.hotOnly) return ["HOT"];
  return ["HOT", "ICE"];
}
// 유료 옵션은 주문에 "샷추가", "샷추가 x2"처럼 이름(과 개수)으로 저장한다.
function encodeExtras(drink, picks) {
  const out = [];
  drink.extras.forEach((group, gi) => group.choices.forEach((choice, ci) => {
    const n = picks[`${gi}:${ci}`] || 0;
    if (n > 0) out.push(n > 1 ? `${choice.name} x${n}` : choice.name);
  }));
  return out;
}
function decodeExtras(drink, options) {
  const picks = {};
  const rest = [];
  options.forEach((text) => {
    const m = String(text).match(/^(.*?)(?: x(\d+))?$/);
    let found = false;
    drink.extras.forEach((group, gi) => group.choices.forEach((choice, ci) => {
      if (!found && choice.name === m[1]) { picks[`${gi}:${ci}`] = Number(m[2] || 1); found = true; }
    }));
    if (!found) rest.push(text);
  });
  return { picks, rest };
}
function extrasPrice(drink, picks) {
  let sum = 0;
  drink.extras.forEach((group, gi) => group.choices.forEach((choice, ci) => { sum += (picks[`${gi}:${ci}`] || 0) * (Number(choice.price) || 0); }));
  return sum;
}
function orderDetail(o) {
  return [o.temp, o.size === "Grande" ? "G" : "P", ...o.options, o.note].filter(Boolean).join(" · ");
}

// ── 메뉴 화면 ─────────────────────────────────────────────

function renderTabs() {
  const used = new Set(state.drinks.map((d) => d.category));
  const visible = CATEGORIES.filter((c) => used.has(c.key) || c.key === "others");
  if (!visible.some((c) => c.key === state.category)) state.category = visible[0]?.key || "others";
  tabs.innerHTML = visible.map((c) => `<button type="button" class="kiosk-tab${c.key === state.category ? " is-active" : ""}" data-category="${c.key}" aria-pressed="${c.key === state.category}"><span aria-hidden="true">${c.icon}</span>${escapeHtml(c.label)}</button>`).join("");
  const active = tabs.querySelector(".is-active");
  if (active) tabs.scrollTo({ left: active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
}
function priceText(drink) {
  const sizes = soldSizes(drink);
  return `${won(drink.prices[sizes[0]])}원${sizes.length > 1 ? "~" : ""}`;
}
function renderGrid() {
  const cat = CATEGORIES.find((c) => c.key === state.category) || CATEGORIES[0];
  const drinks = state.drinks.filter((d) => d.category === cat.key);
  const mine = myOrder();
  const tiles = drinks.map((d) => {
    const badges = [mine?.menuName === d.name ? "내 주문" : "", d.iceOnly ? "ICE 전용" : "", d.hotOnly ? "HOT 전용" : "", d.extras.length ? "추가 옵션" : ""].filter(Boolean);
    return `<button type="button" class="kiosk-tile${mine?.menuName === d.name ? " is-mine" : ""}" data-drink="${escapeHtml(d.name)}" ${state.closed ? "disabled" : ""}>
      <span class="kiosk-tile__icon" aria-hidden="true">${cat.icon}</span>
      <span class="kiosk-tile__name">${escapeHtml(d.name)}</span>
      <span class="kiosk-tile__price">${priceText(d)}</span>
      ${badges.length ? `<span class="kiosk-tile__badges">${badges.map((b) => `<span>${b}</span>`).join("")}</span>` : ""}
    </button>`;
  });
  if (cat.key === "others") {
    tiles.push(`<button type="button" class="kiosk-tile kiosk-tile--custom" data-drink="${CUSTOM}" ${state.closed ? "disabled" : ""}>
      <span class="kiosk-tile__icon" aria-hidden="true">✏️</span>
      <span class="kiosk-tile__name">직접 입력</span>
      <span class="kiosk-tile__price">메뉴에 없는 음료</span>
    </button>`);
  }
  grid.innerHTML = tiles.join("");
  grid.setAttribute("aria-busy", "false");
  kioskStatus.textContent = tiles.length ? "" : "이 카테고리에는 아직 메뉴가 없습니다.";
}
function renderClosed() {
  closedBanner.classList.toggle("is-hidden", !state.closed);
  document.body.classList.toggle("is-closed", state.closed);
}
function renderSummary() {
  const total = state.orders.reduce((s, o) => s + o.unitPrice, 0);
  $("#order-count").textContent = won(state.orders.length);
  $("#order-total").textContent = won(total);
  $("#orders-count").textContent = won(state.orders.length);
  $("#orders-total").textContent = won(total);
}
function renderMeButton() {
  const mine = myOrder();
  $("#me-name").textContent = state.me ? `${state.me.name}님` : "내 주문";
  $("#me-status").textContent = mine ? `✓ ${mine.menuName}` : state.closed ? "주문 마감" : "아직 주문 전";
  $("#open-me").classList.toggle("is-done", Boolean(mine));
}

// ── 옵션 선택 창 ──────────────────────────────────────────

function draftDrink() {
  if (draft.drink !== CUSTOM) return findDrink(draft.drink);
  return { category: "others", name: "", prices: { Tall: Number($("#custom-price").value) || 0, Grande: 0 }, iceOnly: false, hotOnly: false, extras: [] };
}
function draftTotal() {
  const drink = draftDrink();
  if (!drink) return 0;
  return (drink.prices[draft.size] || 0) + extrasPrice(drink, draft.extras);
}
function segment(name, values, current, label, extra = () => "") {
  return values.map((v) => `<button type="button" class="kiosk-seg${v === current ? " is-active" : ""}" data-${name}="${v}" aria-pressed="${v === current}">${escapeHtml(label(v))}${extra(v)}</button>`).join("");
}
function renderSheet() {
  const drink = draftDrink();
  const custom = draft.drink === CUSTOM;
  $("#custom-fields").classList.toggle("is-hidden", !custom);
  $("#sheet-title").textContent = custom ? "직접 입력" : drink.name;
  $("#sheet-category").textContent = (CATEGORIES.find((c) => c.key === drink.category) || {}).label || "";
  $("#sheet-base").textContent = custom ? "메뉴 이름과 가격을 입력하세요." : soldSizes(drink).map((s) => `${sizeLabel(s)} ${won(drink.prices[s])}원`).join(" · ");

  const tempValues = temps(drink);
  if (!tempValues.includes(draft.temp)) draft.temp = tempValues[0];
  $("#temp-choices").innerHTML = segment("temp", tempValues, draft.temp, (v) => v);

  const sizes = soldSizes(drink);
  if (!sizes.includes(draft.size)) draft.size = sizes[0];
  $("#size-field").classList.toggle("is-hidden", custom);
  $("#size-choices").innerHTML = segment("size", sizes, draft.size, sizeLabel, (v) => v === "Grande" && drink.prices.Tall > 0 ? `<small>+${won(drink.prices.Grande - drink.prices.Tall)}원</small>` : "");

  $("#extra-groups").innerHTML = drink.extras.map((group, gi) => {
    const used = group.choices.reduce((s, _, ci) => s + (draft.extras[`${gi}:${ci}`] || 0), 0);
    const hint = group.mode === "count" ? `최대 ${group.max}개` : "하나만 선택";
    return `<fieldset class="kiosk-section"><legend class="kiosk-label">${escapeHtml(group.title)} <span class="kiosk-hint">${hint}</span></legend>
      <div class="kiosk-extras">${group.choices.map((choice, ci) => {
        const key = `${gi}:${ci}`;
        const n = draft.extras[key] || 0;
        const price = choice.price ? `+${won(choice.price)}원` : "무료";
        if (choice.soldOut) return `<div class="kiosk-extra is-soldout"><span>${escapeHtml(choice.name)}</span><span>품절</span></div>`;
        if (group.mode === "count") {
          return `<div class="kiosk-extra"><span>${escapeHtml(choice.name)} <small>${price}</small></span>
            <span class="kiosk-stepper"><button type="button" data-step="-1" data-key="${key}" aria-label="${escapeHtml(choice.name)} 빼기" ${n === 0 ? "disabled" : ""}>−</button><output>${n}</output><button type="button" data-step="1" data-key="${key}" data-group="${gi}" aria-label="${escapeHtml(choice.name)} 더하기" ${used >= group.max ? "disabled" : ""}>+</button></span></div>`;
        }
        return `<button type="button" class="kiosk-extra kiosk-extra--pick${n ? " is-active" : ""}" data-pick="${key}" data-group="${gi}" aria-pressed="${Boolean(n)}"><span>${escapeHtml(choice.name)}</span><small>${price}</small></button>`;
      }).join("")}</div></fieldset>`;
  }).join("");

  // 유료 옵션과 이름이 같은 무료 요청(예: 디카페인, 두유)은 이 메뉴에서는 유료 옵션으로만 고르게 한다.
  const paid = new Set(drink.extras.flatMap((g) => g.choices.map((c) => c.name.replace(/\s+/g, ""))));
  const requests = state.requests.filter((r) => !paid.has(r.replace(/\s+/g, "")));
  [...draft.requests].forEach((r) => { if (paid.has(r.replace(/\s+/g, ""))) draft.requests.delete(r); });
  $("#request-choices").innerHTML = requests.map((r) => `<button type="button" class="kiosk-chip${draft.requests.has(r) ? " is-active" : ""}" data-request="${escapeHtml(r)}" aria-pressed="${draft.requests.has(r)}">${escapeHtml(r)}</button>`).join("");
  renderTotal();
}
function renderTotal() {
  $("#sheet-total").textContent = won(draftTotal());
  $("#sheet-submit-label").textContent = !draft.editingId ? "주문 담기" : draft.replacing ? "이 메뉴로 바꾸기" : "주문 수정";
  $("#sheet-submit").disabled = state.closed;
}
// prefill: 고칠 주문(내 주문)이나 다시 주문할 지난 주문. 이미 주문했으면 새 메뉴를 골라도 내 주문을 바꾼다(1인 1주문).
function openSheet(drinkName, prefill = null) {
  if (state.closed) return showToast("주문이 마감되었습니다.", "warning");
  const mine = myOrder();
  draft.drink = drinkName;
  draft.editingId = mine?.id || "";
  draft.replacing = Boolean(mine) && prefill?.id !== mine.id;
  draft.temp = prefill?.temp || "ICE";
  draft.size = prefill?.size || "Tall";
  const drink = draftDrink();
  const { picks, rest } = decodeExtras(drink || { extras: [] }, prefill?.options || []);
  draft.extras = picks;
  draft.requests = new Set(rest);
  $("#order-note").value = prefill?.note || "";
  $("#custom-name").value = drinkName === CUSTOM ? prefill?.menuName || "" : "";
  $("#custom-price").value = drinkName === CUSTOM && prefill ? prefill.unitPrice : "";
  $("#sheet-replace").textContent = draft.replacing ? `이미 주문한 "${mine.menuName}"을(를) 이 메뉴로 바꿉니다.` : "";
  $("#sheet-replace").classList.toggle("is-hidden", !draft.replacing);
  $("#sheet-error").textContent = "";
  renderSheet();
  sheet.showModal();
  sheet.querySelector(".kiosk-sheet__body").scrollTop = 0;
}
function openForOrder(order) {
  openSheet(findDrink(order.menuName) ? order.menuName : CUSTOM, order);
}
async function submitSheet() {
  const drink = draftDrink();
  const custom = draft.drink === CUSTOM;
  const menuName = custom ? $("#custom-name").value.trim() : drink.name;
  const error = (msg) => { $("#sheet-error").textContent = msg; };
  if (custom && !menuName) return error("메뉴 이름을 입력하세요.");
  if (custom && !(Number($("#custom-price").value) > 0)) return error("가격을 입력하세요.");
  const body = {
    menu_name: menuName,
    category: drink.category,
    size: draft.size,
    temp: draft.temp,
    options: [...encodeExtras(drink, draft.extras), ...draft.requests],
    note: $("#order-note").value.trim(),
    unit_price: draftTotal(),
  };
  $("#sheet-submit").disabled = true;
  try {
    if (draft.editingId) await apiRequest(`/api/orders/${encodeURIComponent(draft.editingId)}`, { method: "PUT", body });
    else await apiRequest("/api/orders", { method: "POST", body });
    sheet.close();
    showToast(`${menuName} 주문을 ${!draft.editingId ? "담았" : draft.replacing ? "바꿨" : "수정했"}습니다.`, "success");
    await reloadOrders(true);
  } catch (e) {
    error(e.message);
  } finally {
    $("#sheet-submit").disabled = state.closed;
  }
}

// ── 주문 현황 ─────────────────────────────────────────────

function statementGroups() {
  const groups = new Map();
  state.orders.forEach((o) => {
    const opts = [...o.options].sort();
    const key = `${o.menuName}|${o.size}|${o.temp}|${opts.join(",")}`;
    const cur = groups.get(key) || { ...o, options: opts, quantity: 0, total: 0 };
    cur.quantity += 1;
    cur.total += o.unitPrice;
    groups.set(key, cur);
  });
  return [...groups.values()].sort((a, b) => a.menuName.localeCompare(b.menuName, "ko-KR") || a.size.localeCompare(b.size));
}
function renderOrders() {
  $("#statement-list").innerHTML = statementGroups().map((g) => `<li><span>${escapeHtml(g.menuName)} ${g.temp} ${g.size === "Grande" ? "G" : "P"}${g.options.length ? ` (${g.options.map(escapeHtml).join(", ")})` : ""} x${g.quantity}</span><strong>${won(g.total)}원</strong></li>`).join("");
  $("#order-list").innerHTML = state.orders.map((o) => {
    const mine = state.me && o.memberId === state.me.id;
    const detail = escapeHtml([o.temp, o.size === "Grande" ? "G" : "P", `${won(o.unitPrice)}원`, ...o.options, o.note].filter(Boolean).join(" · "));
    return `<li class="kiosk-order${mine ? " is-mine" : ""}">
      <div class="kiosk-order__head">
        <strong>${escapeHtml(o.requester)}${mine ? ` <span class="kiosk-order__me">나</span>` : ""}</strong>
        ${mine ? `<span class="kiosk-order__actions">
          <button type="button" class="kiosk-order__btn kiosk-order__btn--edit" data-edit="${escapeHtml(o.id)}" title="수정" aria-label="내 주문 수정" ${state.closed ? "disabled" : ""}>✏️</button>
          <button type="button" class="kiosk-order__btn kiosk-order__btn--delete" data-delete="${escapeHtml(o.id)}" title="취소" aria-label="내 주문 취소" ${state.closed ? "disabled" : ""}>✕</button>
        </span>` : ""}
      </div>
      <p class="kiosk-order__menu" title="${escapeHtml(o.menuName)}">${escapeHtml(o.menuName)}</p>
      <p class="kiosk-order__detail" title="${detail}">${detail}</p>
    </li>`;
  }).join("");
  $("#orders-empty").classList.toggle("is-hidden", state.orders.length > 0);
  const pending = pendingMembers();
  $("#pending-count").textContent = `${pending.length}명`;
  $("#pending-list").innerHTML = pending.length
    ? pending.map((m) => `<li${state.me?.id === m.id ? ` class="is-me"` : ""}>${escapeHtml(m.name)}</li>`).join("")
    : `<li class="is-done">모두 주문했습니다 🎉</li>`;
  renderSummary();
  renderMeButton();
  if (meSheet.open) renderMeCurrent();
}

// ── 내 주문 ───────────────────────────────────────────────

function renderMeCurrent() {
  const mine = myOrder();
  const status = state.closed
    ? `<p class="kiosk-mine__status is-closed">🔒 주문 마감${state.roundStartedAt ? ` · ${escapeHtml(roundTime(state.roundStartedAt))} 시작` : ""}</p>`
    : `<p class="kiosk-mine__status">🟢 주문 받는 중${state.roundStartedAt ? ` · ${escapeHtml(roundTime(state.roundStartedAt))} 시작` : ""}</p>`;
  $("#me-current").innerHTML = status + (mine
    ? `<article class="kiosk-mine__card">
        <p class="kiosk-mine__menu">${escapeHtml(mine.menuName)}</p>
        <p class="kiosk-mine__detail">${escapeHtml(orderDetail(mine))}</p>
        <p class="kiosk-mine__price">${won(mine.unitPrice)}원</p>
        <div class="kiosk-mine__actions">
          <button type="button" class="kiosk-btn" data-me-edit ${state.closed ? "disabled" : ""}>주문 수정</button>
          <button type="button" class="kiosk-btn kiosk-btn--ghost" data-me-delete ${state.closed ? "disabled" : ""}>주문 취소</button>
        </div>
        ${state.closed ? "" : `<p class="kiosk-hint">메뉴에서 다른 음료를 고르면 이 주문이 그 음료로 바뀝니다.</p>`}
      </article>`
    : `<div class="kiosk-mine__empty">${state.closed
      ? "이번 주문에는 참여하지 않았습니다."
      : "아직 주문하지 않았어요. 메뉴에서 음료를 고르거나 아래 지난 주문에서 다시 주문하세요. 마시지 않을 거라면 기타 &gt; \"주문 안함\"을 골라 주세요."}</div>`);
}
function renderHistory() {
  const list = state.history || [];
  $("#me-history-empty").classList.toggle("is-hidden", state.history === null || list.length > 0);
  if (state.history === null) { $("#me-history").innerHTML = `<li class="kiosk-status">불러오는 중입니다.</li>`; return; }
  $("#me-history").innerHTML = list.map((o, i) => `<li class="kiosk-history__item">
    <div>
      <p class="kiosk-history__date">${escapeHtml(roundDate(o.roundStartedAt))}</p>
      <p class="kiosk-history__menu">${escapeHtml(o.menuName)}</p>
      <p class="kiosk-history__detail">${escapeHtml(orderDetail(o))} · ${won(o.unitPrice)}원</p>
    </div>
    <button type="button" class="kiosk-btn kiosk-btn--ghost kiosk-btn--small" data-reorder="${i}" ${state.closed ? "disabled" : ""}>이 메뉴로 주문</button>
  </li>`).join("");
}
async function openMeSheet() {
  $("#me-account").textContent = state.me ? `${state.me.name}${state.me.email ? ` · ${state.me.email}` : ""}` : "";
  renderMeCurrent();
  renderHistory();
  meSheet.showModal();
  try {
    const { history } = await apiRequest("/api/me/history");
    state.history = history.map(rowToOrder);
  } catch (e) {
    state.history = [];
    showToast(`지난 주문을 불러오지 못했습니다: ${e.message}`, "warning");
  }
  renderHistory();
}

// 주문 취소처럼 되돌리기 어려운 동작은 확인 창에서 한 번 더 묻는다.
let pendingConfirm = null;
function askConfirm({ title, message, ok, onOk }) {
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  $("#confirm-ok").textContent = ok;
  pendingConfirm = onOk;
  confirmSheet.showModal();
}
function askDelete(id) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return;
  askConfirm({ title: "주문 취소", message: `내 ${order.menuName} 주문을 취소할까요?`, ok: "주문 취소", onOk: () => deleteOrder(id) });
}
async function deleteOrder(id) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return;
  try {
    await apiRequest(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE" });
    showToast(`${order.menuName} 주문을 취소했습니다.`, "success");
    await reloadOrders(true);
  } catch (e) {
    showToast(e.message, "warning");
  }
}

// ── 로그인 ────────────────────────────────────────────────

async function showLogin(errorCode = "", account = "") {
  stopSync();
  state.me = null;
  [sheet, ordersSheet, meSheet, confirmSheet].forEach((d) => { if (d.open) d.close(); });
  document.body.classList.add("is-locked");
  $("#login-cover").classList.remove("is-hidden");
  const message = LOGIN_ERRORS[errorCode]?.(account) || "";
  $("#login-error").textContent = message;
  $("#login-error").classList.toggle("is-hidden", !message);
  $("#login-ms").href = `/api/auth/login?return=${encodeURIComponent(location.pathname)}`;
  try {
    const { entra, dev } = await fetch("/api/auth/config").then((r) => r.json());
    $("#login-ms").classList.toggle("is-disabled", !entra);
    if (!entra && !message) {
      $("#login-error").textContent = LOGIN_ERRORS.config();
      $("#login-error").classList.remove("is-hidden");
    }
    $("#dev-login").classList.toggle("is-hidden", !dev);
    if (dev) $("#dev-members").innerHTML = dev.map((m) => `<a class="kiosk-chip" href="/api/auth/dev?member=${m.id}&return=${encodeURIComponent(location.pathname)}">${escapeHtml(m.name)}</a>`).join("");
  } catch {
    // 설정을 못 읽어도 로그인 버튼은 그대로 둔다.
  }
}
async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.reload();
}

// ── 데이터 로드와 동기화 ──────────────────────────────────

async function loadState() {
  const { config, drinks, orders, members, me } = await apiRequest("/api/state");
  if (!me) return showLogin();
  state.me = me;
  applyConfig(config, members);
  state.drinks = drinks.map(rowToDrink);
  state.orders = orders.map(rowToOrder);
  signatures.config = JSON.stringify({ config, drinks, members });
  signatures.orders = JSON.stringify(orders);
  document.body.classList.remove("is-locked");
  $("#login-cover").classList.add("is-hidden");
  renderTabs(); renderGrid(); renderClosed(); renderOrders();
  startSync();
}
async function reloadOrders(force = false) {
  const { orders } = await apiRequest("/api/orders");
  const signature = JSON.stringify(orders);
  if (!force && signature === signatures.orders) return;
  signatures.orders = signature;
  state.orders = orders.map(rowToOrder);
  renderOrders();
  renderGrid();
}
async function reloadConfig() {
  const { config, drinks, members } = await apiRequest("/api/config");
  const signature = JSON.stringify({ config, drinks, members });
  if (signature === signatures.config) return;
  const wasClosed = state.closed;
  const previousRound = state.roundStartedAt;
  signatures.config = signature;
  applyConfig(config, members);
  state.drinks = drinks.map(rowToDrink);
  if (previousRound !== state.roundStartedAt) state.history = null;
  renderTabs(); renderGrid(); renderClosed(); renderOrders();
  if (previousRound && previousRound !== state.roundStartedAt) showToast("새 주문이 시작되었습니다.", "info");
  else if (wasClosed !== state.closed) showToast(state.closed ? "주문이 마감되었습니다." : "주문이 재개되었습니다.", state.closed ? "warning" : "success");
  if (sheet.open) {
    if (state.closed || (draft.drink !== CUSTOM && !findDrink(draft.drink))) sheet.close();
    else renderSheet();
  }
}
function startSync() {
  stopSync();
  syncTimer = setInterval(async () => {
    try { await Promise.all([reloadOrders(), reloadConfig()]); } catch (e) { console.error("[sync]", e); }
  }, 5000);
}
function stopSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

// ── 이벤트 ────────────────────────────────────────────────

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-category]");
  if (!btn) return;
  state.category = btn.dataset.category;
  renderTabs(); renderGrid();
});
grid.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-drink]");
  if (!tile) return;
  const mine = myOrder();
  // 내 주문과 같은 메뉴를 누르면 그 주문을 고친다.
  if (mine && tile.dataset.drink === mine.menuName) openSheet(tile.dataset.drink, mine);
  else openSheet(tile.dataset.drink);
});
sheet.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (e.target === sheet || (t && t.hasAttribute("data-close"))) return sheet.close();
  if (!t) return;
  if (t.dataset.temp) { draft.temp = t.dataset.temp; renderSheet(); }
  else if (t.dataset.size) { draft.size = t.dataset.size; renderSheet(); }
  else if (t.dataset.step) { draft.extras[t.dataset.key] = Math.max(0, (draft.extras[t.dataset.key] || 0) + Number(t.dataset.step)); renderSheet(); }
  else if (t.dataset.pick) {
    const on = !draft.extras[t.dataset.pick];
    Object.keys(draft.extras).filter((k) => k.startsWith(`${t.dataset.group}:`)).forEach((k) => { draft.extras[k] = 0; });
    draft.extras[t.dataset.pick] = on ? 1 : 0;
    renderSheet();
  } else if (t.dataset.request) {
    const r = t.dataset.request;
    if (draft.requests.has(r)) draft.requests.delete(r); else draft.requests.add(r);
    renderSheet();
  }
});
$("#custom-price").addEventListener("input", renderTotal);
sheetForm.addEventListener("submit", (e) => { e.preventDefault(); submitSheet(); });
$("#open-orders").addEventListener("click", () => { renderOrders(); ordersSheet.showModal(); });
$("#open-me").addEventListener("click", openMeSheet);
ordersSheet.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (e.target === ordersSheet || (t && t.hasAttribute("data-close"))) return ordersSheet.close();
  if (!t) return;
  if (t.dataset.delete) askDelete(t.dataset.delete);
  if (t.dataset.edit) {
    const order = state.orders.find((o) => o.id === t.dataset.edit);
    if (!order) return;
    ordersSheet.close();
    openForOrder(order);
  }
});
meSheet.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (e.target === meSheet || (t && t.hasAttribute("data-close"))) return meSheet.close();
  if (!t) return;
  const mine = myOrder();
  if (t.hasAttribute("data-me-edit") && mine) { meSheet.close(); openForOrder(mine); }
  if (t.hasAttribute("data-me-delete") && mine) askDelete(mine.id);
  if (t.dataset.reorder !== undefined) {
    const past = state.history?.[Number(t.dataset.reorder)];
    if (!past) return;
    meSheet.close();
    openForOrder({ ...past, id: "" });
  }
});
$("#logout").addEventListener("click", logout);

confirmSheet.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (e.target === confirmSheet || (t && t.hasAttribute("data-close"))) return confirmSheet.close();
  if (t && t.hasAttribute("data-confirm-ok")) {
    confirmSheet.close();
    const run = pendingConfirm;
    pendingConfirm = null;
    if (run) run();
  }
});

// ── 초기화 ────────────────────────────────────────────────

(async () => {
  const params = new URLSearchParams(location.search);
  const loginError = params.get("login_error");
  if (loginError) {
    // 오류 안내는 한 번만 보여 주고 주소창은 깨끗하게 돌려 둔다.
    history.replaceState(null, "", location.pathname);
    return showLogin(loginError, params.get("account") || "");
  }
  try {
    await loadState();
  } catch (e) {
    // 로그인이 필요해서 실패한 경우는 showLogin()이 이미 로그인 화면을 띄웠다.
    if ($("#login-cover").classList.contains("is-hidden")) {
      document.body.classList.remove("is-locked");
      kioskStatus.textContent = `메뉴를 불러오지 못했습니다: ${e.message}`;
    }
  }
})();
