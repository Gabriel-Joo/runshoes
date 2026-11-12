"""수치는 코드가 넣는다(09 0절 원칙 1) — API 값을 사실 문장으로 바꾼다. LLM 은 이 문장의 말투만 다듬는다.

문장 규칙(작업 5-1 사용자)
- 사전 용어 대신 쉬운 말: 스택하이트 → 쿠션 높이, 드롭 → 앞뒤 높이 차이, 미드솔 → 쿠션 소재, 와이드 모델 → 넓은 폭(2E·4E) 버전
- 처음 말하는 신발에는 브랜드: "아식스의 노바블라스트 5"
- 무게는 원값 먼저, 환산값은 "약"과 함께. 환산 뒤 차이가 8g 미만이면 우열을 말하지 않는다(09 4절)
- 가격은 발매가 — 가격을 말한 단락 끝에 한 번 PRICE_NOTE
- 밴드는 API 의 word(가벼운 편 · 중간 · 무거운 편) 그대로, 순위(order / n)는 말하지 않는다
"""

from __future__ import annotations

import math

from .catalog import SIZE_MM

PRICE_NOTE = "다만 가격은 발매가 기준이라 지금은 더 저렴할 수 있어요."
SAME_WEIGHT_G = 8   # 환산 뒤 이 차이 미만이면 "거의 같은 수준"(09 4절 — 모델별 편차 1.66~3.60% 안)

FIELD_NAME = {"weight": "무게", "stackHeight": "쿠션 높이", "drop": "앞뒤 높이 차이", "price": "가격"}
WIDE_SCOPE = {"domestic": "국내에서 살 수 있어요", "overseas": "해외에만 나와요(국내에서는 직구로만)"}
STABILITY_PLAIN = {"안정화": "안정화(발이 안쪽으로 무너지는 것을 잡아 주는 신발)", "중립화": "중립화(교정 장치 없이 쿠션을 고르게 둔 신발)"}
WIDTH_PLAIN = {"넓음": "넓은 편", "보통": "보통", "좁음": "좁은 편"}


# ------------------------------------------------------------------ 조사 — compare/Josa 와 같은 규칙(숫자는 읽는 소리)
def jong(word: str) -> int:
    w = word.strip()
    if not w:
        return 0
    c = w[-1]
    if "가" <= c <= "힣":
        return (ord(c) - 0xAC00) % 28
    if w.lower().endswith("mm"):
        return 0          # 밀리미터
    if len(w) >= 2 and w[-2].isdigit() and c.lower() == "g":
        return 1          # 그램
    if c.isdigit():
        return 8 if c in "178" else 1 if c in "036" else 0
    lc = c.lower()
    return 8 if lc in "lr" else 1 if lc in "mn" else 0


def josa(word: str, with_jong: str, without: str) -> str:
    return word + (with_jong if jong(word) else without)


def ieyo(word: str) -> str:
    """클리프톤 10이에요 · 노바블라스트 5예요"""
    return word + ("이에요" if jong(word) else "예요")


def euro(word: str) -> str:
    j = jong(word)
    return word + ("으로" if j and j != 8 else "로")


# ------------------------------------------------------------------ 값 → 말
def g(x: float) -> int:
    """g · mm 반올림(0.5 는 올림 — 화면과 같게)"""
    return int(math.floor(x + 0.5))


def num(x: float) -> str:
    """41.5 는 그대로, 42.0 은 42"""
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def won(x: float) -> str:
    return f"{int(x):,}원"


def size_mm(shoe: dict) -> int | None:
    return SIZE_MM.get(shoe.get("weightSize") or "")


def weight_phrase(shoe: dict) -> str | None:
    """원값(기준 mm). 환산은 따로 — weight_converted"""
    w = shoe.get("weight")
    if w is None:
        return None
    mm = size_mm(shoe)
    return f"{num(w)}g({mm}mm 기준)" if mm else f"{num(w)}g(기준 사이즈 정보 없음)"


def norm270(shoe: dict) -> float | None:
    """270mm 로 맞춘 무게(V15 weightNorm270 — 비교하기와 같은 값). 기준 모름은 None"""
    v = shoe.get("weightNorm270")
    return float(v) if v is not None and size_mm(shoe) else None


def weight_converted(shoe: dict) -> int | None:
    """환산했으면 반올림한 환산값, 270mm 그대로면 None"""
    mm, n = size_mm(shoe), norm270(shoe)
    return g(n) if mm and mm != 270 and n is not None else None


def weight_sentence(shoe: dict, name: str) -> str | None:
    """B는 285g(280mm 기준)이에요. 270mm로 환산하면 약 271g이에요."""
    p = weight_phrase(shoe)
    if p is None:
        return None
    s = f"{josa(name, '은', '는')} {p}이에요."
    c = weight_converted(shoe)
    if c is not None:
        s += f" 270mm로 환산하면 약 {c}g이에요."
    return s


# ------------------------------------------------------------------ 신발 하나 — 스펙 사실
def shoe_facts(shoe: dict, generation_note: bool = False) -> list[str]:
    """프롬프트에 넣을 사실 줄 — 빈 칸은 "정보 없음"(기본값으로 채우지 않는다, 01a 2-1)"""
    name = f"{shoe['brand']}의 {shoe['model']}"
    out = [f"신발: {name}"]
    if generation_note and shoe.get("generation") is not None:
        out.append(f"세대: {shoe['generation']}세대 기준이에요(같은 라인에 다른 세대도 등록되어 있어요)")
    out.append(f"용도: {shoe.get('purpose') or '정보 없음'}")
    out.append(f"안정성: {STABILITY_PLAIN.get(shoe.get('stability'), shoe.get('stability') or '정보 없음')}")
    wp = weight_phrase(shoe)
    if wp:
        c = weight_converted(shoe)
        out.append(f"무게: {wp}" + (f", 270mm로 환산하면 약 {c}g" if c is not None else ""))
    else:
        out.append("무게: 정보 없음")
    out.append(f"쿠션 높이: {num(shoe['stackHeight'])}mm" if shoe.get("stackHeight") is not None else "쿠션 높이: 정보 없음")
    out.append(f"앞뒤 높이 차이: {num(shoe['drop'])}mm" if shoe.get("drop") is not None else "앞뒤 높이 차이: 정보 없음")
    out.append(f"쿠션 소재: {shoe.get('midsole') or '정보 없음'}")
    out.append(f"발볼: {WIDTH_PLAIN.get(shoe.get('width'), '정보 없음')}")
    wide = shoe.get("wideAvailable")
    if wide is True:
        out.append(f"넓은 폭(2E·4E) 버전: {WIDE_SCOPE.get(shoe.get('wideScope'), '있어요')}")
    elif wide is False:
        out.append("넓은 폭(2E·4E) 버전: 없어요")
    else:
        out.append("넓은 폭(2E·4E) 버전: 정보 없음")
    carbon = shoe.get("carbon")
    out.append("카본 플레이트: " + ("들어 있어요" if carbon is True else "없어요" if carbon is False else "정보 없음"))
    out.append(f"발매가: {won(shoe['price'])}" if shoe.get("price") is not None else "발매가: 정보 없음")
    if shoe.get("summary"):
        out.append(f"한 줄 소개: {shoe['summary']}")
    if shoe.get("description"):
        out.append(f"설명: {shoe['description']}")
    return out


# 질문에서 물은 칸 — 코드 답은 물은 것만 말한다(없으면 무게 · 쿠션 높이 · 앞뒤 높이 차이 · 발매가)
ASKED = {
    "weight": ("무게", "가볍", "무겁", "그램", "몇 g", "몇g"),
    "stackHeight": ("쿠션", "스택", "높이", "두께", "두껍", "두꺼"),
    "drop": ("드롭", "앞뒤", "높이 차이", "높이차"),
    "price": ("가격", "얼마", "발매가", "비싸", "싸요", "저렴"),
    "width": ("발볼", "와이드", "폭", "넓", "좁"),
    "carbon": ("카본", "플레이트"),
    "midsole": ("미드솔", "소재", "폼"),
    "stability": ("안정", "중립", "과내전"),
    "purpose": ("용도", "어디에", "뭐할 때", "어떤 달리기"),
}


def asked_fields(question: str) -> list[str]:
    q = question.replace("앞뒤 높이 차이", "앞뒤")
    out = [k for k, words in ASKED.items() if any(w in q for w in words)]
    if "drop" in out and "stackHeight" in out and "쿠션" not in q and "스택" not in q:
        out.remove("stackHeight")   # "앞뒤 높이"의 "높이"
    if "price" in out and len(out) > 1 and not any(w in q for w in ("가격", "발매가", "비싸", "저렴")):
        out.remove("price")         # "무게 얼마예요"의 "얼마"
    return out


def spec_fallback(shoe: dict, generation_note: bool = False, question: str = "") -> str:
    """LLM 이 실패하거나 숫자가 어긋났을 때 그대로 내보내는 답 — 물은 칸만"""
    name = f"{shoe['brand']}의 {shoe['model']}"
    fields = asked_fields(question)
    if fields:
        return _spec_asked(shoe, name, fields, generation_note)
    head = f"{name} 스펙이에요."
    if generation_note and shoe.get("generation") is not None:
        head += f" {shoe['generation']}세대 기준이에요."
    parts = []
    ws = weight_sentence(shoe, "무게")
    parts.append(ws or "무게는 등록된 정보에 없어요.")
    parts.append(f"쿠션 높이는 {num(shoe['stackHeight'])}mm예요." if shoe.get("stackHeight") is not None else "쿠션 높이는 등록된 정보에 없어요.")
    parts.append(f"앞뒤 높이 차이는 {num(shoe['drop'])}mm예요." if shoe.get("drop") is not None else "앞뒤 높이 차이는 등록된 정보에 없어요.")
    body = " ".join(parts)
    para = [head, body]
    if shoe.get("price") is not None:
        para.append(f"발매가는 {won(shoe['price'])}이에요. {PRICE_NOTE}")
    return "\n\n".join(para)


def _spec_asked(shoe: dict, name: str, fields: list[str], generation_note: bool) -> str:
    """아식스의 젤 카야노 32는 앞뒤 높이 차이가 8mm예요. 쿠션 높이는 40mm예요."""
    none = "등록된 정보에 없어서 확인이 어려워요."
    pairs: list[tuple[str, str]] = []   # (칸 이름, 값 문장)
    extra: list[str] = []
    for f in fields:
        v = shoe.get(f)
        if f == "weight":
            p = weight_phrase(shoe)
            c = weight_converted(shoe)
            pairs.append(("무게", (f"{p}이에요." + (f" 270mm로 환산하면 약 {c}g이에요." if c is not None else "")) if p else none))
        elif f == "stackHeight":
            pairs.append(("쿠션 높이", f"{num(v)}mm예요." if v is not None else none))
        elif f == "drop":
            pairs.append(("앞뒤 높이 차이", f"{num(v)}mm예요." if v is not None else none))
        elif f == "price":
            pairs.append(("발매가", f"{won(v)}이에요. {PRICE_NOTE}" if v is not None else none))
        elif f == "width":
            w = WIDTH_PLAIN.get(shoe.get("width"))
            pairs.append(("발볼", f"{euro(w)} 나와 있어요." if w else none))
            wide = shoe.get("wideAvailable")
            if wide is True:
                extra.append(f"넓은 폭(2E·4E) 버전은 {WIDE_SCOPE.get(shoe.get('wideScope'), '있어요')}.")
            elif wide is False:
                extra.append("넓은 폭(2E·4E) 버전은 따로 없어요.")
        elif f == "carbon":
            pairs.append(("카본 플레이트", "들어 있어요." if v is True else "없어요." if v is False else none))
        elif f == "midsole":
            pairs.append(("쿠션 소재", f"{ieyo(v)}." if v else none))
        elif f == "stability":
            pairs.append(("안정성", f"{ieyo(STABILITY_PLAIN.get(v, v))}." if v else none))
        elif f == "purpose":
            pairs.append(("용도", f"{ieyo(v)}." if v else none))
    sents = []
    for i, (label, val) in enumerate(pairs):
        if i == 0:
            sents.append(f"{josa(name, '은', '는')} {josa(label, '이', '가')} {val}")
        else:
            sents.append(f"{josa(label, '은', '는')} {val}")
    if generation_note and shoe.get("generation") is not None and sents:
        sents.insert(1, f"{shoe['generation']}세대 기준이에요.")
    return " ".join(sents + extra) + "\n\n보러 가실래요?"


# ------------------------------------------------------------------ 비교
def weight_conclusion(a: dict, b: dict, na: str, nb: str) -> str | None:
    """두 켤레 무게 결론 — 8g 규칙. 기준 모름이 끼면 우열을 말하지 않는다"""
    wa, wb = norm270(a), norm270(b)
    if a.get("weight") is None or b.get("weight") is None:
        return None
    if wa is None or wb is None:
        return "기준 사이즈 정보가 없는 신발이 있어서 무게는 바로 견주기 어려워요."
    converted = bool(weight_converted(a) is not None or weight_converted(b) is not None)
    diff = abs(wa - wb)
    lead = "환산해서 보면 " if converted else ""
    if diff < SAME_WEIGHT_G:
        if diff < 0.5:
            return f"{lead}무게는 거의 같아요."
        # 판단은 반올림 전 값(8g 미만), 표시는 내림 — 7.6g 을 "8g 정도라 거의 같다"로 말하면 규칙과 어긋난다
        return f"{lead}차이가 {min(g(diff), SAME_WEIGHT_G - 1)}g 정도라 거의 같은 수준으로 보셔도 돼요."
    lighter = na if wa < wb else nb
    return f"{lead}{josa(lighter, '이', '가')} {g(diff)}g 정도 가벼운 편이에요."


def compare_facts(shoes: list[dict], api: dict) -> tuple[list[str], list[str], str]:
    """(사실 줄, 결론 문장, 코드가 쓴 답 전체). shoes 는 비교 순서대로, api 는 GET /api/compare?ids= 응답"""
    rows = {r["id"]: r for r in api.get("shoes", [])}
    names = [f"{s['brand']}의 {s['model']}" for s in shoes]
    short = [s["model"] for s in shoes]
    lines: list[str] = []
    paras: list[str] = []
    for s, name in zip(shoes, names):
        r = rows.get(s["id"], {})
        lines.append(f"신발: {name}")
        wp = weight_phrase(s)
        wword = (r.get("weight") or {}).get("word")
        if wp:
            c = weight_converted(s)
            lines.append(f"  무게: {wp}" + (f", 270mm로 환산하면 약 {c}g" if c is not None else "") + (f" — {wword}" if wword else ""))
        else:
            lines.append("  무게: 정보 없음")
        for key in ("stackHeight", "drop", "price"):
            v = s.get(key)
            word = (r.get(key) or {}).get("word")
            label = FIELD_NAME[key] if key != "price" else "발매가"
            if v is None:
                lines.append(f"  {label}: 정보 없음")
                continue
            val = won(v) if key == "price" else f"{num(v)}mm"
            lines.append(f"  {label}: {val}" + (f" — {word}" if word else ""))
        paras.append(_compare_para(s, name, r))

    conclusions: list[str] = []
    # 무게 — 8g 규칙
    if len(shoes) == 2:
        wc = weight_conclusion(shoes[0], shoes[1], short[0], short[1])
        if wc:
            conclusions.append(wc)
    else:
        known = [(norm270(s), m) for s, m in zip(shoes, short) if norm270(s) is not None]
        known.sort(key=lambda x: x[0])
        if len(known) >= 2:
            (w1, m1), (w2, m2) = known[0], known[1]
            if w2 - w1 >= SAME_WEIGHT_G:
                conclusions.append(f"270mm로 맞춰 보면 {josa(m1, '이', '가')} 가장 가벼워요. 다음으로 가벼운 {m2}보다 {g(w2 - w1)}g 정도 가벼워요.")
            else:
                conclusions.append(f"270mm로 맞춰 보면 가장 가벼운 쪽은 {m1}{'과' if jong(m1) else '와'} {josa(m2, '이', '가')} 거의 같은 수준이에요.")
    # 쿠션 높이 · 앞뒤 높이 차이 · 가격 — API 밴드가 같으면 "거의 같다", 다르면 "갈린다". 무게는 8g 규칙으로
    same, split = [], []
    for key in ("stackHeight", "drop", "price"):
        words = [(rows.get(s["id"], {}).get(key) or {}).get("word") for s in shoes]
        if any(w is None for w in words) or any(s.get(key) is None for s in shoes):
            continue
        (same if len(set(words)) == 1 else split).append(FIELD_NAME[key])
    if len(shoes) == 2:
        wa, wb = norm270(shoes[0]), norm270(shoes[1])
        if wa is not None and wb is not None:
            (same if abs(wa - wb) < SAME_WEIGHT_G else split).insert(0, "무게")
    if same and split:
        conclusions.append(f"{_and(same)}{'은' if jong(same[-1]) else '는'} 거의 같고, {_and(split)}에서 갈리네요.")
    elif split:
        conclusions.append(f"{_and(split)}에서 갈리네요.")
    elif same:
        conclusions.append(f"{_and(same)} 모두 거의 같은 수준이에요.")
    has_price = any(s.get("price") is not None for s in shoes)

    text = "\n\n".join(
        [f"{_count(len(shoes))} 신발 스펙이에요."] + paras
        + [" ".join(conclusions + ([PRICE_NOTE] if has_price else []))]
        + [f"{_count(len(shoes))} 신발을 나란히 놓고 비교해 봤는데, 보러 가실래요?"]
    )
    return lines, conclusions, text


def _compare_para(s: dict, name: str, r: dict) -> str:
    """노바블라스트 5는 255g(270mm 기준)으로 가벼운 편이고, 쿠션 높이는 41.5mm로 두꺼운 편이에요. …"""
    sents: list[str] = []
    wp = weight_phrase(s)
    ww = (r.get("weight") or {}).get("word")
    first = josa(name, "은", "는")
    if wp:
        c = weight_converted(s)
        conv = f", 270mm로 환산하면 약 {c}g" if c is not None else ""
        sents.append(f"{first} {wp}{conv}" + (f"으로 {ww}이고" if ww else "이고"))
    else:
        sents.append(f"{first} 무게 정보가 없고")
    sh = s.get("stackHeight")
    sw = (r.get("stackHeight") or {}).get("word")
    sents.append(f"쿠션 높이는 {num(sh)}mm" + (f"로 {sw}이에요." if sw else "예요.") if sh is not None else "쿠션 높이 정보는 없어요.")
    tail = []
    if s.get("drop") is not None:
        tail.append(f"앞뒤 높이 차이는 {num(s['drop'])}mm")
    if s.get("price") is not None:
        tail.append(f"발매가는 {won(s['price'])}")
    if tail:
        last = tail[-1]
        sents.append(", ".join(tail[:-1] + [last + ("이에요." if jong(last) else "예요.")]))
    return " ".join([sents[0] + ", " + sents[1]] + sents[2:])


def _and(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + ("이랑 " if jong(items[-2]) else "랑 ") + items[-1] if len(items) == 2 else ", ".join(items[:-1]) + ", " + items[-1]


def _count(n: int) -> str:
    return {2: "두", 3: "세", 4: "네", 5: "다섯"}.get(n, str(n))
