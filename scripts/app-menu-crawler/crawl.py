# 아티제 앱(아티제 커넥트 → 전체메뉴)에서 음료 카테고리의 상세(사이즈·가격·옵션)를 읽어 JSON으로 저장한다.
# 준비: 안드로이드 에뮬레이터에 클럽 아티제 앱을 설치·로그인하고 매장을 고른 뒤 "전체메뉴" 탭을 열어 둔다.
# 사용법: python3 crawl.py <출력.json> [카테고리 ...]   (출력 파일이 있으면 이어서 수집)
# 안전: y > 2150(장바구니 담기·주문하기·결제하기 버튼 영역)은 절대 누르지 않고, 장바구니에 무언가 담기면 즉시 멈춘다.
import json, os, re, shutil, subprocess, sys, time, xml.etree.ElementTree as ET
ADB = os.environ.get("ADB") or shutil.which("adb") or os.path.join(os.environ.get("ANDROID_SDK_ROOT", ""), "platform-tools", "adb")
DRINK_CATS = ["시즌", "에스프레소", "콜드브루", "스무디&에이드", "티&기타", "프라페", "리얼후르츠음료", "음료"]
ALL_CATS = ["시즌", "에스프레소", "콜드브루", "브레드", "홀케이크", "조각 케이크", "스무디&에이드", "티&기타", "프라페", "리얼후르츠음료", "키즈", "음료",
            "파운드&카스텔라", "샌드위치", "샐러드", "마카롱", "양과자", "쿠키", "원두판매", "피자", "리테일"]
SAFE_MAX_Y = 2150

def sh(*a): return subprocess.run([ADB, *a], capture_output=True).stdout
def tap(x, y):
    assert y <= SAFE_MAX_Y and y >= 250, f"unsafe tap {x},{y}"
    sh("shell", "input", "tap", str(x), str(y))
def swipe(y1, y2, ms=500): sh("shell", "input", "swipe", "540", str(y1), "540", str(y2), str(ms))
def nodes():
    sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    xml = sh("exec-out", "cat", "/sdcard/ui.xml").decode("utf-8", "replace")
    out = []
    for n in ET.fromstring(xml).iter("node"):
        b = list(map(int, re.findall(r"\d+", n.get("bounds", "0,0,0,0"))))
        out.append({"text": (n.get("text") or "").strip(), "desc": (n.get("content-desc") or "").strip(),
                    "click": n.get("clickable") == "true", "cx": (b[0] + b[2]) // 2, "cy": (b[1] + b[3]) // 2})
    return out
def split_main(ns):
    top = max((i for i, n in enumerate(ns) if n["text"] == "맨 위로" or n["desc"] == "맨 위로"), default=len(ns) - 1)
    return ns[:top + 1], ns[top + 1:]
def list_items(main):
    start = next(i for i, n in enumerate(main) if n["text"] == "ONOFF")
    items, cat, cur = [], None, []
    for n in main[start + 1:]:
        label = n["text"] or n["desc"]
        if not label: continue
        if label in ALL_CATS and (n["desc"] in ALL_CATS or len(label) < 12) and not cur:
            cat = label; continue
        if label in ("유의사항", "맨 위로"): break
        cur.append(n)
        if re.search(r"[\d,]+원$", n["text"] or ""):
            items.append({"cat": cat, "key": cur[0]["text"], "cy": cur[0]["cy"], "nodes": cur}); cur = []
    return items
def read_detail():
    for _ in range(6):
        _, d = split_main(nodes())
        texts = [n for n in d if n["text"] or n["desc"]]
        if any(n["text"] == "가격" for n in texts): return texts
        time.sleep(0.6)
    return []

def find(ns, label, region=(250, SAFE_MAX_Y)):
    for n in ns:
        if (n["text"] == label or n["desc"] == label) and n["click"] and region[0] <= n["cy"] <= region[1] and n["cx"] > 0:
            return n
    return None
def cart_has_items(ns=None):
    ns = ns or nodes()
    return any("주문하기" in (n["text"] or n["desc"]) for n in ns)
def go_top():
    ns = nodes()
    n = find(ns, "맨 위로")
    if n: tap(n["cx"], n["cy"]); time.sleep(1.2)
def chip(cat):
    # 카테고리 칩 바는 맨 위에서는 y≈738, 스크롤하면 y≈464에 붙는다. 보이지 않으면 좌우로 밀어 찾는다.
    for direction in [("1000", "200")] * 3 + [("200", "1000")] * 6:
        ns = nodes()
        chips = [x for x in ns if x["desc"] in ALL_CATS and x["click"] and 400 <= x["cy"] <= 800]
        n = next((x for x in chips if x["desc"] == cat and x["cx"] > 0), None)
        if n: tap(n["cx"], n["cy"]); time.sleep(1.8); return True
        y = str(next((x["cy"] for x in chips if x["cx"] > 0), 464))
        sh("shell", "input", "swipe", direction[0], y, direction[1], y, "300"); time.sleep(0.6)
    raise SystemExit(f"STOP: {cat} 칩을 찾지 못했습니다")
def close_detail():
    ns = nodes()
    a = find(ns, "확인")
    if a and any("판매 중인 상품이 아닙니다" in n["text"] for n in ns): tap(a["cx"], a["cy"]); time.sleep(0.8); ns = nodes()
    if detail_open(ns):
        # 상세 화면이 스크롤되면 닫기(X)가 상단바 뒤로 숨는다. 맨 위로 되돌린 뒤 누른다.
        swipe(800, 1900, 300); time.sleep(0.6); swipe(800, 1900, 300); time.sleep(0.8)
        ns = nodes()
    c = next((n for n in ns if "닫기" in (n["text"], n["desc"]) and n["click"] and 300 <= n["cy"] < 450), None)
    if c: tap(c["cx"], c["cy"]); time.sleep(1.2)
    ns = nodes()
    if cart_has_items(ns): raise SystemExit("STOP: 장바구니에 항목이 담겼습니다. 수동 확인 필요")
    if detail_open(ns): raise SystemExit("STOP: 상세 화면이 닫히지 않았습니다")
def detail_open(ns=None):
    _, d = split_main(ns or nodes())
    return any(n["text"] == "가격" for n in d)

def won(s):
    m = re.search(r"([\d,]+)원", s or "")
    return int(m.group(1).replace(",", "")) if m else None
STEPPER = {"수량 감소", "수량 증가"}
def is_group_title(t):
    return t.replace(" ", "") in ("옵션변경", "옵션변", "컵선택") or bool(re.search(r"선택\)$", t))
def parse_struct(d):
    t = [n["text"] for n in d]
    k = next((j for j, n in enumerate(d) if re.fullmatch(r"\d+ / \d+", n["text"] or "")), None)
    # 이미지가 없는 메뉴는 "1 / 1" 표시가 없으니 첫 글자 노드를 메뉴명으로 본다.
    name = d[k + 1]["text"] if k is not None else next(n["text"] for n in d if n["text"] and not n["text"].startswith(("%", "IT0", "javascript:")))
    i = t.index("가격")
    info = {"name": name, "price": won(t[i + 1]), "groups": [], "variants": []}
    cur = None
    for n in d[i + 2:]:
        txt = n["text"]
        if txt in ("수량", "나만의메뉴") or (n["desc"] or "").startswith("장바구니 담기"): break
        if n["click"] and n["desc"] and n["desc"] not in STEPPER and cur and cur["title"].replace(" ", "").startswith("옵션변"):
            info["variants"].append({"name": n["desc"], "cx": n["cx"], "cy": n["cy"]}); continue
        if not txt or txt.startswith("%") or re.match(r"^IT\d", txt) or txt in STEPPER or re.fullmatch(r"\d+", txt): continue
        if is_group_title(txt):
            cur = {"title": txt, "choices": []}; info["groups"].append(cur); continue
        if cur is None or cur["title"].replace(" ", "").startswith("옵션변"): continue
        if re.fullmatch(r"[\d,]+원", txt):
            if cur["choices"]: cur["choices"][-1]["price"] = won(txt)
            continue
        cur["choices"].append({"name": re.sub(r"품절$", "", txt), "soldOut": txt.endswith("품절"), "price": 0})
    return info

# ── 실행 ──

if __name__ == "__main__":
    OUT = sys.argv[1]
    results = json.load(open(OUT)) if os.path.exists(OUT) else {}
    visited, log = set(), sys.stderr
    CATS = sys.argv[2:] or DRINK_CATS
    def say(*a):
        print(*a, file=log, flush=True)
    def is_drink(cat, key):
        return cat != "시즌" or bool(re.search(r"\((P|G)\)|매그넘", key))
    def save():
        json.dump(results, open(OUT, "w"), ensure_ascii=False, indent=1)
    def open_item(it, cat):
        tap(300, it["cy"]); time.sleep(2)
        d = read_detail()
        if not d: say("  detail not opened", it["key"][:30]); close_detail(); return
        info = parse_struct(d); info["cat"] = cat; info["available"] = True
        results.setdefault(info["name"], info); say("  ", cat, info["name"], info["price"], [g["title"] for g in info["groups"]], [v["name"] for v in info["variants"]])
        for v in info["variants"]:
            if v["name"] in results or v["name"] == info["name"]: continue
            if not (600 <= v["cy"] <= 2050): say("  variant offscreen", v); continue
            tap(v["cx"], v["cy"]); time.sleep(1.8)
            ns = nodes()
            if any("판매 중인 상품이 아닙니다" in n["text"] for n in ns):
                results[v["name"]] = {"name": v["name"], "cat": cat, "available": False}
                ok = find(ns, "확인"); tap(ok["cx"], ok["cy"]); time.sleep(0.8)
                say("    variant unavailable", v["name"]); continue
            vd = read_detail()
            vi = parse_struct(vd); vi["cat"] = cat; vi["available"] = True
            if vi["name"] != v["name"]:
                # 품절(SOLD OUT) 버전은 눌러도 바뀌지 않는다. 가격은 기본 상품과 같다고 보고 품절로만 표시한다.
                results[v["name"]] = {"name": v["name"], "cat": cat, "available": True, "soldOut": True, "price": info["price"], "groups": info["groups"], "variants": []}
                say("    variant sold out", v["name"]); continue
            results[vi["name"]] = vi; say("    variant", vi["name"], vi["price"])
        close_detail(); save()

    assert not cart_has_items(), "cart not empty"
    go_top()
    for cat in CATS:
        chip(cat); say("==", cat)
        for _ in range(40):
            main, _ = split_main(nodes())
            items = [it for it in list_items(main) if it["cat"] == cat and is_drink(cat, it["key"])]
            todo = [it for it in items if it["key"] not in visited]
            if not todo: break
            vis = [it for it in todo if 600 <= it["cy"] <= 2050]
            if detail_open():
                close_detail()
            if vis:
                visited.add(vis[0]["key"]); open_item(vis[0], cat)
            else:
                # 아직 화면 아래에 있으면 올리고, 위에 있으면(275) 내린다
                if todo[0]["cy"] < 600: swipe(900, 1500)
                else: swipe(1900, 1100)
                time.sleep(1.2)
    save(); say("DONE", len(results))
    print("DONE", len(results))
