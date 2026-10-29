// 아띠제 음료 주문 v2 (키오스크 화면). 주문·메뉴·설정 데이터는 기존 주문표와 같은 /api/* 를 쓴다.
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
const formatter = new Intl.NumberFormat("ko-KR");

const state = {
  users: [],
  requests: [],
  drinks: [],
  orders: [],
  closed: false,
  category: "season",
};
// 5초 동기화에서 내용이 그대로면 화면을 다시 그리지 않는다.
const signatures = { config: "", orders: "" };
// 옵션 창에서 고르고 있는 값
const draft = { drink: null, editingId: "", temp: "ICE", size: "Tall", extras: {}, requests: new Set(), requester: "" };

const $ = (sel) => document.querySelector(sel);
const tabs = $("#category-tabs");
const grid = $("#drink-grid");
const kioskStatus = $("#kiosk-status");
const closedBanner = $("#closed-banner");
const sheet = $("#drink-sheet");
const sheetForm = $("#sheet-form");
const ordersSheet = $("#orders-sheet");
const confirmSheet = $("#confirm-sheet");

// ── 유틸리티 ─────────────────────────────────────────────

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function won(value) { return formatter.format(Math.max(0, Math.round(Number(value) || 0))); }
function sizeLabel(size) { return SIZE_LABELS[size] || size; }
function sortUsers(users) { return [...users].sort((a, b) => a.localeCompare(b, "ko-KR")); }
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
    id: row.id, menuName: row.menu_name, category: row.category, requester: row.requester,
    size: row.size, temp: row.temp || "ICE", options: Array.isArray(row.options) ? row.options : [],
    note: row.note || "", unitPrice: Number(row.unit_price) || 0,
  };
}
function applyConfig(config) {
  state.users = sortUsers(config.users || []);
  state.requests = config.options || [];
  state.closed = Boolean(config.orders_closed);
}
function findDrink(name) { return state.drinks.find((d) => d.name === name); }
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
  const tiles = drinks.map((d) => {
    const badges = [d.iceOnly ? "ICE 전용" : "", d.hotOnly ? "HOT 전용" : "", d.extras.length ? "추가 옵션" : ""].filter(Boolean);
    return `<button type="button" class="kiosk-tile" data-drink="${escapeHtml(d.name)}" ${state.closed ? "disabled" : ""}>
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

// ── 옵션 선택 창 ──────────────────────────────────────────

function availableRequesters() {
  const taken = new Set(state.orders.filter((o) => o.id !== draft.editingId).map((o) => o.requester));
  return state.users.filter((u) => !taken.has(u));
}
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
  renderRequesters();
  renderTotal();
}
function renderRequesters() {
  const names = availableRequesters();
  if (draft.requester && !names.includes(draft.requester)) draft.requester = "";
  $("#requester-choices").innerHTML = names.length
    ? names.map((n) => `<button type="button" class="kiosk-chip${n === draft.requester ? " is-active" : ""}" data-requester="${escapeHtml(n)}" aria-pressed="${n === draft.requester}">${escapeHtml(n)}</button>`).join("")
    : `<p class="kiosk-hint">모든 팀원이 주문했습니다.</p>`;
}
function renderTotal() {
  $("#sheet-total").textContent = won(draftTotal());
  $("#sheet-submit-label").textContent = draft.editingId ? "주문 수정" : "주문 담기";
  $("#sheet-submit").disabled = state.closed;
}
function openSheet(drinkName, order = null) {
  if (state.closed) return showToast("주문이 마감되었습니다.", "warning");
  draft.drink = drinkName;
  draft.editingId = order?.id || "";
  draft.temp = order?.temp || "ICE";
  draft.size = order?.size || "Tall";
  draft.requester = order?.requester || "";
  const drink = draftDrink();
  const { picks, rest } = decodeExtras(drink || { extras: [] }, order?.options || []);
  draft.extras = picks;
  draft.requests = new Set(rest);
  $("#order-note").value = order?.note || "";
  $("#custom-name").value = drinkName === CUSTOM ? order?.menuName || "" : "";
  $("#custom-price").value = drinkName === CUSTOM && order ? order.unitPrice : "";
  $("#sheet-error").textContent = "";
  renderSheet();
  sheet.showModal();
  sheet.querySelector(".kiosk-sheet__body").scrollTop = 0;
}
async function submitSheet() {
  const drink = draftDrink();
  const custom = draft.drink === CUSTOM;
  const menuName = custom ? $("#custom-name").value.trim() : drink.name;
  const error = (msg) => { $("#sheet-error").textContent = msg; };
  if (custom && !menuName) return error("메뉴 이름을 입력하세요.");
  if (custom && !(Number($("#custom-price").value) > 0)) return error("가격을 입력하세요.");
  if (!draft.requester) return error("주문자를 선택하세요.");
  const body = {
    menu_name: menuName,
    category: drink.category,
    requester: draft.requester,
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
    showToast(`${draft.requester}님 ${menuName} 주문을 ${draft.editingId ? "수정" : "담았"}습니다.`, "success");
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
    const detail = [o.temp, o.size === "Grande" ? "G" : "P", `${won(o.unitPrice)}원`, ...o.options, o.note].filter(Boolean).map(escapeHtml).join(" · ");
    return `<li class="kiosk-order">
      <div class="kiosk-order__head">
        <strong>${escapeHtml(o.requester)}</strong>
        <span class="kiosk-order__actions">
          <button type="button" class="kiosk-order__btn kiosk-order__btn--edit" data-edit="${escapeHtml(o.id)}" title="수정" aria-label="${escapeHtml(o.requester)} 주문 수정" ${state.closed ? "disabled" : ""}>✏️</button>
          <button type="button" class="kiosk-order__btn kiosk-order__btn--delete" data-delete="${escapeHtml(o.id)}" title="삭제" aria-label="${escapeHtml(o.requester)} 주문 삭제" ${state.closed ? "disabled" : ""}>✕</button>
        </span>
      </div>
      <p class="kiosk-order__menu" title="${escapeHtml(o.menuName)}">${escapeHtml(o.menuName)}</p>
      <p class="kiosk-order__detail" title="${detail}">${detail}</p>
    </li>`;
  }).join("");
  $("#orders-empty").classList.toggle("is-hidden", state.orders.length > 0);
  renderSummary();
}
// 주문 삭제처럼 되돌리기 어려운 동작은 확인 창에서 한 번 더 묻는다.
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
  askConfirm({ title: "주문 삭제", message: `${order.requester}님의 ${order.menuName} 주문을 삭제할까요?`, ok: "삭제", onOk: () => deleteOrder(id) });
}
async function deleteOrder(id) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return;
  try {
    await apiRequest(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE" });
    showToast(`${order.requester}님 주문을 삭제했습니다.`, "success");
    await reloadOrders(true);
  } catch (e) {
    showToast(e.message, "warning");
  }
}

// ── 데이터 로드와 동기화 ──────────────────────────────────

async function loadState() {
  try {
    const { config, drinks, orders } = await apiRequest("/api/state");
    applyConfig(config);
    state.drinks = drinks.map(rowToDrink);
    state.orders = orders.map(rowToOrder);
    signatures.config = JSON.stringify({ config, drinks });
    signatures.orders = JSON.stringify(orders);
    renderTabs(); renderGrid(); renderClosed(); renderOrders();
  } catch (e) {
    kioskStatus.textContent = `메뉴를 불러오지 못했습니다: ${e.message}`;
  }
}
async function reloadOrders(force = false) {
  const { orders } = await apiRequest("/api/orders");
  const signature = JSON.stringify(orders);
  if (!force && signature === signatures.orders) return;
  signatures.orders = signature;
  state.orders = orders.map(rowToOrder);
  renderOrders();
  if (sheet.open) renderRequesters();
}
async function reloadConfig() {
  const { config, drinks } = await apiRequest("/api/config");
  const signature = JSON.stringify({ config, drinks });
  if (signature === signatures.config) return;
  const wasClosed = state.closed;
  signatures.config = signature;
  applyConfig(config);
  state.drinks = drinks.map(rowToDrink);
  renderTabs(); renderGrid(); renderClosed(); renderOrders();
  if (wasClosed !== state.closed) showToast(state.closed ? "주문이 마감되었습니다." : "주문이 재개되었습니다.", state.closed ? "warning" : "success");
  if (sheet.open) {
    if (state.closed || (draft.drink !== CUSTOM && !findDrink(draft.drink))) sheet.close();
    else renderSheet();
  }
}
function connectSync() {
  setInterval(async () => {
    try { await Promise.all([reloadOrders(), reloadConfig()]); } catch (e) { console.error("[sync]", e); }
  }, 5000);
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
  if (tile) openSheet(tile.dataset.drink);
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
  } else if (t.dataset.requester) { draft.requester = t.dataset.requester; renderRequesters(); }
});
$("#custom-price").addEventListener("input", renderTotal);
sheetForm.addEventListener("submit", (e) => { e.preventDefault(); submitSheet(); });
$("#open-orders").addEventListener("click", () => { renderOrders(); ordersSheet.showModal(); });
ordersSheet.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (e.target === ordersSheet || (t && t.hasAttribute("data-close"))) return ordersSheet.close();
  if (!t) return;
  if (t.dataset.delete) askDelete(t.dataset.delete);
  if (t.dataset.edit) {
    const order = state.orders.find((o) => o.id === t.dataset.edit);
    if (!order) return;
    ordersSheet.close();
    openSheet(findDrink(order.menuName) ? order.menuName : CUSTOM, order);
  }
});

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

loadState();
connectSync();
