const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_OPTIONS = ["연하게", "덜달게", "디카페인", "더달게", "두유", "오트밀크"];
const DEFAULT_CATEGORIES = [
  { key: "coffee", label: "커피", sourceLabel: "Coffee" },
  { key: "real-fruit-beverage", label: "과일음료", sourceLabel: "Real fruit beverage" },
  { key: "tea", label: "차", sourceLabel: "Tea" },
  { key: "others", label: "기타", sourceLabel: "Others" },
];
const DEFAULT_DRINKS = [
  // 커피
  { category: "coffee", name: "카페 아메리카노", prices: { Tall: 4900, Grande:5400 }, iceOnly: false },
  { category: "coffee", name: "카페라떼", prices: { Tall: 5600, Grande:6100 }, iceOnly: false },
  { category: "coffee", name: "카푸치노", prices: { Tall: 5600, Grande:6100 }, iceOnly: false },
  { category: "coffee", name: "캐러멜 마끼아또", prices: { Tall: 6500, Grande:7000 }, iceOnly: false },
  { category: "coffee", name: "바닐라라떼", prices: { Tall: 6300, Grande:6800 }, iceOnly: false },
  { category: "coffee", name: "스패니쉬라떼", prices: { Tall: 6300, Grande:6800 }, iceOnly: false },
  { category: "coffee", name: "플랫화이트", prices: { Tall: 5600, Grande:6100 }, iceOnly: false },
  // 과일음료
  { category: "real-fruit-beverage", name: "리얼후르츠 오렌지주스", prices: { Tall: 8300, Grande:8800 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "리얼후르츠 자몽주스", prices: { Tall: 8300, Grande:8800 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "리얼후르츠 토마토주스", prices: { Tall: 8300, Grande:8800 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "로열자몽티", prices: { Tall: 6700, Grande:7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "클래식 레몬 허니 티", prices: { Tall: 6700, Grande:7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "시그니처 오렌지 에이드", prices: { Tall: 6700, Grande:7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "시그니처 레몬 에이드", prices: { Tall: 6700, Grande:7200 }, iceOnly: false },
  { category: "real-fruit-beverage", name: "시그니처 자몽 에이드", prices: { Tall: 6700, Grande:7200 }, iceOnly: false },
  // 차
  { category: "tea", name: "캐모마일", prices: { Tall: 5800, Grande:6300 }, iceOnly: false },
  { category: "tea", name: "페퍼민트", prices: { Tall: 5800, Grande:6300 }, iceOnly: false },
  { category: "tea", name: "잉글리쉬 블랙퍼스트", prices: { Tall: 5800, Grande:6300 }, iceOnly: false },
  { category: "tea", name: "루이보스", prices: { Tall: 5800, Grande:6300 }, iceOnly: false },
  // 기타
  { category: "others", name: "데일리 요거트 스무디", prices: { Tall: 6600, Grande:7100 }, iceOnly: false },
  { category: "others", name: "레몬 요거트 스무디", prices: { Tall: 6900, Grande:7400 }, iceOnly: false },
  { category: "others", name: "발로나 초코 프라페", prices: { Tall: 6900, Grande:7400 }, iceOnly: false },
  { category: "others", name: "발로나 더블 초콜릿", prices: { Tall: 6900, Grande:7400 }, iceOnly: false },
  { category: "others", name: "애플밀크티", prices: { Tall: 6300, Grande:6800 }, iceOnly: false },
  { category: "others", name: "잉글리쉬 티 라떼", prices: { Tall: 6300, Grande:6800 }, iceOnly: false },
  { category: "others", name: "제주 말차 라떼", prices: { Tall: 6200, Grande:6700 }, iceOnly: false },
  { category: "others", name: "발로나 자바칩 프라페", prices: { Tall: 6400, Grande:6900 }, iceOnly: false },
];

const userEditor = document.querySelector("#user-editor");
const optionEditor = document.querySelector("#option-editor");
const usersTextarea = document.querySelector("#users-textarea");
const reloadUsersBtn = document.querySelector("#reload-users");
const userPreview = document.querySelector("#user-preview");
const optionsTextarea = document.querySelector("#options-textarea");
const reloadOptionsBtn = document.querySelector("#reload-options");
const optionPreview = document.querySelector("#option-preview");
const drinkEditor = document.querySelector("#drink-editor");
const categorySelect = document.querySelector("#new-drink-category");
const drinksTextarea = document.querySelector("#drinks-textarea");
const newDrinkName = document.querySelector("#new-drink-name");
const newDrinkTall = document.querySelector("#new-drink-tall");
const newDrinkVenti = document.querySelector("#new-drink-venti");
const addDrinkBtn = document.querySelector("#add-drink");
const reloadDrinksBtn = document.querySelector("#reload-drinks");
const drinkPreview = document.querySelector("#drink-preview");
const adminStatus = document.querySelector("#admin-status");

let categories = [...DEFAULT_CATEGORIES];
let users = [];
let options = [...DEFAULT_OPTIONS];
let drinks = DEFAULT_DRINKS.map(normalizeDrink);
let updatedAt = "";

// ── 유틸리티 ─────────────────────────────────────────────

function escapeHtml(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function sortUsers(values) { return [...values].sort((a, b) => a.localeCompare(b, "ko-KR")); }
function normalizePrice(value) { const p = Number(value); return Number.isFinite(p) && p >= 0 ? Math.round(p) : 0; }
function formatPrice(price) { return `${new Intl.NumberFormat("ko-KR").format(normalizePrice(price))}원`; }

function normalizeUsers(values) {
  const raw = Array.isArray(values) ? values : String(values || "").split("|");
  const seen = new Set();
  const out = [];
  raw.map((v) => String(v || "").trim()).filter(Boolean).forEach((u) => { if (!seen.has(u)) { seen.add(u); out.push(u); } });
  return sortUsers(out);
}
function normalizeOptions(values) {
  const raw = Array.isArray(values) ? values : String(values || "").split("|");
  const seen = new Set();
  const out = [];
  raw.map((v) => String(v || "").trim()).filter(Boolean).forEach((o) => { if (!seen.has(o)) { seen.add(o); out.push(o); } });
  return out.length ? out : [...DEFAULT_OPTIONS];
}
function normalizeDrink(drink) {
  if (typeof drink === "string") return { category: "others", name: drink.trim(), prices: { Tall: 0, Grande:0 }, iceOnly: false };
  return {
    category: String(drink?.category || "others"),
    name: String(drink?.name || "").trim(),
    prices: { Tall: normalizePrice(drink?.prices?.Tall ?? drink?.tallPrice), Grande:normalizePrice(drink?.prices?.Grande ?? drink?.ventiPrice) },
    iceOnly: Boolean(drink?.iceOnly),
  };
}
function uniqueDrinks(values) {
  const seen = new Set();
  const out = (Array.isArray(values) ? values : []).map(normalizeDrink).filter((d) => d.name).filter((d) => {
    const k = `${d.category}:${d.name}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return out.length ? out : DEFAULT_DRINKS.map(normalizeDrink);
}

// ── 직렬화/파싱 ───────────────────────────────────────────

function serializeUsers() { return users.join("|"); }
function serializeOptions() { return options.join("|"); }
function serializeDrinks() {
  return drinks.map((d) => `${d.category}|${d.name}|${d.prices.Tall}|${d.prices.Grande}${d.iceOnly ? "|Y" : ""}`).join("\n");
}
function parseUsersTextarea() { return normalizeUsers(usersTextarea.value); }
function parseOptionsTextarea() { return normalizeOptions(optionsTextarea.value); }
function parseTextarea() {
  return uniqueDrinks(drinksTextarea.value.split("\n").map((line) => {
    const [category = "others", name = "", tall = "0", venti = "0", iceOnlyFlag = ""] = line.split("|").map((p) => p.trim());
    return { category, name, prices: { Tall: normalizePrice(tall), Grande:normalizePrice(venti) }, iceOnly: iceOnlyFlag.toUpperCase() === "Y" };
  }));
}

// ── 렌더링 ────────────────────────────────────────────────

function renderCategorySelect() {
  categorySelect.innerHTML = categories.map((c) => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`).join("");
}
function renderUsers() {
  users = normalizeUsers(users);
  usersTextarea.value = serializeUsers();
  userPreview.innerHTML = `<p class="help-text">현재 ${users.length}명</p><ul>${users.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>`;
}
function renderOptions() {
  options = normalizeOptions(options);
  optionsTextarea.value = serializeOptions();
  optionPreview.innerHTML = `<p class="help-text">현재 ${options.length}개</p><ul>${options.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>`;
}
function renderDrinksPreview() {
  drinkPreview.innerHTML = categories.map((cat) => {
    const catDrinks = drinks.filter((d) => d.category === cat.key);
    if (!catDrinks.length) return "";
    return `<section class="drink-category"><h3>${escapeHtml(cat.label)}</h3><ul>${catDrinks.map((d) => {
      const ventiLabel = d.prices.Grande === 0 ? "Grande 없음" : `Grande ${formatPrice(d.prices.Grande)}`;
      const iceLabel = d.iceOnly ? " · ICE only" : "";
      return `<li><strong>${escapeHtml(d.name)}</strong><span>Tall ${formatPrice(d.prices.Tall)} · ${ventiLabel}${iceLabel}</span></li>`;
    }).join("")}</ul></section>`;
  }).join("");
}
function render() {
  renderCategorySelect();
  renderUsers();
  renderOptions();
  drinksTextarea.value = serializeDrinks();
  renderDrinksPreview();
}
function setStatus(msg) {
  adminStatus.textContent = updatedAt ? `${msg} 마지막 변경: ${new Date(updatedAt).toLocaleString("ko-KR")}` : msg;
}

// ── 인증 ──────────────────────────────────────────────────

function checkAuth() {
  if (!ADMIN_PASSWORD) return true;
  return sessionStorage.getItem("admin_auth") === ADMIN_PASSWORD;
}

// ── Supabase 로드 ─────────────────────────────────────────

async function loadAdminData() {
  render();
  setStatus("서버에서 데이터를 불러오는 중입니다...");
  try {
    const [configRes, drinksRes] = await Promise.all([
      db.from("config").select("*").single(),
      db.from("drinks").select("*").order("sort_order", { ascending: true }),
    ]);
    if (configRes.data) {
      users = normalizeUsers(configRes.data.users || []);
      options = normalizeOptions(configRes.data.options || []);
    }
    if (drinksRes.data) {
      drinks = drinksRes.data.length
        ? drinksRes.data.map((r) => normalizeDrink({ category: r.category, name: r.name, prices: { Tall: r.tall_price, Grande:r.venti_price }, iceOnly: r.ice_only }))
        : DEFAULT_DRINKS.map(normalizeDrink);
    }
    updatedAt = new Date().toISOString();
    render();
    setStatus("서버 관리 데이터를 불러왔습니다.");
  } catch (e) {
    console.error("[loadAdminData]", e);
    setStatus("데이터 로드 실패. supabase-config.js 설정을 확인하세요.");
  }
}

// ── Supabase 저장 ─────────────────────────────────────────

async function saveUsers() {
  users = parseUsersTextarea();
  renderUsers();
  try {
    const { error } = await db.from("config").update({ users }).eq("id", 1);
    if (error) throw error;
    updatedAt = new Date().toISOString();
    setStatus("팀원 명단을 서버에 저장했습니다.");
  } catch (e) {
    setStatus(`저장 실패: ${e.message}`);
  }
}

async function saveOptions() {
  options = parseOptionsTextarea();
  renderOptions();
  try {
    const { error } = await db.from("config").update({ options }).eq("id", 1);
    if (error) throw error;
    updatedAt = new Date().toISOString();
    setStatus("옵션 목록을 서버에 저장했습니다.");
  } catch (e) {
    setStatus(`저장 실패: ${e.message}`);
  }
}

async function saveDrinks() {
  drinks = parseTextarea();
  render();
  try {
    await db.from("drinks").delete().not("name", "is", null);
    const rows = drinks.map((d, i) => ({
      category: d.category,
      name: d.name,
      tall_price: d.prices.Tall,
      venti_price: d.prices.Grande,
      ice_only: d.iceOnly,
      sort_order: i,
    }));
    const { error } = await db.from("drinks").insert(rows);
    if (error) throw error;
    updatedAt = new Date().toISOString();
    setStatus("음료 리스트를 서버에 저장했습니다.");
  } catch (e) {
    setStatus(`저장 실패: ${e.message}`);
  }
}

function appendDrink() {
  const iceOnlyCheckbox = document.querySelector("#new-drink-ice-only");
  const next = {
    category: categorySelect.value,
    name: newDrinkName.value.trim(),
    prices: { Tall: normalizePrice(newDrinkTall.value), Grande:normalizePrice(newDrinkVenti.value) },
    iceOnly: iceOnlyCheckbox ? iceOnlyCheckbox.checked : false,
  };
  if (!next.name) return setStatus("추가할 음료 이름을 입력하세요.");
  drinks = uniqueDrinks([...parseTextarea(), next]);
  newDrinkName.value = ""; newDrinkTall.value = ""; newDrinkVenti.value = "";
  if (iceOnlyCheckbox) iceOnlyCheckbox.checked = false;
  render();
  setStatus("음료를 목록에 추가했습니다. 서버 반영은 저장 버튼을 누르세요.");
}

// ── 이벤트 ────────────────────────────────────────────────

userEditor.addEventListener("submit", (e) => { e.preventDefault(); saveUsers(); });
optionEditor.addEventListener("submit", (e) => { e.preventDefault(); saveOptions(); });
drinkEditor.addEventListener("submit", (e) => { e.preventDefault(); saveDrinks(); });
addDrinkBtn.addEventListener("click", appendDrink);
reloadUsersBtn.addEventListener("click", loadAdminData);
reloadOptionsBtn.addEventListener("click", loadAdminData);
reloadDrinksBtn.addEventListener("click", loadAdminData);

// ── 초기화 ────────────────────────────────────────────────

if (checkAuth()) {
  loadAdminData();
} else {
  window.location.replace("index.html");
}
