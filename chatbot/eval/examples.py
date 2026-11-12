"""예시 6개의 숫자 · 위치 말이 운영 값과 같은지(2026-11-12 사용자 — 예시가 틀린 숫자를 보이면 모델이 따라 한다).

값은 바뀐다(가격 · 새 세대). 예시를 고정해 두고, 평가 때마다 API 에서 같은 계산으로 다시 만든 글이 예시에 그대로 있는지 본다.
틀리면 평가가 실패한다 — 예시를 고쳐 커밋한다(prompt.EXAMPLES).
"""

from __future__ import annotations


def check(cat, http, facts, prompt) -> list[str]:
    ex = " ".join(prompt.EXAMPLES.split())          # 줄바꿈을 빈칸으로
    issues: list[str] = []

    def shoe(name: str):
        m = cat.find(name)
        return m[0].shoe if m and m[0].shoe else None

    def need(label: str, text: str):
        if text not in ex:
            issues.append(f"{label}: 예시에 '{text}' 가 없다")

    # ① 등록되지 않은 세대 · 같은 라인의 등록된 세대(리뷰 있음)
    m = cat.find("마하 8")
    if not m or m[0].shoe is not None:
        issues.append("①: 마하 8 이 이제 등록되어 있다")
    m7 = shoe("마하 7")
    if not m7 or not (m7.get("reviewCount") or 0):
        issues.append("①: 마하 7 이 없거나 리뷰가 없다")
    need("①", "마하 8은 아직 이 사이트에 등록되어 있지")
    need("①", "같은 라인의 마하 7은 스펙이랑 리뷰가")
    # ③ 쿠션 높이 — 사전의 "두꺼운 편" 경계(신발은 들지 않는다)
    st = next((t for t in cat.terms if t.get("key") == "stackHeight"), None)
    if not st or "40mm 이상이면 두꺼운 편" not in st["description"]:
        issues.append("③: 사전(스택하이트)의 '40mm 이상이면 두꺼운 편'이 바뀌었다")
    need("③", "쿠션 높이가 40mm 이상이면 두꺼운 편")
    # ④ 무게 — 원값 · 기준 · 환산 · 8g 규칙 결론
    a, b = shoe("페가수스 41"), shoe("젤 님버스 27")
    if a and b:
        need("④", f"페가수스 41은 {facts.num(a['weight'])}g인데 {facts.size_mm(a)}mm 기준")
        need("④", f"약 {facts.weight_converted(a)}g")
        need("④", f"젤 님버스 27은 {facts.num(b['weight'])}g이고 {facts.size_mm(b)}mm 기준")
        need("④", facts.weight_conclusion(a, b, "페가수스 41", "님버스 27"))
    else:
        issues.append("④: 신발이 없다")
    # ⑤ 비교 — 값 · 위치 말(비교하기 API)
    n5, c10 = shoe("노바블라스트 5"), shoe("클리프톤 10")
    if n5 and c10:
        api = {r["id"]: r for r in http.get_json("/api/compare", {"ids": f"{n5['id']},{c10['id']}"})["shoes"]}
        for s in (n5, c10):
            r = api[s["id"]]
            need("⑤", facts.weight_phrase(s))
            if facts.weight_converted(s) is not None:
                need("⑤", f"약 {facts.weight_converted(s)}g")
            need("⑤", f"{facts.num(s['stackHeight'])}mm로 {r['stackHeight']['word']}")
            need("⑤", f"{facts.won(s['price'])}")
            if r["weight"]["word"] not in ex.split(s["model"], 1)[-1][:120]:
                issues.append(f"⑤: {s['model']} 무게 위치 말 '{r['weight']['word']}' 가 예시에 없다")
    else:
        issues.append("⑤: 신발이 없다")
    # ⑥ 추천 — 15만원 · 조깅(GET /api/recommend budget)
    try:
        res = http.get_json("/api/recommend", {"purpose": "조깅·회복주", "width": "unknown", "stability": "unknown",
                                               "cushion": "unknown", "budget": "150000"})["results"]
        names = [f"{cat.by_id[r['id']]['brand']}의 {cat.by_id[r['id']]['model']}" for r in res]
        for rank, n in enumerate(names, start=1):
            need("⑥", f"{rank}위는 {n}")
        need("⑥", f"확인한 조건 {res[0]['checked']}개 중 {sum(1 for x in res[0]['reasons'] if x['hit'])}개")
        need("⑥", f"발매가 {facts.won(cat.by_id[res[0]['id']]['price'])}")
    except Exception as e:   # noqa: BLE001 — 운영 API 가 아직 budget 을 모르면(5-1 배포 전) 400
        issues.append(f"⑥: 추천 API 를 부르지 못했다({e.__class__.__name__}) — budget 을 아는 API 로 돌린다")
    return issues
