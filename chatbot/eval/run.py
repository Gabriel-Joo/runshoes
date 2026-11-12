"""챗봇 1단계 평가(작업 5-1, docs/09_chatbot_rag.md 12절) — 전수 자동 검증. 샘플 검수하지 않는다.

  python -m chatbot.eval.run                       # 운영 공개 API(읽기만) + 로컬 Ollama
  python -m chatbot.eval.run --api http://127.0.0.1:3200   # 5-1 이 운영에 오르기 전 — 운영 API 는 예산 금액(budget)을 모른다
  python -m chatbot.eval.run --only C02 --verbose
  python -m chatbot.eval.run --out /tmp/eval.json  # 문항별 결과 · 답 전문

문항: golden.jsonl(용어 10 · 스펙 10 · 비교 10 · 추천 15 — Claude 초안) + golden-boundary.jsonl(경계 15 — 사용자가 쓴다, draft 줄은 건너뛴다).
없는 신발 · 용어 기록(V18 POST)은 보내지 않고 가로채서 본다 — 운영에 쓰지 않는다.

검사
- 갈래 · 이름 찾기(기대 신발 = 답에 붙은 신발) · 용어 답이 사전 원문 그대로 · 추천 조건 추출 · 추천 결과 = GET /api/recommend(화면과 같은 답)
- 수치: 답 속 숫자가 API 원값(무게 · 쿠션 높이 · 앞뒤 높이 차이 · 발매가 · 환산값 · 환산 차이 · 세대)과 문장 · 설명에 있는 것뿐인지
- 8g 규칙 · 전문의 안내(통증 문항 누락 0) · 진단성 표현 · 금칙어 · 이모지 · 해요체 · 쉬운 말 · 브랜드 첫 언급 · 발매가 문장 · 버튼 규칙
- 용어 사본 대조: chatbot/terms.py 의 WIDE_TERM · 안정성 설명이 src/utils/terms.ts 와 같은지(두 벌이라 — 사용자 2절)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="https://runshoes.ronanlab.dev", help="런슈즈 API(읽기만 한다)")
    ap.add_argument("--ollama", default="http://127.0.0.1:11434")
    ap.add_argument("--only", help="문항 id 들(쉼표)")
    ap.add_argument("--out", help="결과 JSON")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    os.environ["RUNSHOES_API"] = a.api
    os.environ["OLLAMA_URL"] = a.ollama

    from chatbot import facts, http, prompt  # noqa: E402 — 주소를 정한 뒤에 읽는다
    from chatbot.bot import Bot, State
    from chatbot.branches import recommend
    from chatbot.catalog import Catalog
    from chatbot.reply import numbers
    from chatbot.terms import STABILITY_DESCRIPTION, WIDE_TERM, Dictionary

    items = load_items(a.only)
    cat = Catalog.load()
    dic = Dictionary(cat.terms)
    by_name = {f"{s['brand']} {s['model']}": s for s in cat.shoes}
    posts: list[dict] = []
    bot = Bot(load=lambda: cat, post=lambda body: posts.append(body))

    results = []
    copy_issues = check_term_copy(WIDE_TERM, STABILITY_DESCRIPTION)
    for it in items:
        st = State()
        posts.clear()
        t0 = time.time()
        for s in it.get("setup", []):
            bot.turn(st, s)
        posts.clear()
        reply, trace = bot.turn(st, it["q"])
        time.sleep(0.3)   # 기록 스레드가 끝나게
        dt = time.time() - t0
        fails: list[str] = []
        warns: list[str] = []
        text = reply.text
        ids = [s["id"] for s in reply.shoes]

        # 갈래
        if it.get("branch") and trace["branch"] != it["branch"]:
            fails.append(f"갈래 {trace['branch']} ≠ {it['branch']}")
        if "health" in it and trace["health"] != it["health"]:
            fails.append(f"health_context {trace['health']} ≠ {it['health']}")
        # 이름 찾기
        if "shoes" in it:
            want = []
            for n in it["shoes"]:
                if n not in by_name:
                    fails.append(f"문항의 신발이 카탈로그에 없다: {n}")
                else:
                    want.append(by_name[n]["id"])
            if sorted(want) != sorted(ids):
                fails.append(f"신발 {ids} ≠ 기대 {want}")
        # 용어 — 사전 원문 그대로
        if it.get("cat") == "term":
            for key in it.get("terms", []):
                e = dic.by_key.get(key)
                if not e or e["description"] not in text:
                    fails.append(f"용어 {key} 원문이 답에 없다")
            if not it.get("terms") and not text.startswith(prompt.NO_TERM.split("{")[0][:20]):
                fails.append("사전에 없는 용어인데 거절 문구가 아니다")
        # 기록(V18)
        if it.get("miss"):
            if not any(p["kind"] == it["miss"]["kind"] and p["query"] == it["miss"]["query"] for p in posts):
                fails.append(f"기록 없음 {it['miss']} (보낸 것 {posts})")
        # 추천 — 조건 추출 · 결과가 API 와 같은가
        rec_reasons = ""
        if it.get("ask_purpose"):
            if prompt.ASK_PURPOSE.split("?")[0] not in text and prompt.ASK_PURPOSE_CALM.split(".")[0] not in text:
                fails.append("용도를 되묻지 않았다")
        if "conditions" in it:
            used = {k: v for k, v in (trace.get("conditions_used") or {}).items() if v is not None}
            if used != it["conditions"]:
                fails.append(f"조건 추출 {used} ≠ {it['conditions']}")
            if used.get("purpose"):
                # 화면과 같은 답 — 챗봇이 넘긴 조건 그대로 API 를 다시 불러 상위 3이 같은지
                p, _ = recommend.params(used)
                api = http.get_json("/api/recommend", p)["results"]
                rec_reasons = json.dumps(api, ensure_ascii=False)
                if [r["id"] for r in api] != ids:
                    fails.append(f"추천 결과 {ids} ≠ API {[r['id'] for r in api]}")
        # 무게 8g 규칙
        rule = it.get("weight_rule")
        if rule == "judge" and ("거의 같은" in text or "가벼운 편" not in text and "가벼워요" not in text):
            fails.append("8g 이상인데 우열을 말하지 않았다")
        if rule == "same" and "거의 같은" not in text:
            fails.append("8g 미만인데 '거의 같은 수준'이 없다")
        if rule == "unknown_size" and "기준 사이즈" not in text:
            fails.append("기준 모름을 밝히지 않았다")
        for c in it.get("contains", []):
            if c not in text:
                fails.append(f"'{c}' 없음")
        for c in it.get("not_contains", []):
            if c in text:
                fails.append(f"'{c}' 있음")

        # 수치 — API 원값과 대조
        allowed = allowed_numbers(it["q"], reply.shoes, dic, rec_reasons, facts) | numbers(" ".join(it.get("setup", [])))
        bad = numbers(text) - allowed
        if bad:
            fails.append(f"API 에 없는 숫자 {sorted(bad)}")
        # 안전 문구 · 표현
        if it.get("health") is True and prompt.DOCTOR not in text:
            fails.append("전문의 안내 누락")
        if text.count(prompt.DOCTOR) > 1:
            fails.append("전문의 안내가 두 번")
        if it.get("health") is not True and prompt.DOCTOR in text:
            warns.append("통증 문항이 아닌데 전문의 안내가 붙었다")
        if re.search(r"때문입니다|때문이에요|증상|치료|나을 거|좋아질 거|낫게", text.replace(prompt.DOCTOR, "")):
            fails.append("진단성 표현")
        if re.search(r"러너들이|실제 사용자|많은 사람들이|전문가|완벽한 선택|죄송합니다만|(?<!카본 )플레이트", text):
            fails.append("금칙어")
        if re.search("[\U0001F000-\U0001FAFF☀-➿]", text):
            fails.append("이모지")
        if it.get("cat") != "term" and trace["branch"] != "term":
            for sent in sentences(text):
                if re.search(r"(다|야|어|지|해|자|네|군|걸)[.!]?$", sent) and not sent.endswith(("거든요", "네요")):
                    warns.append(f"해요체 아님: {sent[-20:]}")
                if "!" in sent and re.search(r"\d", sent):
                    warns.append(f"수치 문장에 느낌표: {sent[-30:]}")
            for w in ("스택하이트", "드롭", "미드솔", "와이드 모델"):
                if w in text:
                    warns.append(f"쉬운 말 아님: {w}")
            for s in reply.shoes:
                i = text.find(s["model"])
                if i >= 0 and not text[:i].endswith(f"{s['brand']}의 "):
                    warns.append(f"브랜드 첫 언급 없음: {s['model']}")
            if re.search(r"\d원", text) and facts.PRICE_NOTE not in text and "발매가 기준" not in text:
                warns.append("가격을 말했는데 발매가 문장이 없다")
        # 버튼
        links = reply.links()
        if trace["branch"] == "out_of_scope" and links:
            fails.append("범위 밖 답에 버튼")
        if len(set(ids)) == 1 and links and not links[0]["href"].startswith("/?shoe="):
            fails.append("1켤레인데 상세 모달이 아니다")
        if len(set(ids)) >= 2 and not links[0]["href"].startswith("/compare?ids="):
            fails.append("2켤레 이상인데 비교하기가 아니다")
        if it.get("links") is False and links:
            fails.append("버튼이 없어야 한다")
        if any(l["label"] != prompt.LINK_LABEL for l in links):
            fails.append("버튼 라벨이 '보러 가기'가 아니다")

        ok = not fails
        results.append({"id": it["id"], "cat": it["cat"], "ok": ok, "fails": fails, "warns": warns, "q": it["q"], "answer": text,
                        "links": links, "trace": trace, "fallback": reply.fallback_used, "seconds": round(dt, 1)})
        mark = "PASS" if ok else "FAIL"
        print(f"{mark} {it['id']:4} {dt:5.1f}s {'(코드 답)' if reply.fallback_used else ''} {'; '.join(fails)}"
              + (f"  [경고 {len(warns)}]" if warns else ""))
        if a.verbose or not ok:
            print("     " + text.replace("\n", "\n     "))
            for w in warns:
                print(f"     · {w}")

    summary(results, copy_issues)
    if a.out:
        Path(a.out).write_text(json.dumps({"results": results, "term_copy": copy_issues}, ensure_ascii=False, indent=1))
    return 0 if all(r["ok"] for r in results) and not copy_issues else 1


def load_items(only: str | None) -> list[dict]:
    items = []
    for name in ("golden.jsonl", "golden-boundary.jsonl"):
        p = HERE / name
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.strip():
                it = json.loads(line)
                if not it.get("draft"):
                    items.append(it)
    if only:
        keep = set(only.split(","))
        items = [i for i in items if i["id"] in keep]
    return items


def sentences(text: str) -> list[str]:
    out = []
    for para in text.split("\n"):
        for s in re.split(r"(?<=[.!?])\s+", para.strip()):
            if s and not s.startswith("·"):
                out.append(s.strip())
    return out


def allowed_numbers(question: str, shoes: list[dict], dic, rec_reasons: str, facts) -> set[str]:
    """답에 나와도 되는 숫자 — API 원값에서 다시 계산한다(챗봇의 사실 문장을 믿지 않는다)"""
    from chatbot.reply import numbers
    src = [question, rec_reasons, "265 270 275 280 285 1 2 3 4 5 2E 4E"]
    norms = []
    for s in shoes:
        for k in ("weight", "stackHeight", "drop", "price", "generation"):
            if s.get(k) is not None:
                src.append(f"{facts.num(s[k])}")
        src += [s["model"], s.get("modelEn") or "", s.get("description") or "", s.get("summary") or "", s.get("midsole") or ""]
        n = facts.norm270(s)
        if n is not None:
            src.append(str(facts.g(n)))
            norms.append(n)
    for i in range(len(norms)):
        for j in range(i + 1, len(norms)):
            d = abs(norms[i] - norms[j])
            src.append(str(facts.g(d)))
            if d < facts.SAME_WEIGHT_G:
                src.append(str(min(facts.g(d), facts.SAME_WEIGHT_G - 1)))   # 8g 미만은 내림해 말한다
    for e in dic.entries:
        src.append(e["description"])
        src += [v for pair in e.get("values") or [] for v in pair]
    # 셋 중 비교 · 예산 칸(20만원 · 30만원)
    src.append("20 30 200000 300000")
    return numbers(" ".join(src))


def check_term_copy(wide: dict, stability_desc: str) -> list[str]:
    """chatbot/terms.py 의 사본 ↔ src/utils/terms.ts — 글자까지 같아야 한다"""
    ts = (ROOT / "src/utils/terms.ts").read_text()
    m = re.search(r"export const WIDE_TERM: Term = \{(.*?)\n\};", ts, re.S)
    issues = []
    if not m:
        return ["terms.ts 에서 WIDE_TERM 을 찾지 못했다"]
    block = re.sub(r"//.*", "", m.group(1))
    ts_strings = re.findall(r'"([^"]*)"', block)
    ours = [wide["key"], wide["name"], wide["short"], wide["description"]] + [v for pair in wide["values"] for v in pair]
    if ts_strings != ours:
        issues.append(f"WIDE_TERM 이 다르다: terms.ts {ts_strings} ≠ 챗봇 {ours}")
    if f'description: "{stability_desc}"' not in ts:
        issues.append("stabilityTerm 설명이 terms.ts 와 다르다")
    return issues


def summary(results: list[dict], copy_issues: list[str]) -> None:
    print("\n— 요약")
    cats: dict[str, list[dict]] = {}
    for r in results:
        cats.setdefault(r["cat"], []).append(r)
    for c, rs in cats.items():
        print(f"  {c:10} {sum(r['ok'] for r in rs)}/{len(rs)}  경고 {sum(len(r['warns']) for r in rs)}  코드 답 {sum(r['fallback'] for r in rs)}")
    total = len(results)
    print(f"  전체 {sum(r['ok'] for r in results)}/{total} · 평균 {sum(r['seconds'] for r in results) / max(total, 1):.1f}s")
    bad_num = sum(any(f.startswith("API 에 없는 숫자") for f in r["fails"]) for r in results)
    print(f"  수치 불일치 문항 {bad_num} · 전문의 누락 {sum('전문의 안내 누락' in r['fails'] for r in results)}")
    print("  용어 사본 대조: " + ("같다" if not copy_issues else "; ".join(copy_issues)))


if __name__ == "__main__":
    sys.exit(main())
