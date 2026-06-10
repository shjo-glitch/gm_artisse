const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_SIZES = ["Tall", "Venti"];
const DEFAULT_OPTIONS = ["연하게", "덜달게", "디카페인", "더달게", "두유", "오트밀크"];
const DEFAULT_CATEGORIES = [
  { key: "coffee", label: "커피", sourceLabel: "Coffee" },
  { key: "real-fruit-beverage", label: "과일음료", sourceLabel: "Real fruit beverage" },
  { key: "tea", label: "차", sourceLabel: "Tea" },
  { key: "others", label: "기타", sourceLabel: "Others" },
];
const DEFAULT_DRINKS = [
  // 커피
  { category: "coffee", name: "카페 아메리카노", prices: { Tall: 4900, Venti: 5400 }, iceOnly: false },
  { category: "coffee", name: "카페라떼", prices: { Tall: 5600, Venti: 6100 }, iceOnly: false },
  { category: "coffee", name: "카푸치노", prices: { Tall: 5600, Venti: 6100 }, iceOnly: false },
  { category: "coffee", name: "캐러멜 마끼아또", prices: { Tall: 6500, Venti: 7000 }, iceOnly: false },
  { category: "coffee", name: "바닐라라떼", prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: "coffee", name: "스패니쉬라떼", prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: "coffee", name: "플랫화이트", prices: { Tall: 5600, Venti: 6100 }, iceOnly: false },
  // 과일음료
  { category: "real-fruit-beverage", name: "리얼후르츠 오렌지주스", prices: { Tall: 8300, Venti: 8800 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "리얼후르츠 자몽주스", prices: { Tall: 8300, Venti: 8800 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "리얼후르츠 토마토주스", prices: { Tall: 8300, Venti: 8800 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "로열자몽티", prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "클래식 레몬 허니 티", prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "시그니처 오렌지 에이드", prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "시그니처 레몬 에이드", prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "시그니처 자몽 에이드", prices: { Tall: 6700, Venti: 7200 }, iceOnly: false },
  // 차
  { category: "tea", name: "캐모마일", prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  { category: "tea", name: "페퍼민트", prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  { category: "tea", name: "잉글리쉬 블랙퍼스트", prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  { category: "tea", name: "루이보스", prices: { Tall: 5800, Venti: 6300 }, iceOnly: false },
  // 기타
  { category: "others", name: "데일리 요거트 스무디", prices: { Tall: 6600, Venti: 7100 }, iceOnly: false },
  { category: "others", name: "레몬 요거트 스무디", prices: { Tall: 6900, Venti: 7400 }, iceOnly: false },
  { category: "others", name: "발로나 초코 프라페", prices: { Tall: 6900, Venti: 7400 }, iceOnly: false },
  { category: "others", name: "발로나 더블 초콜릿", prices: { Tall: 6900, Venti: 7400 }, iceOnly: false },
  { category: "others", name: "애플밀크티", prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: "others", name: "잉글리쉬 티 라떼", prices: { Tall: 6300, Venti: 6800 }, iceOnly: false },
  { category: "others", name: "제주 말차 라떼", prices: { Tall: 6200, Venti: 6700 }, iceOnly: false },
  { category: "others", name: "발로나 자바칩 프라페", prices: { Tall: 6400, Venti: 6900 }, iceOnly: false },
];
const CUSTOM_MENU_VALUE = "__custom__";
const formatter = new Intl.NumberFormat("ko-KR");
const NEWS_API_URL = "https://cafeartisee.apis.flyground.co.kr/new-menu";
const NEWS_VIEW_BASE = "https://www.cafeartisee.com/news/new/view/?";

const state = {
  users: [],
  sizes: [...DEFAULT_SIZES],
  options: [...DEFAULT_OPTIONS],
  categories: [...DEFAULT_CATEGORIES],
  drinks: [...DEFAULT_DRINKS],
  orders: [],
  updatedAt: "",
  seasonalMenus: [],
  seasonalMenusLoading: false,
  seasonalMenusError: "",
};

const orderForm = document.querySelector("#order-form");
const editingOrderId = document.querySelector("#editing-order-id");
const menuSelect = document.querySelector("#menu-select");
const customMenuField = document.querySelector("#custom-menu-field");
const customMenuName = document.querySelector("#custom-menu-name");
const customPriceField = document.querySelector("#custom-price-field");
const customUnitPrice = document.querySelector("#custom-unit-price");
const requesterSelect = document.querySelector("#requester-select");
const drinkTemp = document.querySelector("#drink-temp");
const sizeSelect = document.querySelector("#size-select");
const optionList = document.querySelector("#option-list");
const orderNote = document.querySelector("#order-note");
const submitOrder = document.querySelector("#submit-order");
const cancelEdit = document.querySelector("#cancel-edit");
const orderList = document.querySelector("#order-list");
const emptyOrder = document.querySelector("#empty-order");
const totalCount = document.querySelector("#total-count");
const totalPrice = document.querySelector("#total-price");
const statementList = document.querySelector("#statement-list");
const emptyStatement = document.querySelector("#empty-statement");
const lastUpdated = document.querySelector("#last-updated");
const resetButton = document.querySelector("#reset-order");
const orderStatus = document.querySelector("#order-status");
const seasonMenuList = document.querySelector("#season-menu-list");
const seasonMenuEmpty = document.querySelector("#season-menu-empty");
const adminLink = document.querySelector("#admin-link");
const newOptionName = document.querySelector("#new-option-name");
const addOptionButton = document.querySelector("#add-option");
const ordersToggle = document.querySelector("#orders-toggle");
const ordersBody = document.querySelector("#orders-body");
const toastContainer = document.getElementById("toast-container");

// ── 유틸리티 ─────────────────────────────────────────────

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function normalizePrice(value) {
  const p = Number(value);
  return Number.isFinite(p) && p >= 0 ? Math.round(p) : 0;
}
function sortUsers(users) {
  return [...users].sort((a, b) => a.localeCompare(b, "ko-KR"));
}
function isoToKstDate(iso) {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
function formatUpdatedAt(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}
function setStatus(msg) { orderStatus.textContent = msg; }
function setUpdatedAt(v = new Date().toISOString()) {
  state.updatedAt = v;
  lastUpdated.textContent = formatUpdatedAt(v);
}
function showToast(message, type = "info", duration = 4000) {
  const icons = { info: "ℹ️", success: "✅", warning: "⚠️" };
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast__icon">${icons[type] || ""}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("toast--visible")));
  const hide = () => {
    el.classList.remove("toast--visible");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  };
  const timer = setTimeout(hide, duration);
  el.addEventListener("click", () => { clearTimeout(timer); hide(); });
}

// ── 행 변환 ───────────────────────────────────────────────

function rowToDrink(row) {
  return { category: row.category, name: row.name, prices: { Tall: row.tall_price, Venti: row.venti_price }, iceOnly: Boolean(row.ice_only) };
}
function rowToOrder(row) {
  return {
    id: row.id,
    menuName: row.menu_name,
    category: row.category,
    requester: row.requester,
    size: row.size,
    temp: row.temp,
    options: Array.isArray(row.options) ? row.options : [],
    note: row.note || "",
    unitPrice: row.unit_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── 상태 헬퍼 ─────────────────────────────────────────────

function findDrink(name) { return state.drinks.find((d) => d.name === name); }
function findCategory(key) { return state.categories.find((c) => c.key === key) || DEFAULT_CATEGORIES.find((c) => c.key === key) || { key, label: key }; }
function formatPrice(price) { return `${formatter.format(normalizePrice(price))}원`; }
function getTotalPrice() { return state.orders.reduce((s, o) => s + normalizePrice(o.unitPrice), 0); }
function getStatementGroups() {
  const groups = new Map();
  state.orders.forEach((o) => {
    const optKey = [...o.options].sort().join(", ");
    const key = `${o.menuName}|${o.size}|${optKey}`;
    const cur = groups.get(key) || { menuName: o.menuName, size: o.size, options: [...o.options].sort(), quantity: 0, total: 0 };
    cur.quantity += 1;
    cur.total += normalizePrice(o.unitPrice);
    groups.set(key, cur);
  });
  return [...groups.values()].sort((a, b) => a.menuName.localeCompare(b.menuName, "ko-KR") || a.size.localeCompare(b.size));
}
function diffDrinks(prev, next) {
  const prevMap = new Map(prev.map((d) => [d.name, d.prices.Tall]));
  const nextMap = new Map(next.map((d) => [d.name, d.prices.Tall]));
  return {
    added: next.filter((d) => !prevMap.has(d.name)).map((d) => d.name),
    removed: prev.filter((d) => !nextMap.has(d.name)).map((d) => d.name),
    changed: next.filter((d) => prevMap.has(d.name) && prevMap.get(d.name) !== d.prices.Tall).map((d) => d.name),
  };
}

// ── 렌더링 ────────────────────────────────────────────────

function setOrdersExpanded(open) {
  if (!ordersToggle || !ordersBody) return;
  if (open) { ordersBody.removeAttribute("hidden"); ordersToggle.textContent = "접기"; }
  else { ordersBody.setAttribute("hidden", ""); ordersToggle.textContent = "펼치기"; }
}
function renderSelectOptions(select, values, placeholder = "") {
  select.innerHTML = [placeholder ? `<option value="">${placeholder}</option>` : "", ...values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join("");
}
function getAvailableRequesters(currentOrderId = "") {
  const taken = new Set(state.orders.filter((o) => o.id !== currentOrderId).map((o) => o.requester));
  return sortUsers(state.users).filter((u) => !taken.has(u));
}
function renderRequesterOptions(currentOrderId = "") {
  const req = getAvailableRequesters(currentOrderId);
  renderSelectOptions(requesterSelect, req, req.length ? "주문자를 선택하세요" : "주문 가능한 사람이 없습니다");
}
function renderMenuOptions() {
  const groups = state.categories.map((cat) => {
    const drinks = state.drinks.filter((d) => d.category === cat.key);
    if (!drinks.length) return "";
    return `<optgroup label="${escapeHtml(cat.label)}">${drinks.map((d) => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join("")}</optgroup>`;
  }).join("");
  menuSelect.innerHTML = `<option value="">메뉴를 선택하세요</option>${groups}<option value="${CUSTOM_MENU_VALUE}">직접 입력</option>`;
}
function renderOptions() {
  const sel = new Set(getSelectedOptions());
  optionList.innerHTML = state.options.map((o) => `<label class="option-toggle"><input type="checkbox" name="orderOptions" value="${escapeHtml(o)}" ${sel.has(o) ? "checked" : ""}><span>${escapeHtml(o)}</span></label>`).join("");
}
function renderConfig() {
  renderMenuOptions();
  renderRequesterOptions(editingOrderId.value);
  renderSelectOptions(sizeSelect, state.sizes);
  renderOptions();
  sizeSelect.value = state.sizes[0] || "Tall";
  updateDrinkConstraints();
}
function renderStatement() {
  const groups = getStatementGroups();
  statementList.innerHTML = groups.map((g) => {
    const optText = g.options.length ? ` (${g.options.map(escapeHtml).join(", ")})` : "";
    return `<li class="statement-item"><span>${escapeHtml(g.menuName)} ${escapeHtml(g.size)}${optText} x${g.quantity}</span><span class="statement-item__divider" aria-hidden="true"></span><strong>${formatPrice(g.total)}</strong></li>`;
  }).join("");
  emptyStatement.classList.toggle("is-hidden", groups.length > 0);
  totalPrice.textContent = formatter.format(getTotalPrice());
}
function renderOrders() {
  orderList.innerHTML = state.orders.map((o) => `
    <li class="order-item" data-id="${escapeHtml(o.id)}">
      <div class="order-item__body">
        <strong>${escapeHtml(o.menuName)}</strong>
        <span>${escapeHtml(o.requester)} · ${escapeHtml(o.temp || "ICE")} · ${escapeHtml(o.size)} · ${escapeHtml(findCategory(o.category).label)}</span>
        ${o.options.length ? `<p class="option-summary">옵션: ${o.options.map(escapeHtml).join(", ")}</p>` : ""}
        ${o.note ? `<p>${escapeHtml(o.note)}</p>` : ""}
      </div>
      <div class="order-item__actions">
        <button class="button button--ghost" type="button" data-action="edit" data-id="${escapeHtml(o.id)}">수정</button>
        <button class="button button--danger" type="button" data-action="delete" data-id="${escapeHtml(o.id)}">삭제</button>
      </div>
    </li>`).join("");
  emptyOrder.classList.toggle("is-hidden", state.orders.length > 0);
  totalCount.textContent = formatter.format(state.orders.length);
  if (resetButton) resetButton.disabled = state.orders.length === 0;
  renderStatement();
}
function renderSeasonalMenus() {
  const items = Array.isArray(state.seasonalMenus) ? state.seasonalMenus : [];
  seasonMenuList.innerHTML = items.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)} — ${escapeHtml(item.startDate)} ~ ${escapeHtml(item.endDate)}</a></li>`).join("");
  if (items.length) { seasonMenuEmpty.innerHTML = ""; seasonMenuEmpty.classList.add("is-hidden"); return; }
  seasonMenuEmpty.classList.remove("is-hidden");
  if (state.seasonalMenusLoading) {
    seasonMenuEmpty.textContent = "공식 새메뉴 페이지에서 불러오는 중입니다.";
  } else if (state.seasonalMenusError) {
    seasonMenuEmpty.innerHTML = `공식 새메뉴 페이지를 불러오지 못했습니다. <a href="https://www.cafeartisee.com/news/new/" target="_blank" rel="noopener noreferrer">공식 새메뉴 페이지</a>에서 확인하세요.`;
  } else {
    seasonMenuEmpty.innerHTML = `현재 판매 중인 음료 행사가 없습니다. <a href="https://www.cafeartisee.com/news/new/" target="_blank" rel="noopener noreferrer">공식 새메뉴 페이지</a>에서 확인하세요.`;
  }
}

// ── 폼 헬퍼 ──────────────────────────────────────────────

function isCustomMenu() { return menuSelect.value === CUSTOM_MENU_VALUE; }
function updateDrinkConstraints() {
  const drink = (!isCustomMenu() && menuSelect.value) ? findDrink(menuSelect.value) : null;
  Array.from(sizeSelect.options).forEach((opt) => {
    if (opt.value === "Venti") {
      const noVenti = Boolean(drink && drink.prices.Venti === 0);
      opt.disabled = noVenti; opt.hidden = noVenti;
      if (noVenti && sizeSelect.value === "Venti") sizeSelect.value = "Tall";
    }
  });
  if (drinkTemp) {
    Array.from(drinkTemp.options).forEach((opt) => {
      if (opt.value === "HOT") {
        const iceOnly = Boolean(drink && drink.iceOnly);
        opt.disabled = iceOnly; opt.hidden = iceOnly;
        if (iceOnly && drinkTemp.value === "HOT") drinkTemp.value = "ICE";
      }
    });
  }
}
function updateCustomFields() {
  const custom = isCustomMenu();
  customMenuField.classList.toggle("is-hidden", !custom);
  customPriceField.classList.toggle("is-hidden", !custom);
  customMenuName.required = custom;
  customUnitPrice.required = custom;
  if (custom) customMenuName.focus();
}
function getSelectedOptions() {
  return [...document.querySelectorAll('input[name="orderOptions"]:checked')].map((i) => i.value);
}
function setSelectedOptions(options) {
  const sel = new Set(options || []);
  document.querySelectorAll('input[name="orderOptions"]').forEach((i) => { i.checked = sel.has(i.value); });
}
function getSelectedMenuName() { return isCustomMenu() ? customMenuName.value.trim() : menuSelect.value.trim(); }
function getSelectedUnitPrice() {
  if (isCustomMenu()) return normalizePrice(customUnitPrice.value);
  const drink = findDrink(menuSelect.value);
  return normalizePrice(drink?.prices?.[sizeSelect.value]);
}
function getFormPayload() {
  return { menuName: getSelectedMenuName(), requester: requesterSelect.value, size: sizeSelect.value, temp: drinkTemp ? drinkTemp.value : "ICE", options: getSelectedOptions(), note: orderNote.value.trim(), unitPrice: getSelectedUnitPrice() };
}
function validatePayload(payload) {
  if (!payload.menuName) return "메뉴 이름을 선택하거나 입력하세요.";
  if (!state.users.includes(payload.requester)) return "주문자를 선택하세요.";
  if (state.orders.some((o) => o.requester === payload.requester && o.id !== editingOrderId.value)) return "이미 주문한 주문자입니다.";
  if (!state.sizes.includes(payload.size)) return "사이즈를 선택하세요.";
  if (isCustomMenu() && payload.unitPrice <= 0) return "직접 입력 메뉴는 가격을 입력하세요.";
  return "";
}
function resetForm() {
  editingOrderId.value = "";
  orderForm.reset();
  sizeSelect.value = state.sizes[0] || "Tall";
  if (drinkTemp) drinkTemp.value = "ICE";
  setSelectedOptions([]);
  customMenuField.classList.add("is-hidden");
  customPriceField.classList.add("is-hidden");
  customMenuName.required = false;
  customUnitPrice.required = false;
  submitOrder.textContent = "주문 추가";
  cancelEdit.classList.add("is-hidden");
  updateDrinkConstraints();
  renderRequesterOptions();
}
function startEdit(id) {
  const o = state.orders.find((item) => item.id === id);
  if (!o) return;
  editingOrderId.value = o.id;
  renderRequesterOptions(o.id);
  if (state.drinks.some((d) => d.name === o.menuName)) { menuSelect.value = o.menuName; customMenuName.value = ""; customUnitPrice.value = ""; }
  else { menuSelect.value = CUSTOM_MENU_VALUE; customMenuName.value = o.menuName; customUnitPrice.value = o.unitPrice; }
  updateCustomFields();
  updateDrinkConstraints();
  requesterSelect.value = o.requester;
  sizeSelect.value = o.size;
  if (drinkTemp) drinkTemp.value = o.temp || "ICE";
  setSelectedOptions(o.options);
  orderNote.value = o.note;
  submitOrder.textContent = "주문 수정";
  cancelEdit.classList.remove("is-hidden");
  orderForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Supabase 데이터 로드 ──────────────────────────────────

async function loadState() {
  setStatus("데이터를 불러오는 중입니다...");
  try {
    const [configRes, drinksRes, ordersRes] = await Promise.all([
      db.from("config").select("*").single(),
      db.from("drinks").select("*").order("sort_order", { ascending: true }),
      db.from("orders").select("*").order("created_at", { ascending: true }),
    ]);
    if (configRes.data) {
      state.users = sortUsers(configRes.data.users || []);
      state.options = configRes.data.options?.length ? configRes.data.options : [...DEFAULT_OPTIONS];
    }
    if (drinksRes.data?.length) state.drinks = drinksRes.data.map(rowToDrink);
    if (ordersRes.data) state.orders = ordersRes.data.map(rowToOrder);
    renderConfig();
    renderOrders();
    setUpdatedAt(new Date().toISOString());
    setStatus("데이터를 불러왔습니다.");
  } catch (e) {
    console.error("[loadState]", e);
    setStatus("데이터를 불러오지 못했습니다. supabase-config.js 설정을 확인하세요.");
  }
}

async function reloadOrders() {
  const { data } = await db.from("orders").select("*").order("created_at", { ascending: true });
  if (data) {
    state.orders = data.map(rowToOrder);
    setUpdatedAt(new Date().toISOString());
    renderOrders();
  }
}

async function reloadConfig(notify = true) {
  const [configRes, drinksRes] = await Promise.all([
    db.from("config").select("*").single(),
    db.from("drinks").select("*").order("sort_order", { ascending: true }),
  ]);
  if (configRes.data) {
    const prevUsers = [...state.users];
    state.users = sortUsers(configRes.data.users || []);
    state.options = configRes.data.options?.length ? configRes.data.options : [...DEFAULT_OPTIONS];
    if (notify) {
      const added = state.users.filter((u) => !prevUsers.includes(u));
      const removed = prevUsers.filter((u) => !state.users.includes(u));
      if (added.length) showToast(`팀원 추가: ${added.join(", ")}`, "success");
      if (removed.length) showToast(`팀원 제외: ${removed.join(", ")}`, "warning");
    }
  }
  if (drinksRes.data) {
    const prevDrinks = [...state.drinks];
    state.drinks = drinksRes.data.length ? drinksRes.data.map(rowToDrink) : [...DEFAULT_DRINKS];
    if (notify) {
      const { added, removed, changed } = diffDrinks(prevDrinks, state.drinks);
      if (added.length) showToast(`신규 메뉴 ${added.length}개 추가: ${added.join(", ")}`, "success");
      if (removed.length) showToast(`메뉴 ${removed.length}개 삭제: ${removed.join(", ")}`, "warning");
      if (changed.length) showToast(`메뉴 가격 변경: ${changed.join(", ")}`, "info");
    }
  }
  renderConfig();
  renderOrders();
  setUpdatedAt(new Date().toISOString());
}

// ── Supabase CRUD ─────────────────────────────────────────

async function createOrder(payload) {
  const drink = findDrink(payload.menuName);
  const { data, error } = await db.from("orders").insert({
    menu_name: payload.menuName,
    category: drink ? drink.category : (payload.category || "others"),
    requester: payload.requester,
    size: payload.size,
    temp: payload.temp,
    options: payload.options,
    note: payload.note,
    unit_price: payload.unitPrice,
  }).select().single();
  if (error) throw new Error(error.message);
  state.orders = [...state.orders, rowToOrder(data)];
  renderOrders();
  setOrdersExpanded(true);
  setUpdatedAt(new Date().toISOString());
  setStatus("주문을 추가했습니다.");
}

async function updateOrder(id, payload) {
  const drink = findDrink(payload.menuName);
  const { data, error } = await db.from("orders").update({
    menu_name: payload.menuName,
    category: drink ? drink.category : (payload.category || "others"),
    requester: payload.requester,
    size: payload.size,
    temp: payload.temp,
    options: payload.options,
    note: payload.note,
    unit_price: payload.unitPrice,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  state.orders = state.orders.map((o) => o.id === id ? rowToOrder(data) : o);
  renderOrders();
  setUpdatedAt(new Date().toISOString());
  setStatus("주문을 수정했습니다.");
}

async function deleteOrder(id) {
  state.orders = state.orders.filter((o) => o.id !== id);
  renderOrders();
  const { error } = await db.from("orders").delete().eq("id", id);
  if (error) { await reloadOrders(); setStatus("주문 삭제에 실패했습니다."); return; }
  setUpdatedAt(new Date().toISOString());
  setStatus("주문을 삭제했습니다.");
}

async function addOption() {
  const option = newOptionName.value.trim();
  if (!option) return setStatus("추가할 옵션명을 입력하세요.");
  const nextOptions = [...new Set([...state.options, option])];
  const { error } = await db.from("config").update({ options: nextOptions }).eq("id", 1);
  if (error) { setStatus("옵션 추가에 실패했습니다."); return; }
  state.options = nextOptions;
  renderOptions();
  newOptionName.value = "";
  setStatus("옵션을 추가했습니다.");
}

async function resetOrders() {
  state.orders = [];
  renderOrders();
  const { error } = await db.from("orders").delete().not("id", "is", null);
  if (error) { await reloadOrders(); setStatus("초기화에 실패했습니다."); return; }
  setUpdatedAt(new Date().toISOString());
  setStatus("전체 주문을 초기화했습니다.");
}

// ── Realtime ──────────────────────────────────────────────

function connectRealtime() {
  db.channel("app-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
      reloadOrders();
      showToast("실시간 변경을 반영했습니다.", "info");
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "drinks" }, () => { reloadConfig(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "config" }, () => { reloadConfig(); })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setStatus("실시간 동기화 연결됨.");
      if (status === "CHANNEL_ERROR") setStatus("실시간 동기화 연결에 실패했습니다.");
    });
}

// ── 시즌 메뉴 ─────────────────────────────────────────────

async function loadSeasonalMenus() {
  state.seasonalMenusLoading = true;
  renderSeasonalMenus();
  try {
    const res = await fetch(NEWS_API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const now = new Date();
    state.seasonalMenus = (Array.isArray(data) ? data : [])
      .filter((item) => item.title?.includes("음료"))
      .filter((item) => {
        if (now < new Date(item.release_date)) return false;
        if (!item.expire_date) return true;
        return now <= new Date(new Date(item.expire_date).getTime() + 24 * 60 * 60 * 1000 - 1);
      })
      .map((item) => ({
        title: item.title,
        startDate: isoToKstDate(item.release_date),
        endDate: item.expire_date ? isoToKstDate(item.expire_date) : "상시",
        url: NEWS_VIEW_BASE + item.id,
      }));
    state.seasonalMenusError = "";
  } catch (e) {
    state.seasonalMenusError = e.message;
  } finally {
    state.seasonalMenusLoading = false;
    renderSeasonalMenus();
  }
}

// ── 이벤트 ────────────────────────────────────────────────

menuSelect.addEventListener("change", () => { updateCustomFields(); updateDrinkConstraints(); });
sizeSelect.addEventListener("change", () => { if (!isCustomMenu()) setStatus("사이즈를 변경했습니다."); });
orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = getFormPayload();
  const err = validatePayload(payload);
  if (err) return setStatus(err);
  setStatus("처리 중...");
  try {
    const editingId = editingOrderId.value;
    if (editingId) await updateOrder(editingId, payload);
    else await createOrder(payload);
    resetForm();
  } catch (ex) {
    setStatus(`오류: ${ex.message}`);
  }
});
cancelEdit.addEventListener("click", resetForm);
if (resetButton) resetButton.addEventListener("click", () => { resetOrders(); });
if (ordersToggle) ordersToggle.addEventListener("click", () => { setOrdersExpanded(ordersBody.hasAttribute("hidden")); });
addOptionButton.addEventListener("click", addOption);
newOptionName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } });
orderList.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action][data-id]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "edit") startEdit(id);
  if (action === "delete") deleteOrder(id);
});

// ── 초기화 ────────────────────────────────────────────────

renderConfig();
renderOrders();
setUpdatedAt();
loadState();
connectRealtime();
loadSeasonalMenus();
