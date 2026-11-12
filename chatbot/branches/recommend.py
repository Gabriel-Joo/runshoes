"""추천 — GET /api/recommend 를 그대로 쓴다. 추천 계산 규칙은 바꾸지 않는다(10_recommend 1절 — 지시로만).

자유 문장의 조건은 라우터 LLM 이 뽑고(router.clean_conditions 가 API 값 밖을 버린다) 나머지는 "잘 모르겠어요"(unknown).
용도는 API 가 늘 요구한다 — 없으면 하나만 되묻는다.
예산은 말한 금액 그대로 보낸다 — budget=<원>(작업 5-1, 2026-11-12 사용자. 화면은 드롭다운이라 칸 셋이지만 챗봇은 자유 문장이다).
금액이 없는 말("저렴한 걸로" · "비싸도 괜찮아요")만 화면의 칸으로 맞추고 그렇게 밝힌다.
"""

from __future__ import annotations

from .. import facts, http
from ..facts import ieyo, josa
from ..reply import Reply
from .common import generate

ORDER = ("purpose", "width", "stability", "cushion", "price")
COND_NAME = {"purpose": "용도", "width": "발볼", "stability": "안정성", "cushion": "쿠션", "price": "예산"}
CAP = {"low": 200000, "mid": 300000}

TASK = (
    "추천 결과를 말한다. 첫 줄은 \"조건에 맞춰 찾아봤어요!\". 1위는 \"확인한 조건 N개 중 M개가 맞아요\"와 맞은 이유를, "
    "보지 않은 조건 문장을 넣고, 2위 · 3위는 한두 문장씩. [결론 문장]의 비교만 쓰고 새 비교를 만들지 않는다. "
    "가격을 말한 단락 끝에 발매가 문장을 한 번. 마무리는 격려 한 줄."
)


def params(cond: dict) -> tuple[dict, list[str]]:
    """API 인자 · 예산 문장. 금액이 있으면 budget, 없으면 price 칸(금액이 없는 말만)"""
    p = {
        "purpose": cond["purpose"],
        "width": cond.get("width", "unknown"),
        "stability": cond.get("stability", "unknown"),
        "cushion": cond.get("cushion", "unknown"),
    }
    notes: list[str] = []
    b = cond.get("budget_won")
    level = cond.get("price_level")
    if b is not None:
        p["budget"] = str(b)
    elif level in CAP:
        p["price"] = level
        notes.append(f"금액을 말씀하지 않으셔서 예산은 추천받기의 '{CAP[level] // 10000}만원까지'로 봤어요.")
    else:
        p["price"] = "unknown"
        if level == "any":
            notes.append("가격은 상관없다고 하셔서 따로 보지 않았어요.")
    return p, notes


def capped(p: dict) -> bool:
    return "budget" in p or p.get("price") in CAP


def _skipped(shoe: dict, p: dict) -> set[str]:
    """물었지만 데이터가 없어 API 가 못 본 조건 — reasons 에 줄이 없다(RecommendPolicy)"""
    s = set()
    if p["width"] == "넓음" and shoe.get("width") is None and shoe.get("wideAvailable") is not True:
        s.add("width")
    if p["cushion"] != "unknown" and shoe.get("stackHeight") is None:
        s.add("cushion")
    if capped(p) and shoe.get("price") is None:
        s.add("price")
    return s


def _asked(p: dict) -> set[str]:
    out = {"purpose"}
    if p["width"] == "넓음":           # 보통 · 모르겠어요는 발볼을 보지 않는다(10_recommend 1-1)
        out.add("width")
    for k in ("stability", "cushion"):
        if p[k] != "unknown":
            out.add(k)
    if capped(p):
        out.add("price")
    return out


def answer(question: str, cond: dict, catalog, health: bool, history: list[dict]) -> Reply:
    p, budget_notes = params(cond)
    res = http.get_json("/api/recommend", p).get("results", [])
    shoes = [catalog.by_id[r["id"]] for r in res if r["id"] in catalog.by_id]
    if not shoes:
        return Reply("조건에 맞는 신발을 찾지 못했어요. 조건을 하나 줄여서 다시 찾아볼까요?", branch="recommend")
    asked = _asked(p)
    # 말하지 않은 조건과, 말했지만 추천받기가 보지 않는 조건(발볼 보통 — 10_recommend 1-1)을 나눠 말한다
    said = {"width": "width" in cond, "stability": "stability" in cond, "cushion": "cushion" in cond,
            "price": "budget_won" in cond or "price_level" in cond}
    unasked = [COND_NAME[k] for k in ORDER if k != "purpose" and not said[k]]
    said_unchecked = ["발볼은 보통이라고 하셔서 따로 보지 않았어요."] if cond.get("width") == "보통" else []

    lines: list[str] = []
    paras: list[str] = ["조건에 맞춰 찾아봤어요!"]
    for rank, (r, shoe) in enumerate(zip(res, shoes), start=1):
        name = f"{shoe['brand']}의 {shoe['model']}"
        hits = sum(1 for x in r["reasons"] if x.get("hit"))
        lines.append(f"{rank}위: {name}")
        lines.append(f"  확인한 조건 {r['checked']}개 중 {hits}개가 맞아요")
        keys = [k for k in ORDER if k not in _skipped(shoe, p)]
        aligned = len(keys) == len(r["reasons"])
        reasons_hit: list[str] = []
        for i, x in enumerate(r["reasons"]):
            k = keys[i] if aligned else None
            text = x["text"]
            if k is not None and k not in asked:
                label = "참고"
            else:
                label = "맞음" if x.get("hit") else ("안 맞음" if aligned else "참고")
            if label == "맞음":
                reasons_hit.append(text)
            lines.append(f"  {label}: {text}")
        for n in r.get("notes") or []:
            lines.append(f"  못 본 조건: {n}")
        lines.append(f"  " + "; ".join(x for x in facts.shoe_facts(shoe)[3:7]))
        if rank == 1:
            para = f"1위는 {ieyo(name)}. 확인한 조건 {r['checked']}개 중 {hits}개가 맞아요."
            if reasons_hit:
                para += " " + " ".join(t if t.endswith(("요", ".")) else t + "." for t in reasons_hit)
            paras.append(para)
            if unasked:
                ua = _and(unasked)
                paras.append(f"{josa(ua, '은', '는')} 말씀해주지 않으셔서 보지 않았어요."
                             + (" 혹시 발볼이 넓은 편이시면 알려주세요. 다시 찾아볼게요." if "발볼" in unasked else ""))
            if said_unchecked:
                paras.append(" ".join(said_unchecked))
        else:
            paras.append(f"{rank}위는 {ieyo(name)}. 확인한 조건 {r['checked']}개 중 {hits}개가 맞아요.")

    conclusions = budget_notes + _among(shoes)
    if conclusions:
        paras.append(" ".join(conclusions))
    if any(s.get("price") is not None for s in shoes):
        paras.append(facts.PRICE_NOTE)
    paras.append("좋은 신발 만나시길 바랄게요!")
    fallback = "\n\n".join(paras)
    unasked_line = ([f"보지 않은 조건: {', '.join(unasked)}(말씀하지 않으셔서)"] if unasked else []) + [f"보지 않은 조건: {x}" for x in said_unchecked]
    text, used = generate(question, lines + unasked_line, conclusions, fallback, health, history, TASK)
    return Reply(text, shoes, fallback_used=used, branch="recommend")


def _among(shoes: list[dict]) -> list[str]:
    """셋 중 비교 — 무게(270mm 환산, 8g 규칙) · 발매가 · 쿠션 높이. 코드가 정한 것만 LLM 이 말한다"""
    out: list[str] = []
    if len(shoes) < 2:
        return out
    n = len(shoes)
    who = "셋" if n == 3 else "둘"
    w = sorted(((facts.norm270(s), s["model"]) for s in shoes if facts.norm270(s) is not None), key=lambda x: x[0])
    if len(w) == n and w[1][0] - w[0][0] >= facts.SAME_WEIGHT_G:
        out.append(f"{who} 중에서는 {josa(w[0][1], '이', '가')} 가장 가벼워요(270mm로 맞춰 봤을 때).")
    pr = sorted(((s["price"], s["model"]) for s in shoes if s.get("price") is not None), key=lambda x: x[0])
    if len(pr) == n and pr[0][0] < pr[1][0]:
        out.append(f"발매가는 {josa(pr[0][1], '이', '가')} 가장 낮아요.")
    st = sorted(((s["stackHeight"], s["model"]) for s in shoes if s.get("stackHeight") is not None), key=lambda x: -x[0])
    if len(st) == n and st[0][0] > st[1][0]:
        out.append(f"쿠션 높이는 {josa(st[0][1], '이', '가')} 가장 높아요.")
    return out


def _and(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return items[0] + ("이랑 " if facts.jong(items[0]) else "랑 ") + items[1]
    return ", ".join(items[:-1]) + ", " + items[-1]
