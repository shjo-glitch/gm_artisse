// 아띠제 관리자 화면: 주문 현황(마감·새 주문·팀즈 알림·독촉), 팀원·요청사항(바로 저장), 메뉴·유료 옵션(저장 바에서 한 번에 저장), 새메뉴 자동 반영
const CATEGORIES = [
  { key: "season", label: "시즌" },
  { key: "coffee", label: "에스프레소" },
  { key: "cold-brew", label: "콜드브루" },
  { key: "smoothie-ade", label: "스무디&에이드" },
  { key: "tea", label: "티&기타" },
  { key: "frappe", label: "프라페" },
  { key: "real-fruit-beverage", label: "리얼후르츠" },
  { key: "bottled", label: "병음료" },
  { key: "others", label: "기타" },
];
// 아티제 앱에서 수집한 옵션 그룹 (2026-10 기준)
const EXTRA_PRESETS = {
  addon: { title: "옵션 추가", mode: "count", max: 5, choices: [{ name: "샷 추가", price: 700 }, { name: "바닐라 시럽 추가", price: 700 }, { name: "휘핑 추가", price: 700 }] },
  decaf: { title: "디카페인 변경", mode: "pick", max: 1, choices: [{ name: "디카페인", price: 400 }] },
  milk: { title: "우유 변경", mode: "pick", max: 1, choices: [{ name: "저지방우유", price: 0 }, { name: "두유", price: 0 }, { name: "오트밀크", price: 500 }] },
  empty: { title: "", mode: "count", max: 1, choices: [{ name: "", price: 0 }] },
};

const $ = (sel) => document.querySelector(sel);
const formatter = new Intl.NumberFormat("ko-KR");
const state = {
  members: [],
  membersSignature: "",
  teams: { channel: false, dm: false },
  requests: [],
  drinks: [],
  savedDrinks: "[]",
  extrasDrink: "",
};

// ── 유틸리티 ─────────────────────────────────────────────

function escapeHtml(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function won(v) { return `${formatter.format(Math.max(0, Math.round(Number(v) || 0)))}원`; }
function price(v) { const p = Number(v); return Number.isFinite(p) && p >= 0 ? Math.round(p) : 0; }
// 줄바꿈, 쉼표(전각 포함), "|" 어느 것으로 나눠도 받는다.
function splitNames(text) { return String(text || "").split(/[\n,，、|]+/).map((v) => v.trim()).filter(Boolean); }
function unique(values) { return [...new Set(values)]; }
function categoryLabel(key) { return (CATEGORIES.find((c) => c.key === key) || { label: key }).label; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function showToast(message, type = "success", duration = 3000) {
  const icons = { info: "ℹ️", success: "✅", warning: "⚠️" };
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast__icon">${icons[type] || ""}</span><span>${escapeHtml(message)}</span>`;
  $("#toast-container").appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("toast--visible")));
  setTimeout(() => { el.classList.remove("toast--visible"); setTimeout(() => el.remove(), 300); }, duration);
}
async function apiRequest(path, { method = "GET", body } = {}) {
  const headers = {
    "x-admin-id": encodeURIComponent(sessionStorage.getItem("admin_id") || ""),
    "x-admin-password": sessionStorage.getItem("admin_password") || "",
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { logout(); throw new Error("관리자 인증이 필요합니다."); }
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}

function ago(iso) {
  if (!iso) return "";
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!(minutes >= 0)) return "";
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric" });
}
function kstTime(iso) {
  return iso ? new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

// 되돌리기 어려운 동작은 확인 창에서 한 번 더 묻는다.
// teams: true면 "팀즈 채널에 알림" 체크와 덧붙일 말을 함께 받아 onOk({ notify, note })로 넘긴다.
let pendingConfirm = null;
function askConfirm({ title, message, ok = "확인", onOk, teams = false, notePlaceholder = "알림에 덧붙일 말 (선택)" }) {
  $("#confirm-note").placeholder = notePlaceholder;
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  $("#confirm-ok").textContent = ok;
  $("#confirm-teams").classList.toggle("is-hidden", !teams);
  $("#confirm-notify").checked = teams && state.teams.channel;
  $("#confirm-notify").disabled = !state.teams.channel;
  $("#confirm-notify-label").textContent = state.teams.channel ? "팀즈 채널에 알림 보내기" : "팀즈 채널에 알림 보내기 (채널 알림 주소 미설정)";
  $("#confirm-note").value = "";
  pendingConfirm = onOk;
  $("#confirm-sheet").showModal();
}

// ── 데이터 ────────────────────────────────────────────────

function rowToDrink(row) {
  return {
    category: row.category || "others",
    name: row.name || "",
    tall: price(row.tall_price),
    grande: price(row.grande_price),
    temp: row.ice_only ? "ICE" : row.hot_only ? "HOT" : "",
    extras: Array.isArray(row.extras) ? row.extras : [],
  };
}
function drinkToRow(d, index) {
  return { category: d.category, name: d.name.trim(), tall_price: d.tall, grande_price: d.grande, ice_only: d.temp === "ICE", hot_only: d.temp === "HOT", sort_order: index, extras: d.extras };
}
// 저장할 때 카테고리 순서대로 정렬해 sort_order를 다시 매긴다.
function orderedDrinks() {
  return CATEGORIES.flatMap((c) => state.drinks.filter((d) => d.category === c.key));
}
function isDirty() { return JSON.stringify(state.drinks) !== state.savedDrinks; }
async function loadAll() {
  try {
    const { config, drinks } = await apiRequest("/api/config");
    state.requests = config.options || [];
    state.drinks = drinks.map(rowToDrink);
    state.savedDrinks = JSON.stringify(state.drinks);
    if (!state.drinks.some((d) => d.name === state.extrasDrink)) state.extrasDrink = state.drinks[0]?.name || "";
    renderAll();
  } catch (e) {
    showToast(`관리 데이터를 불러오지 못했습니다: ${e.message}`, "warning");
  }
}

// ── 팀원 (MS 계정과 연결되는 명단, 바로 저장) ────────────────

// 한 줄에 한 명: "이름" 또는 "이름 이메일"(엔트라에서 복사한 "이름, 이메일"도 받는다).
// 이메일이 없는 줄은 예전처럼 쉼표·| 로 여러 이름을 나눈다.
function parseMemberLines(text) {
  const emailRe = /[^\s<>(),;|]+@[^\s<>(),;|]+/g;
  return String(text || "").split(/\n+/).flatMap((line) => {
    const emails = line.match(emailRe) || [];
    if (!emails.length) return splitNames(line).map((name) => ({ name, email: "" }));
    const parts = emails.length === 1 ? [line] : line.split(/[,;|]+/);
    return parts.map((part) => {
      const email = (part.match(emailRe) || [""])[0];
      return { name: part.replace(email, "").replace(/[<>()"',;|\t]/g, " ").trim().replace(/\s+/g, " "), email };
    });
  }).filter((e) => e.name);
}
function membersSignature(members) {
  return JSON.stringify(members.map((m) => [m.id, m.name, m.email, m.linked, m.last_login_at]));
}
function renderTeam(force = false) {
  // 10초마다 다시 읽을 때 입력 중인 칸을 덮어쓰지 않는다.
  const signature = membersSignature(state.members);
  if (!force && (signature === state.membersSignature || $("#team-body").contains(document.activeElement))) return;
  state.membersSignature = signature;
  const filter = $("#team-filter").value.trim().toLowerCase();
  const shown = state.members.filter((m) => !filter || m.name.toLowerCase().includes(filter) || (m.email || "").includes(filter));
  $("#team-count").textContent = `${state.members.length}명`;
  $("#team-body").innerHTML = shown.map((m) => `<tr data-member="${m.id}">
      <td><input data-member-field="name" value="${escapeHtml(m.name)}" aria-label="이름"></td>
      <td><input data-member-field="email" type="email" value="${escapeHtml(m.email || "")}" placeholder="회사 이메일" aria-label="${escapeHtml(m.name)} 이메일"></td>
      <td>${m.linked ? `<span class="admin-badge admin-badge--ok">연결됨</span> <small class="admin-muted">${escapeHtml(ago(m.last_login_at))}</small>` : `<span class="admin-badge">로그인 전</span>`}</td>
      <td class="admin-row-actions">
        ${m.linked ? `<button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-unlink="${m.id}">연결 해제</button>` : ""}
        <button type="button" class="admin-icon-btn admin-icon-btn--danger" data-remove-member="${m.id}" aria-label="${escapeHtml(m.name)} 삭제">✕</button>
      </td>
    </tr>`).join("")
    || `<tr><td colspan="4" class="admin-muted">${filter ? "검색 결과가 없습니다." : "등록된 팀원이 없습니다."}</td></tr>`;
}
async function addMembers(e) {
  e.preventDefault();
  const entries = parseMemberLines($("#team-input").value);
  if (!entries.length) return;
  try {
    const { added, updated, skipped } = await apiRequest("/api/admin/members", { method: "POST", body: { entries } });
    $("#team-input").value = "";
    autoGrow($("#team-input"));
    const parts = [added.length ? `${added.length}명 추가` : "", updated.length ? `${updated.length}명 이메일 저장` : "", skipped.length ? `${skipped.length}명 건너뜀(${skipped.map((s) => `${s.name}: ${s.reason}`).join(", ")})` : ""].filter(Boolean);
    showToast(parts.join(" · ") || "바뀐 내용이 없습니다.", added.length || updated.length ? "success" : "info", 5000);
  } catch (err) {
    showToast(`추가 실패: ${err.message}`, "warning");
  }
  await loadRound();
  renderTeam(true);
}
async function updateMember(input) {
  const id = Number(input.closest("[data-member]").dataset.member);
  const member = state.members.find((m) => m.id === id);
  const field = input.dataset.memberField;
  const value = input.value.trim();
  if (!member || value === (member[field] || "")) return;
  if (field === "name" && !value) { input.value = member.name; return showToast("이름은 비울 수 없습니다.", "warning"); }
  try {
    await apiRequest(`/api/admin/members/${id}`, { method: "PATCH", body: { [field]: value } });
    showToast(field === "email" && member.linked ? `${member.name}님 이메일을 바꿔서 MS 계정 연결을 풀었습니다. 다음 로그인 때 다시 연결됩니다.` : `${value || member.name}님 정보를 저장했습니다.`, "success", 4500);
  } catch (err) {
    showToast(`저장 실패: ${err.message}`, "warning");
  }
  await loadRound();
  renderTeam(true);
}

// ── 요청사항 (바로 저장) ──────────────────────────────────

async function saveConfig(patch, message) {
  try {
    const { config } = await apiRequest("/api/config", { method: "PATCH", body: patch });
    state.requests = config.options || [];
    renderChips();
    showToast(message);
  } catch (e) {
    showToast(`저장 실패: ${e.message}`, "warning");
    renderChips();
  }
}
function renderChips() {
  $("#requests-count").textContent = `${state.requests.length}개`;
  $("#requests-list").innerHTML = state.requests.map((r) => `<li><span>${escapeHtml(r)}</span><button type="button" data-remove-request="${escapeHtml(r)}" aria-label="${escapeHtml(r)} 삭제">✕</button></li>`).join("")
    || `<li class="admin-chips__empty">등록된 요청사항이 없습니다.</li>`;
}
function addRequests(e) {
  e.preventDefault();
  const items = splitNames($("#requests-input").value);
  const added = items.filter((r) => !state.requests.includes(r));
  if (!items.length) return;
  $("#requests-input").value = "";
  autoGrow($("#requests-input"));
  if (!added.length) return showToast("이미 있는 요청사항입니다.", "info");
  saveConfig({ options: unique([...state.requests, ...added]) }, `요청사항 ${added.length}개를 추가했습니다.`);
}
// 입력칸은 한 줄로 시작해 내용만큼만 늘어난다. Enter는 추가, Shift+Enter는 줄바꿈.
function autoGrow(el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
function bindAddInput(input, form) {
  input.addEventListener("input", () => autoGrow(input));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
}

// ── 메뉴 (저장 바에서 저장) ────────────────────────────────

function categoryOptions(selected) {
  return CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === selected ? "selected" : ""}>${c.label}</option>`).join("");
}
function tempOptions(selected) {
  return [["", "HOT/ICE"], ["ICE", "ICE 전용"], ["HOT", "HOT 전용"]].map(([v, l]) => `<option value="${v}" ${v === selected ? "selected" : ""}>${l}</option>`).join("");
}
function renderMenu() {
  $("#menu-count").textContent = `${state.drinks.length}개`;
  $("#menu-tables").innerHTML = CATEGORIES.map((c) => {
    const rows = state.drinks.map((d, i) => ({ d, i })).filter(({ d }) => d.category === c.key);
    if (!rows.length) return "";
    return `<section class="admin-menu-group">
      <h3>${escapeHtml(c.label)} <span class="admin-count">${rows.length}개</span></h3>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>메뉴 이름</th><th>카테고리</th><th>Petit</th><th>Grande</th><th>온도</th><th>유료 옵션</th><th><span class="sr-only">삭제</span></th></tr></thead>
        <tbody>${rows.map(({ d, i }) => `<tr data-index="${i}">
          <td><input data-field="name" value="${escapeHtml(d.name)}" aria-label="메뉴 이름"></td>
          <td><select data-field="category" aria-label="카테고리">${categoryOptions(d.category)}</select></td>
          <td><input data-field="tall" type="number" min="0" step="100" inputmode="numeric" value="${d.tall}" aria-label="${escapeHtml(d.name)} Petit 가격"></td>
          <td><input data-field="grande" type="number" min="0" step="100" inputmode="numeric" value="${d.grande}" aria-label="${escapeHtml(d.name)} Grande 가격"></td>
          <td><select data-field="temp" aria-label="온도">${tempOptions(d.temp)}</select></td>
          <td><button type="button" class="admin-extras-link" data-edit-extras="${i}">${d.extras.length ? `${d.extras.reduce((n, g) => n + g.choices.length, 0)}개 · 편집` : "없음 · 추가"}</button></td>
          <td><button type="button" class="admin-icon-btn admin-icon-btn--danger" data-remove-drink="${i}" aria-label="${escapeHtml(d.name)} 삭제">✕</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>`;
  }).join("");
}
function addDrink(e) {
  e.preventDefault();
  const name = $("#new-drink-name").value.trim();
  if (!name) return;
  if (state.drinks.some((d) => d.name === name)) return showToast("같은 이름의 메뉴가 이미 있습니다.", "warning");
  state.drinks.push({ category: $("#new-drink-category").value, name, tall: price($("#new-drink-tall").value), grande: price($("#new-drink-grande").value), temp: $("#new-drink-temp").value, extras: [] });
  e.target.reset();
  renderAll();
  showToast(`${name}을(를) 추가했습니다. 저장 바에서 저장하세요.`, "info");
}
function updateDrinkField(input) {
  const row = input.closest("[data-index]");
  const d = state.drinks[Number(row.dataset.index)];
  const field = input.dataset.field;
  if (field === "name" && state.extrasDrink === d.name) state.extrasDrink = input.value;
  if (field === "tall" || field === "grande") d[field] = price(input.value);
  else d[field] = input.value;
  if (field === "category") renderMenu();
  if (field === "name") renderExtrasPickers();
  renderSaveBar();
}
async function saveDrinks() {
  const drinks = orderedDrinks();
  const names = drinks.map((d) => d.name.trim());
  if (names.some((n) => !n)) return showToast("이름이 빈 메뉴가 있습니다.", "warning");
  if (new Set(names).size !== names.length) return showToast("이름이 같은 메뉴가 있습니다.", "warning");
  $("#save-drinks").disabled = true;
  try {
    const { drinks: saved } = await apiRequest("/api/drinks", { method: "PUT", body: { drinks: drinks.map(drinkToRow) } });
    state.drinks = saved.map(rowToDrink);
    state.savedDrinks = JSON.stringify(state.drinks);
    renderAll();
    showToast("메뉴와 유료 옵션을 저장했습니다.");
  } catch (e) {
    showToast(`저장 실패: ${e.message}`, "warning");
  } finally {
    $("#save-drinks").disabled = false;
  }
}
function renderSaveBar() {
  $("#save-bar").classList.toggle("is-hidden", !isDirty());
}

// ── 유료 옵션 ─────────────────────────────────────────────

function currentExtrasDrink() { return state.drinks.find((d) => d.name === state.extrasDrink); }
function drinkOptions(selected, exclude = "") {
  return CATEGORIES.map((c) => {
    const items = state.drinks.filter((d) => d.category === c.key && d.name !== exclude);
    if (!items.length) return "";
    return `<optgroup label="${escapeHtml(c.label)}">${items.map((d) => `<option value="${escapeHtml(d.name)}" ${d.name === selected ? "selected" : ""}>${escapeHtml(d.name)}${d.extras.length ? ` (옵션 ${d.extras.length}그룹)` : ""}</option>`).join("")}</optgroup>`;
  }).join("");
}
function renderExtrasPickers() {
  $("#extras-drink").innerHTML = drinkOptions(state.extrasDrink);
  $("#extras-copy-from").innerHTML = drinkOptions("", state.extrasDrink);
}
function renderExtras() {
  renderExtrasPickers();
  const d = currentExtrasDrink();
  $("#extras-apply-category").textContent = d ? `${categoryLabel(d.category)} 전체에 적용` : "같은 카테고리 전체에 적용";
  if (!d) { $("#extras-groups").innerHTML = `<p class="admin-hint">메뉴를 먼저 추가하세요.</p>`; return; }
  $("#extras-groups").innerHTML = d.extras.length ? d.extras.map((g, gi) => `<article class="admin-group" data-group="${gi}">
      <header>
        <input data-gfield="title" value="${escapeHtml(g.title)}" placeholder="그룹 이름 (예: 옵션 추가)" aria-label="그룹 이름">
        <select data-gfield="mode" aria-label="선택 방식">
          <option value="count" ${g.mode === "count" ? "selected" : ""}>개수 선택</option>
          <option value="pick" ${g.mode === "pick" ? "selected" : ""}>하나만 선택</option>
        </select>
        <label class="admin-inline ${g.mode === "pick" ? "is-hidden" : ""}">최대<input data-gfield="max" type="number" min="1" max="10" value="${g.max}" aria-label="최대 개수">개</label>
        <button type="button" class="admin-icon-btn admin-icon-btn--danger" data-remove-group="${gi}" aria-label="${escapeHtml(g.title || "그룹")} 삭제">✕</button>
      </header>
      <ul>${g.choices.map((c, ci) => `<li data-choice="${ci}">
        <input data-cfield="name" value="${escapeHtml(c.name)}" placeholder="선택지 (예: 샷 추가)" aria-label="선택지 이름">
        <label class="admin-inline">+<input data-cfield="price" type="number" min="0" step="100" inputmode="numeric" value="${c.price}" aria-label="추가 금액">원</label>
        <button type="button" class="admin-icon-btn" data-remove-choice="${ci}" aria-label="${escapeHtml(c.name || "선택지")} 삭제">✕</button>
      </li>`).join("")}</ul>
      <button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-add-choice>+ 선택지 추가</button>
    </article>`).join("")
    : `<p class="admin-empty">${escapeHtml(d.name)}에는 유료 옵션이 없습니다. 아래에서 옵션 그룹을 추가하거나 다른 메뉴에서 가져오세요.</p>`;
}
function onExtrasInput(e) {
  const d = currentExtrasDrink();
  const groupEl = e.target.closest("[data-group]");
  if (!d || !groupEl) return;
  const g = d.extras[Number(groupEl.dataset.group)];
  const { gfield, cfield } = e.target.dataset;
  if (gfield === "title") g.title = e.target.value;
  if (gfield === "mode") { g.mode = e.target.value; if (g.mode === "pick") g.max = 1; renderExtras(); }
  if (gfield === "max") g.max = Math.max(1, Math.min(10, Number(e.target.value) || 1));
  if (cfield) {
    const c = g.choices[Number(e.target.closest("[data-choice]").dataset.choice)];
    if (cfield === "name") c.name = e.target.value;
    if (cfield === "price") c.price = price(e.target.value);
  }
  renderSaveBar();
  if (e.type === "change") renderMenu();
}
function onExtrasClick(e) {
  const d = currentExtrasDrink();
  const t = e.target.closest("button");
  if (!d || !t) return;
  const groupEl = t.closest("[data-group]");
  const gi = groupEl ? Number(groupEl.dataset.group) : -1;
  if (t.dataset.removeGroup !== undefined) d.extras.splice(Number(t.dataset.removeGroup), 1);
  else if (t.dataset.removeChoice !== undefined) {
    d.extras[gi].choices.splice(Number(t.dataset.removeChoice), 1);
    if (!d.extras[gi].choices.length) d.extras.splice(gi, 1);
  } else if (t.hasAttribute("data-add-choice")) d.extras[gi].choices.push({ name: "", price: 0 });
  else return;
  renderExtras(); renderMenu(); renderSaveBar();
}
function addPreset(key) {
  const d = currentExtrasDrink();
  if (!d) return;
  const preset = clone(EXTRA_PRESETS[key]);
  if (preset.title && d.extras.some((g) => g.title === preset.title)) return showToast(`"${preset.title}" 그룹이 이미 있습니다.`, "info");
  d.extras.push(preset);
  renderExtras(); renderMenu(); renderSaveBar();
}
function copyExtras() {
  const d = currentExtrasDrink();
  const from = state.drinks.find((x) => x.name === $("#extras-copy-from").value);
  if (!d || !from) return;
  const apply = () => { d.extras = clone(from.extras); renderExtras(); renderMenu(); renderSaveBar(); showToast(`${from.name}의 옵션을 가져왔습니다. 저장 바에서 저장하세요.`, "info"); };
  if (!d.extras.length) return apply();
  askConfirm({ title: "옵션 가져오기", message: `${d.name}의 지금 옵션을 ${from.name}의 옵션(${from.extras.length}그룹)으로 바꿀까요?`, ok: "바꾸기", onOk: apply });
}
function applyToCategory() {
  const d = currentExtrasDrink();
  if (!d) return;
  const targets = state.drinks.filter((x) => x.category === d.category && x !== d);
  if (!targets.length) return showToast("같은 카테고리에 다른 메뉴가 없습니다.", "info");
  askConfirm({
    title: "카테고리 전체에 적용",
    message: `${categoryLabel(d.category)}의 다른 메뉴 ${targets.length}개의 유료 옵션을 ${d.name}과 같게 바꿀까요?`,
    ok: "적용",
    onOk: () => { targets.forEach((x) => { x.extras = clone(d.extras); }); renderExtras(); renderMenu(); renderSaveBar(); showToast(`${targets.length}개 메뉴에 적용했습니다. 저장 바에서 저장하세요.`, "info"); },
  });
}

// ── 주문 현황 · 마감 · 새 주문 · 팀즈 ─────────────────────────

const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;
const orderStatus = { count: 0, total: 0, closed: false, startedAt: null };
function pendingMembers() { return state.members.filter((m) => !m.order); }
async function loadRound() {
  try {
    const [{ orders }, { members, config, teams }] = await Promise.all([apiRequest("/api/orders"), apiRequest("/api/admin/members")]);
    orderStatus.count = orders.length;
    orderStatus.total = orders.reduce((s, o) => s + (Number(o.unit_price) || 0), 0);
    orderStatus.closed = Boolean(config.orders_closed);
    orderStatus.startedAt = config.round_started_at;
    state.members = members;
    state.teams = teams;
    renderOrderStatus();
    renderRoster();
    renderTeam();
  } catch (e) {
    $("#status-badge").textContent = "확인 실패";
  }
}
function renderOrderStatus() {
  const badge = $("#status-badge");
  badge.textContent = orderStatus.closed ? "🔒 마감" : "🟢 접수 중";
  badge.classList.toggle("is-closed", orderStatus.closed);
  $("#status-count").textContent = formatter.format(orderStatus.count);
  $("#status-total").textContent = formatter.format(orderStatus.total);
  $("#status-pending").textContent = formatter.format(pendingMembers().length);
  $("#toggle-close").textContent = orderStatus.closed ? "주문 재개" : "주문 마감";
  $("#toggle-close").classList.toggle("admin-btn--danger", !orderStatus.closed);
}
function nudgeBlocker(m) {
  if (!state.teams.dm) return "개인 알림 주소 미설정";
  if (orderStatus.closed) return "주문 마감 중";
  if (!m.email) return "이메일 없음";
  if (m.last_nudged_at && Date.now() - Date.parse(m.last_nudged_at) < NUDGE_COOLDOWN_MS) return "10분 뒤 다시";
  return "";
}
function renderRoster() {
  const pending = pendingMembers();
  const done = state.members.length - pending.length;
  $("#round-count").textContent = `${done} / ${state.members.length}명 주문`;
  $("#round-info").textContent = orderStatus.startedAt ? `${kstTime(orderStatus.startedAt)}에 시작한 주문입니다. ${orderStatus.closed ? "지금은 마감 상태입니다." : "주문 받는 중입니다."}` : "";
  const sendable = pending.filter((m) => !nudgeBlocker(m));
  $("#nudge-all").textContent = `미주문자 모두 독촉 (${sendable.length}명)`;
  $("#nudge-all").disabled = !sendable.length;
  $("#post-status").disabled = !state.teams.channel;
  const missing = [!state.teams.channel ? "TEAMS_CHANNEL_WEBHOOK_URL(채널 알림)" : "", !state.teams.dm ? "TEAMS_DM_WEBHOOK_URL(개인 독촉)" : ""].filter(Boolean);
  $("#teams-setup").textContent = missing.length ? `팀즈 알림을 쓰려면 Pages 시크릿에 ${missing.join("과 ")}을 넣어 주세요. 설정 방법은 README의 "팀즈 알림"에 있습니다.` : "";
  $("#teams-setup").classList.toggle("is-hidden", !missing.length);
  // 아직 주문하지 않은 사람을 위로 올린다.
  const rows = [...pending, ...state.members.filter((m) => m.order)];
  $("#roster-body").innerHTML = rows.map((m) => {
    const o = m.order;
    const blocker = o ? "" : nudgeBlocker(m);
    return `<tr class="${o ? "" : "is-pending"}">
      <td><strong>${escapeHtml(m.name)}</strong></td>
      <td>${o ? `${escapeHtml(o.menu_name)} <small class="admin-muted">${escapeHtml([o.temp, o.size === "Grande" ? "G" : "P", ...(o.options || [])].join(" · "))} · ${won(o.unit_price)}</small>` : `<span class="admin-badge admin-badge--wait">미주문</span>`}</td>
      <td>${m.linked ? `<span class="admin-badge admin-badge--ok">연결됨</span>` : m.email ? `<span class="admin-badge">로그인 전</span>` : `<span class="admin-badge">이메일 없음</span>`}</td>
      <td class="admin-muted">${escapeHtml(ago(m.last_nudged_at)) || "-"}</td>
      <td class="admin-row-actions">${o ? "" : `<button type="button" class="admin-btn admin-btn--ghost admin-btn--small" data-nudge="${m.id}" ${blocker ? `disabled title="${escapeHtml(blocker)}"` : ""}>${blocker === "10분 뒤 다시" ? escapeHtml(blocker) : "독촉"}</button>`}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="admin-muted">팀원 명단이 비어 있습니다. 팀원 탭에서 추가하세요.</td></tr>`;
}
function teamsResultToast(teams) {
  if (!teams) return;
  if (teams.sent) showToast("팀즈 채널에 알렸습니다.", "success");
  else showToast(`팀즈 알림 실패: ${teams.error}`, "warning", 6000);
}
async function changeRound(action, { notify, note }, message) {
  try {
    const { teams } = await apiRequest("/api/admin/round", { method: "POST", body: { action, notify, note } });
    showToast(message, action === "close" ? "warning" : "success");
    teamsResultToast(teams);
  } catch (e) {
    showToast(e.message, "warning");
  }
  loadRound();
}
function toggleClosed() {
  const next = !orderStatus.closed;
  const pending = pendingMembers().length;
  askConfirm({
    title: next ? "주문 마감" : "주문 재개",
    message: next
      ? `주문을 마감할까요? (지금 ${orderStatus.count}건${pending ? `, 미주문 ${pending}명` : ""}) 마감하면 주문 추가·수정·취소가 막히고, 알림에는 최종 명세가 올라갑니다.`
      : "마감한 주문을 다시 받을까요? 지금까지 들어온 주문은 그대로 둡니다.",
    ok: next ? "마감" : "재개",
    teams: true,
    notePlaceholder: next ? "알림에 덧붙일 말 (선택) 예: 12시 30분에 찾으러 갑니다" : "알림에 덧붙일 말 (선택) 예: 3시까지 더 받습니다",
    onOk: (opts) => changeRound(next ? "close" : "reopen", opts, next ? "주문을 마감했습니다." : "주문을 재개했습니다."),
  });
}
function startRound() {
  askConfirm({
    title: "새 주문 시작",
    message: orderStatus.count
      ? `지금 주문 ${orderStatus.count}건을 각자의 "지난 주문"으로 옮기고 새로 주문을 받습니다.`
      : "새로 주문을 받습니다.",
    ok: "시작",
    teams: true,
    notePlaceholder: "알림에 덧붙일 말 (선택) 예: 오후 2시에 마감합니다",
    onOk: (opts) => changeRound("start", opts, "새 주문을 시작했습니다."),
  });
}
async function postStatus() {
  $("#post-status").disabled = true;
  try {
    await apiRequest("/api/admin/teams/status", { method: "POST", body: {} });
    showToast("팀즈 채널에 현황을 보냈습니다.", "success");
  } catch (e) {
    showToast(e.message, "warning", 6000);
  } finally {
    $("#post-status").disabled = !state.teams.channel;
  }
}
async function nudge(ids) {
  try {
    const { sent, skipped, failed } = await apiRequest("/api/admin/nudge", { method: "POST", body: { member_ids: ids } });
    const parts = [
      sent.length ? `${sent.join(", ")}님에게 보냈습니다` : "",
      skipped.length ? `건너뜀: ${skipped.map((s) => `${s.name}(${s.reason})`).join(", ")}` : "",
      failed.length ? `실패: ${failed.map((f) => `${f.name}(${f.error})`).join(", ")}` : "",
    ].filter(Boolean);
    showToast(parts.join(" · ") || "보낼 사람이 없습니다.", failed.length ? "warning" : sent.length ? "success" : "info", 6000);
  } catch (e) {
    showToast(e.message, "warning", 6000);
  }
  loadRound();
}
function nudgeAll() {
  const targets = pendingMembers().filter((m) => !nudgeBlocker(m));
  if (!targets.length) return;
  askConfirm({
    title: "미주문자 독촉",
    message: `아직 주문하지 않은 ${targets.length}명(${targets.map((m) => m.name).join(", ")})에게 팀즈 개인 메시지를 보낼까요?`,
    ok: "보내기",
    onOk: () => nudge(targets.map((m) => m.id)),
  });
}

// ── 새메뉴 자동 반영 ──────────────────────────────────────

function describeSizes(item) {
  return [item.petit ? `Petit ${won(item.petit)}` : "", item.grande ? `Grande ${won(item.grande)}` : ""].filter(Boolean).join(" · ");
}
function renderSeasonSync(last) {
  const box = $("#season-sync-status");
  if (!last) { box.textContent = "아직 확인한 기록이 없습니다."; return; }
  const r = last.report || {};
  const when = new Date(last.ran_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
  const lines = [
    ...(r.added || []).map((i) => `추가: ${i.name} (${describeSizes(i)})`),
    ...(r.linked?.length ? [`기존 시즌음료와 연결: ${r.linked.join(", ")}`] : []),
    ...(r.removed?.length ? [`판매 종료로 삭제: ${r.removed.join(", ")}`] : []),
    ...(r.failed || []).map((f) => `실패: ${f.title} — ${f.error}`),
  ];
  if (!lines.length) lines.push("변경 사항 없음");
  box.innerHTML = `<strong>마지막 확인: ${escapeHtml(when)} (${last.trigger === "cron" ? "자동" : "지금 확인"})</strong><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
}
async function loadSeasonSync() {
  try {
    const { last } = await apiRequest("/api/admin/season-sync");
    renderSeasonSync(last);
  } catch (e) {
    $("#season-sync-status").textContent = `마지막 확인 결과를 불러오지 못했습니다: ${e.message}`;
  }
}
async function runSeasonSync() {
  if (isDirty()) return showToast("저장하지 않은 메뉴 변경이 있습니다. 먼저 저장하거나 되돌리세요.", "warning");
  const btn = $("#run-season-sync");
  btn.disabled = true;
  $("#season-sync-status").textContent = "새메뉴 페이지를 확인하는 중입니다. 새 포스터가 있으면 읽는 데 수십 초 걸릴 수 있습니다.";
  try {
    const { last } = await apiRequest("/api/admin/season-sync", { method: "POST" });
    renderSeasonSync(last);
    const r = last.report || {};
    if (r.added?.length || r.removed?.length || r.linked?.length) await loadAll();
  } catch (e) {
    $("#season-sync-status").textContent = `확인 실패: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ── 탭과 화면 갱신 ────────────────────────────────────────

function currentTab() {
  const tab = location.hash.slice(1);
  return ["status", "team", "requests", "menu", "extras", "season"].includes(tab) ? tab : "status";
}
function renderTabs() {
  const tab = currentTab();
  document.querySelectorAll("[data-tab]").forEach((a) => { a.classList.toggle("is-active", a.dataset.tab === tab); a.setAttribute("aria-selected", String(a.dataset.tab === tab)); });
  document.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("is-hidden", p.dataset.panel !== tab));
  const active = document.querySelector(".admin-tab.is-active");
  const tabs = document.querySelector(".admin-tabs");
  if (active) tabs.scrollTo({ left: active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
}
function renderAll() {
  $("#new-drink-category").innerHTML = categoryOptions($("#new-drink-category").value || "season");
  renderChips(); renderTeam(true); renderMenu(); renderExtras(); renderSaveBar(); renderTabs();
}

// ── 인증 ──────────────────────────────────────────────────

// 관리자 페이지는 주문 화면에서 링크하지 않고 주소(/admin)로만 들어온다.
// 로그인 전에는 상단 바 아래를 로그인 화면이 덮고, 로그인하면 관리 패널이 나타난다.
function checkAuth() { return sessionStorage.getItem("admin_authenticated") === "true"; }
function lock() {
  document.body.classList.add("is-locked");
  (sessionStorage.getItem("admin_id") ? $("#auth-password") : $("#auth-id")).focus();
}
function unlock() {
  document.body.classList.remove("is-locked");
  renderTabs();
}
function logout() {
  sessionStorage.removeItem("admin_authenticated");
  sessionStorage.removeItem("admin_password");
  $("#auth-password").value = "";
  lock();
}
async function login(e) {
  e.preventDefault();
  const id = $("#auth-id").value.trim();
  const pw = $("#auth-password").value;
  $("#auth-submit").disabled = true;
  try {
    const res = await fetch("/api/admin/auth", { method: "POST", headers: { "x-admin-id": encodeURIComponent(id), "x-admin-password": pw } });
    if (!res.ok) throw new Error();
    sessionStorage.setItem("admin_id", id);
    sessionStorage.setItem("admin_password", pw);
    sessionStorage.setItem("admin_authenticated", "true");
    $("#auth-error").classList.add("is-hidden");
    $("#auth-password").value = "";
    unlock();
    loadAll();
    loadRound();
    loadSeasonSync();
  } catch {
    $("#auth-error").classList.remove("is-hidden");
    $("#auth-password").value = "";
    $("#auth-password").focus();
  } finally {
    $("#auth-submit").disabled = false;
  }
}

// ── 이벤트 ────────────────────────────────────────────────

window.addEventListener("hashchange", renderTabs);
window.addEventListener("beforeunload", (e) => { if (isDirty()) e.preventDefault(); });
bindAddInput($("#team-input"), $("#team-add"));
bindAddInput($("#requests-input"), $("#requests-add"));
$("#team-add").addEventListener("submit", addMembers);
$("#requests-add").addEventListener("submit", addRequests);
$("#team-filter").addEventListener("input", () => renderTeam(true));
$("#team-body").addEventListener("change", (e) => { if (e.target.dataset.memberField) updateMember(e.target); });
$("#team-body").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.memberField && !e.isComposing) e.target.blur(); });
$("#team-body").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const member = state.members.find((m) => m.id === Number(t.dataset.unlink || t.dataset.removeMember));
  if (!member) return;
  if (t.dataset.unlink) {
    askConfirm({ title: "MS 계정 연결 해제", message: `${member.name}님과 MS 계정의 연결을 풀까요? 그 계정은 바로 로그아웃되고, 다음 로그인 때 이메일로 다시 연결됩니다.`, ok: "연결 해제", onOk: async () => {
      try { await apiRequest(`/api/admin/members/${member.id}`, { method: "PATCH", body: { unlink: true } }); showToast(`${member.name}님 연결을 풀었습니다.`); } catch (err) { showToast(err.message, "warning"); }
      await loadRound(); renderTeam(true);
    } });
  } else {
    askConfirm({ title: "팀원 삭제", message: `${member.name}님을 명단에서 뺄까요? 바로 로그아웃되고 더는 주문할 수 없습니다. 이미 들어간 주문은 그대로 남습니다.`, ok: "삭제", onOk: async () => {
      try { await apiRequest(`/api/admin/members/${member.id}`, { method: "DELETE" }); showToast(`${member.name}님을 명단에서 뺐습니다.`); } catch (err) { showToast(err.message, "warning"); }
      await loadRound(); renderTeam(true);
    } });
  }
});
$("#roster-body").addEventListener("click", (e) => {
  const id = e.target.closest("[data-nudge]")?.dataset.nudge;
  if (id) nudge([Number(id)]);
});
$("#post-status").addEventListener("click", postStatus);
$("#nudge-all").addEventListener("click", nudgeAll);
$("#requests-list").addEventListener("click", (e) => {
  const item = e.target.closest("[data-remove-request]")?.dataset.removeRequest;
  if (!item) return;
  askConfirm({ title: "요청사항 삭제", message: `"${item}"을(를) 요청사항에서 뺄까요?`, ok: "삭제", onOk: () => saveConfig({ options: state.requests.filter((r) => r !== item) }, `"${item}"을(를) 뺐습니다.`) });
});
$("#drink-add").addEventListener("submit", addDrink);
$("#menu-tables").addEventListener("input", (e) => { if (e.target.dataset.field) updateDrinkField(e.target); });
$("#menu-tables").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.editExtras !== undefined) {
    state.extrasDrink = state.drinks[Number(t.dataset.editExtras)].name;
    renderExtras();
    location.hash = "extras";
  }
  if (t.dataset.removeDrink !== undefined) {
    const d = state.drinks[Number(t.dataset.removeDrink)];
    askConfirm({ title: "메뉴 삭제", message: `${d.name}을(를) 메뉴에서 뺄까요? 저장 바에서 저장해야 반영됩니다.`, ok: "삭제", onOk: () => { state.drinks.splice(state.drinks.indexOf(d), 1); renderAll(); } });
  }
});
$("#extras-drink").addEventListener("change", (e) => { state.extrasDrink = e.target.value; renderExtras(); });
$("#extras-groups").addEventListener("input", onExtrasInput);
$("#extras-groups").addEventListener("change", onExtrasInput);
$("#extras-groups").addEventListener("click", onExtrasClick);
$("#extras-copy").addEventListener("click", copyExtras);
$("#extras-apply-category").addEventListener("click", applyToCategory);
document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => addPreset(b.dataset.preset)));
$("#save-drinks").addEventListener("click", saveDrinks);
$("#discard-drinks").addEventListener("click", () => askConfirm({ title: "변경 되돌리기", message: "저장하지 않은 메뉴·유료 옵션 변경을 모두 버릴까요?", ok: "되돌리기", onOk: () => { state.drinks = JSON.parse(state.savedDrinks); renderAll(); } }));
$("#run-season-sync").addEventListener("click", runSeasonSync);
$("#toggle-close").addEventListener("click", toggleClosed);
$("#start-round").addEventListener("click", startRound);
$("#logout").addEventListener("click", () => {
  if (isDirty()) return askConfirm({ title: "로그아웃", message: "저장하지 않은 변경이 있습니다. 버리고 로그아웃할까요?", ok: "로그아웃", onOk: logout });
  logout();
});
$("#auth-form").addEventListener("submit", login);
$("#confirm-sheet").addEventListener("click", (e) => {
  const dialog = $("#confirm-sheet");
  const t = e.target.closest("button");
  if (e.target === dialog || (t && t.hasAttribute("data-close"))) return dialog.close();
  if (t && t.hasAttribute("data-confirm-ok")) {
    dialog.close();
    const run = pendingConfirm;
    pendingConfirm = null;
    if (run) run({ notify: $("#confirm-notify").checked, note: $("#confirm-note").value.trim() });
  }
});

// ── 초기화 ────────────────────────────────────────────────

renderTabs();
$("#auth-id").value = sessionStorage.getItem("admin_id") || "";
if (checkAuth()) {
  unlock();
  loadAll();
  loadRound();
  loadSeasonSync();
} else {
  lock();
}
// 주문 화면에서 들어오는 주문이 보이도록 상태 줄은 10초마다 다시 읽는다.
setInterval(() => { if (!document.body.classList.contains("is-locked")) loadRound(); }, 10000);
