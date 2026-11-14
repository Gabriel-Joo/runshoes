"""챗봇 1단계 평가(작업 5-1, docs/09_chatbot_rag.md 12절) — 전수 자동 검증. 샘플 검수하지 않는다.

  python -m chatbot.eval.run                       # 운영 공개 API(읽기만) + 로컬 Ollama
  python -m chatbot.eval.run --api http://127.0.0.1:3200   # 5-1 이 운영에 오르기 전 — 운영 API 는 예산 금액(budget)을 모른다
  python -m chatbot.eval.run --only C02 --verbose
  python -m chatbot.eval.run --out /tmp/eval.json  # 문항별 결과 · 답 전문

문항: golden.jsonl(용어 10 · 스펙 10 · 비교 10 · 추천 15 — Claude 초안) + golden-boundary.jsonl(경계 15 — 사용자가 쓴다, draft 줄은 건너뛴다).
문항은 웹소켓을 거치지 않고 Bot 을 바로 부른다 — 로그인과 상관없다. 로그인 문턱은 끝에 login.py(L01~, 실제 handler + 가짜 /api/me)로 따로 본다.
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
    ap.add_argument("--model-service", default=os.environ.get("MODEL_SERVICE_URL") or "http://192.168.122.1:8200",
                    help="임베딩(model-service) — 챗봇 코드에는 기본값이 없다(env 로만)")
    ap.add_argument("--only", help="문항 id 들(쉼표)")
    ap.add_argument("--out", help="결과 JSON")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    os.environ["RUNSHOES_API"] = a.api
    os.environ["OLLAMA_URL"] = a.ollama
    os.environ["MODEL_SERVICE_URL"] = a.model_service

    from chatbot import facts, http, prompt  # noqa: E402 — 주소를 정한 뒤에 읽는다
    from chatbot.bot import Bot, State
    from chatbot.branches import recommend
    from chatbot.catalog import Catalog
    from chatbot.reply import help_claims, numbers
    from chatbot.terms import STABILITY_DESCRIPTION, WIDE_TERM, Dictionary

    items = load_items(a.only)
    cat = Catalog.load()
    dic = Dictionary(cat.terms)
    by_name = {f"{s['brand']} {s['model']}": s for s in cat.shoes}
    posts: list[dict] = []
    # 검색 색인(5-2) — 평가가 읽는 API 로 한 번 만든다(model-service 를 부른다). 갱신 스레드는 띄우지 않는다
    from chatbot.search.service import Searcher
    searcher = Searcher()
    print(f"색인 {searcher.sync()}")
    bot = Bot(load=lambda: cat, post=lambda body: posts.append(body), searcher=searcher)
    # 몸풀기 — 한동안 질문이 없으면 Ollama 가 모델을 내려서(약 5분) 첫 질문이 모델을 올리느라 몇 초 더 걸린다
    # (2026-11-14 운영 확인 10.9초, 평가 4.3 ~ 4.7초). 문항 전에 챗봇과 같은 모델 · 옵션(llm.chat)으로 한 번 말을 걸어 올려 두고,
    # 문항 시간에는 넣지 않는다. 첫 문항을 빼면 --only 로 한 문항만 잴 때 잴 것이 없어진다(사용자 2026-11-14)
    from chatbot import llm
    w0 = time.time()
    try:
        llm.chat("한 문장으로 짧게 답한다.", [{"role": "user", "content": "안녕하세요"}], num_predict=64)
        print(f"몸풀기 {time.time() - w0:.1f}s — 모델을 올려 둔다(문항 시간에 넣지 않는다)")
    except Exception as e:   # noqa: BLE001 — 몸풀기가 실패해도 평가는 돈다
        print(f"몸풀기 실패 {time.time() - w0:.1f}s({e!r}) — 첫 문항 시간에 모델 올리는 시간이 섞일 수 있다")

    results = []
    copy_issues = check_term_copy(WIDE_TERM, STABILITY_DESCRIPTION)
    from chatbot.eval import examples as example_check
    copy_issues += [f"예시 {x}" for x in example_check.check(cat, http, facts, prompt)]
    for it in items:
        st = State()
        posts.clear()
        for s in it.get("setup", []):
            bot.turn(st, s)
        posts.clear()
        # 시간은 묻는 질문 하나만 — 앞 턴(setup)까지 재면 「두 번 묻는 데 걸린 시간」이 된다(사용자 2026-11-14)
        t0 = time.time()
        reply, trace = bot.turn(st, it["q"])
        time.sleep(0.3)   # 기록 스레드가 끝나게
        dt = time.time() - t0
        fails: list[str] = []
        warns: list[str] = []
        text = reply.text
        ids = [s["id"] for s in reply.shoes]
        # 관점 없는 경험·후기 — 요약 블록이 API 원문 그대로인지 보고, 아래 검사(금칙어 · 숫자 · 말투)에서는 뺀다.
        # 상세 화면에 이미 나가는 글이라 챗봇이 검사하지 않는다(사용자 2026-11-13). 요약 품질 검사는 요약 배치 쪽 일
        if trace["branch"] == "experience":
            text, s_fails = check_summary_block(text, reply, it["q"])
            fails += s_fails

        # 갈래
        if it.get("branch") and trace["branch"] != it["branch"]:
            fails.append(f"갈래 {trace['branch']} ≠ {it['branch']}")
        if it.get("branch_any") and trace["branch"] not in it["branch_any"]:
            fails.append(f"갈래 {trace['branch']} ∉ {it['branch_any']}")
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
        if "sets" in it:
            # 추천 조건 여러 벌(사용자 2026-11-14) — 용도마다 한 벌씩 다 나왔는지, 벌마다 PER_SET 켤레인지.
            # 챗봇이 넘긴 조건마다 API 를 다시 불러, 앞 벌에 나온 신발을 빼고 상위 PER_SET 켤레를 이어 붙인 것과 같아야 한다
            conds = [trace.get("conditions_used") or {}] + list(trace.get("conditions_more") or [])
            purposes = [c.get("purpose") for c in conds]
            if purposes != it["sets"]:
                fails.append(f"조건 벌의 용도 {purposes} ≠ {it['sets']}")
            want, apis = [], []
            for c in conds:
                if not c.get("purpose"):
                    continue
                p, _ = recommend.params(c)
                api = http.get_json("/api/recommend", p)["results"]
                apis += api
                want += [r["id"] for r in api if r["id"] not in want][:recommend.PER_SET]
            rec_reasons = json.dumps(apis, ensure_ascii=False)
            if ids != want:
                fails.append(f"추천 결과 {ids} ≠ 벌마다 상위 {recommend.PER_SET}켤레 {want}")
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
        # 특성 설명이 있는가 — 사전 용어를 근거로 쓴 설명이 되묻기 · 안내 문장 말고 실제로 있는지(사용자 2026-11-12)
        if it.get("explain"):
            core = text.replace(prompt.DOCTOR, "").replace(prompt.EXPLAIN_TAIL, "").replace(prompt.ASK_PURPOSE_CALM, "").replace(prompt.ASK_PURPOSE, "").strip()
            if not trace.get("explained"):
                fails.append("특성 설명 없음(근거로 쓴 사전 용어가 없다)")
            elif len(core) < 40:
                fails.append(f"특성 설명이 너무 짧다({len(core)}자)")
        for rx in it.get("not_regex", []):          # 경계 문항 — 몸 판단 · 단정 · 1등 고르기(사용자 2026-11-12)
            if re.search(rx, text):
                fails.append(f"/{rx}/ 걸림")

        # 경험·후기(5-2) — 분모 · 세 칸 합 · Hit@5
        review_src = ""
        if trace["branch"] == "experience":
            counts = {s["id"]: http.get_json("/api/reviews", {"shoeId": s["id"]}) for s in reply.shoes}
            review_src = " ".join(r["content"] for rs in counts.values() for r in rs) + " " + " ".join(str(len(v)) for v in counts.values())
            fails += check_denominator(text, {k: len(v) for k, v in counts.items()}, trace, it)
            # 집계 숫자(언급 · 좋다 · 아쉽다)는 코드가 센 것 — 위 분모 · 칸 검사가 따로 본다.
            # LLM 글의 숫자는 check_experience 가 리뷰 원문만으로 따로 본다(6차 수정 3 — 건수 없이, 리뷰 속 숫자만)
            contents = " ".join(r["content"] for rs in counts.values() for r in rs)
            review_src += " " + " ".join(str(t[k]) for t in trace.get("tally") or [] for k in ("n", "k", "pos", "neg"))
            fails += check_experience(text, reply, trace, contents)
        if it.get("hit_any"):
            want = {by_name[n]["id"] for n in it["hit_any"] if n in by_name}
            top5 = (trace.get("ranked") or [])[:5]
            if not want & set(top5):
                fails.append(f"Hit@5 실패 — 상위 5 {top5} 에 정답 {sorted(want)} 없음")

        # 수치 — API 원값과 대조
        allowed = (allowed_numbers(it["q"], reply.shoes, dic, rec_reasons, facts) | numbers(" ".join(it.get("setup", [])))
                   | numbers(review_src) | ({"30", "10"} if trace["branch"] == "experience" else set()))
        bad = numbers(text) - allowed
        if bad:
            fails.append(f"API 에 없는 숫자 {sorted(bad)}")
        # 안전 문구 · 표현
        if it.get("health") is True and prompt.DOCTOR not in text:
            fails.append("전문의 안내 누락")
        if text.count(prompt.DOCTOR) > 1:
            fails.append("전문의 안내가 두 번")
        # 묻는 말이 둘(E14 · 5-1 B02 와 같은 문제 — 사용자 2026-11-13) — 모든 갈래 실패.
        # 2차까지는 "?"로 끝나는 문장만 셌다 — 용도 묻기("…알려주시면 그에 맞춰 찾아볼게요.")는 마침표라 B05 · B09 의 두 번을 놓쳤다(3차 수정)
        one_ask = text   # 코드 고정 문구 하나(용도 묻기 · 신발 되묻기 두 문장)는 묻는 말 하나로 — ASK_SHOE 는 E25 에서 더함(2026-11-14)
        for c in (prompt.ASK_PURPOSE, prompt.ASK_PURPOSE_CALM, prompt.ASK_SHOE):
            one_ask = one_ask.replace(c, "용도를 묻는다?")
        asks = [s for s in sentences(one_ask) if s.endswith("?") or re.search(r"알려\s*주시면|말씀해\s*주시면", s)]
        if len(asks) > 1:
            fails.append(f"묻는 말 {len(asks)}개: {' / '.join(a[-25:] for a in asks)}")
        # 코드가 붙이는 문장을 LLM 이 따라 씀 · 지우다 남은 조각(3차 수정 5) — 코드 고정 문구의 문장이 두 번 나오면.
        # 여러 켤레의 소개 문장처럼 코드가 신발마다 같은 꼴로 쓰는 문장은 보지 않는다(일부러 되풀이한다)
        def _k(s: str) -> str:
            return re.sub(r"[\s\"'.,!?·—:>-]", "", s)
        keys = [_k(s) for s in sentences(text)]
        fixed = {_k(s) for c in (prompt.ASK_PURPOSE, prompt.ASK_PURPOSE_CALM, prompt.EXPLAIN_TAIL, prompt.DOCTOR, facts.PRICE_NOTE, "보러 가실래요?")
                 for s in re.split(r"(?<=[.!?])\s+", c)}
        dup = sorted(k for k in fixed if keys.count(k) > 1)
        if dup:
            fails.append(f"코드 문장이 두 번: {dup[0][:25]}")
        # 인용을 다시 씀(3차 수정 2) — 인용 블록의 문장이 인용 밖에 또 나오면
        quoted = {_k(s) for l in text.split("\n") if l.startswith(">") for s in re.split(r"(?<=[.!?])\s+", l[1:].strip()) if len(_k(s)) >= 8}
        if quoted & set(keys):
            fails.append("인용한 문장을 인용 밖에서 다시 씀")
        # 겹침(2차 수정 4) — 코드가 붙인 문장과 LLM 글이 겹치는지 센다: "다만" 두 번 · 리뷰 원문을 따옴표로 옮김(인용은 코드 블록)
        plain = "\n".join(l for l in text.split("\n") if not l.startswith(">"))
        if plain.count("다만") > 1:
            warns.append(f"'다만' {plain.count('다만')}번")
        if trace["branch"] == "experience" and re.search(r"\"[^\"]{8,}\"", plain):
            warns.append("리뷰 원문을 따옴표로 옮김")
        if it.get("health") is not True and prompt.DOCTOR in text:
            warns.append("통증 문항이 아닌데 전문의 안내가 붙었다")
        body = text.replace(prompt.DOCTOR, "")
        if re.search(r"때문입니다|때문이에요|증상이에요|증상입니다|치료|이시네요|하시네요|나을 거|좋아질 거|낫게", body):
            fails.append("진단성 표현")
        if re.search(r"나아져요|나아질 거|해결돼요|해결됩니다|해결될 거|좋아집니다|좋아져요|줄어들 거예요|막아 줄 거예요", body):
            fails.append("효과 약속")
        if (trace["branch"] in ("explain",) or trace.get("explained")) and not reply.shoes:   # 설명문에서 신발을 받았으면 된다(5-2)
            if re.search(r"(등록된|이 사이트의?)\s*(신발|모델)|(모델|신발)들?이\s*(있어요|많아요)|(이|가)\s*해당(해요|돼요)", body):
                fails.append("근거에 신발이 없는데 목록 이야기")
        hb, hu = help_claims(body)
        for s_ in hb:
            fails.append(f"효과 약속(신발이 몸에 도움): {s_[:50]}")
        for s_ in hu:
            warns.append(f"'도움이' 주어를 가리기 어려움 — 사람이 읽는다: {s_[:50]}")
        if re.search(r"러너들이|실제 사용자|많은 사람들|대부분의 사용자|사용자들|전문가|완벽한 선택|죄송합니다만", text):
            fails.append("금칙어")
        # "카본" 없는 "플레이트"는 리뷰에서 온 말일 때만 막는다 — 설명문 · 스펙에는 "판(플레이트)은 나일론"이 실제로 있다
        # (엔돌핀 스피드 4, 3차 수정 S10). 리뷰를 말하는 문장(경험·후기 갈래에서 "리뷰"가 든 문장)만 본다
        if trace["branch"] == "experience" and any(re.search(r"(?<!카본 )플레이트", s) and "리뷰" in s for s in sentences(text)):
            fails.append("금칙어(리뷰에서 카본 없는 플레이트)")
        if re.search("[\U0001F000-\U0001FAFF☀-➿]", text):
            fails.append("이모지")
        if it.get("cat") != "term" and trace["branch"] != "term":
            for sent in sentences(text):
                if re.search(r"(다|야|어|지|해|자|네|군|걸)[.!]?$", sent) and not sent.endswith(("거든요", "네요")):
                    # 경계 문항은 반말 · 합니다체를 실패로 센다(사용자 — "이모지와 반말이 없는가")
                    (fails if it.get("cat") == "boundary" else warns).append(f"해요체 아님: {sent[-20:]}")
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
        if len(set(ids)) >= 2 and links and not links[0]["href"].startswith("/compare?ids="):
            fails.append("2켤레 이상인데 비교하기가 아니다")
        if it.get("links") is False and links:
            fails.append("버튼이 없어야 한다")
        # 통증 질문에 챗봇이 고른 신발(설명문) — 이름 · 버튼을 내지 않는다(사용자 2026-11-13). 경험·후기의 지목 · 리뷰 집계는 따로
        if trace["health"] and trace["branch"] in ("explain", "out_of_scope") and reply.shoes:
            fails.append(f"통증 질문에 챗봇이 고른 신발 {ids}")
        if trace["health"] and trace.get("explained") and any(str(x).startswith("desc:") for x in trace["explained"]):
            fails.append("통증 질문에 설명문 근거")
        if any(l["label"] != prompt.LINK_LABEL for l in links):
            fails.append("버튼 라벨이 '보러 가기'가 아니다")

        ok = not fails
        results.append({"id": it["id"], "cat": it["cat"], "ok": ok, "fails": fails, "warns": warns, "q": it["q"], "answer": reply.text,
                        "links": links, "trace": trace, "fallback": reply.fallback_used, "seconds": round(dt, 1)})
        mark = "PASS" if ok else "FAIL"
        print(f"{mark} {it['id']:4} {dt:5.1f}s {'(코드 답)' if reply.fallback_used else ''} {'; '.join(fails)}"
              + (f"  [경고 {len(warns)}]" if warns else ""))
        if a.verbose or not ok:
            print("     " + reply.text.replace("\n", "\n     "))
            for w in warns:
                print(f"     · {w}")

    # 로그인 문턱(17절) — 웹소켓 서버 수준. 위 문항은 봇을 바로 부르므로 로그인과 상관없다
    from chatbot.eval import login
    only = set(a.only.split(",")) if a.only else None
    for r in login.run(only):
        results.append(r)
        print(f"{'PASS' if r['ok'] else 'FAIL'} {r['id']:4} {r['seconds']:5.1f}s  {r['q']} {'; '.join(r['fails'])}")

    summary(results, copy_issues)
    if a.out:
        Path(a.out).write_text(json.dumps({"results": results, "term_copy": copy_issues}, ensure_ascii=False, indent=1))
    return 0 if all(r["ok"] for r in results) and not copy_issues else 1


def load_items(only: str | None) -> list[dict]:
    items = []
    for name in ("golden.jsonl", "golden-boundary.jsonl", "golden-experience.jsonl"):
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


_DENOM = re.compile(r"리뷰\s*(\d+)건\s*(?:중|가운데)|(\d+)건 중 \d+건에서만|리뷰가\s*(\d+)건")
# 집계 문장(5차 수정 — "나머지 N건은 언급 없음"을 뺐다): "리뷰 N건 중 관점 이야기가 K건이고, 그중 좋다는 쪽이 P건 아쉽다는 쪽이 Q건이에요"
# 또는 "…K건이고, 모두 좋다는 쪽이에요"
_CELLS = re.compile(r"리뷰\s*(\d+)건 중 \S+ 이야기가\s*(\d+)건이고, 그중 좋다는 쪽이\s*(\d+)건 아쉽다는 쪽이\s*(\d+)건")
_ALL_ONE = re.compile(r"리뷰\s*(\d+)건 중 \S+ 이야기가\s*(\d+)건이고, 모두 (좋다는|아쉽다는) 쪽이에요")


def check_denominator(text: str, counts: dict[int, int], trace: dict, it: dict) -> list[str]:
    """분모는 늘 전체(사용자 3 · 9) — 답의 「리뷰 N건 중」이 API 건수인지, 좋다 + 아쉽다 = 관점 이야기, 관점 이야기 ≤ N 인지.
    5차 수정 전에는 긍정 + 부정 + 언급 없음 = N(세 칸)을 봤다 — 언급 없음 칸이 없어져 두 칸 합과 ≤ 로 바꿨다"""
    from chatbot import prompt
    fails = []
    if prompt.EXPERIENCE_WAIT in text:
        return ["색인 준비 전 답(잠시 뒤)"]
    ns = set(counts.values())
    found = [int(next(g for g in m.groups() if g)) for m in _DENOM.finditer(text)]
    for n in found:
        if n not in ns:
            fails.append(f"분모 {n}건 ≠ API {sorted(ns)}")
    if it.get("denom") and not found and any(ns):
        fails.append("분모(리뷰 N건) 없음")
    tallies = trace.get("tally") or []
    for m in _CELLS.finditer(text):
        n, k, p, q = map(int, m.groups())
        if p + q != k or k > n or not any((t["n"], t["k"], t["pos"], t["neg"]) == (n, k, p, q) for t in tallies):
            fails.append(f"칸이 맞지 않음 — 이야기 {k} = 좋다 {p} + 아쉽다 {q}, {k} ≤ {n}, 집계와 같은지")
    for m in _ALL_ONE.finditer(text):
        n, k, side = int(m.group(1)), int(m.group(2)), m.group(3)
        want = (k, 0) if side == "좋다는" else (0, k)
        if k > n or not any((t["n"], t["k"], t["pos"], t["neg"]) == (n, k, *want) for t in tallies):
            fails.append(f"'모두 {side} 쪽'이 집계와 다름 — {n}건 중 {k}건")
    for t in tallies:
        if t["labeled"] and not (t["pos"] + t["neg"] == t["k"] <= t["n"]):
            fails.append(f"집계 대조 실패 {t}")
        if t["n"] != counts.get(t["shoe_id"], t["n"]):
            fails.append(f"집계 N {t['n']} ≠ API {counts.get(t['shoe_id'])}")
    return fails


SUMMARY_LABELS = ("좋았던 점", "아쉬운 점")   # src/components/ReviewSummary.tsx 의 글자 — 코드의 상수를 쓰지 않고 따로 적는다


def check_summary_block(text: str, reply, question: str) -> tuple[str, list[str]]:
    """관점 없는 질문의 요약 블록(사용자 2026-11-13) — 신발마다 GET /api/shoes/{id}/summary 를 따로 읽어
    ① 요약이 있으면 「좋았던 점」 · (있으면) 「아쉬운 점」 꼬리표 줄 바로 다음 줄에 원문이 그대로 있는지 ② 없으면 블록 · 머리 문장이 없는지.
    꼬리표는 따로 한 줄이고, 좋았던 점 · 아쉬운 점은 인용 블록 둘이다(사용자 2026-11-14).
    돌려주는 글은 요약 줄을 뺀 것(다른 검사용). 관점 있는 질문이면 요약 블록이 없어야 한다"""
    from chatbot import http
    from chatbot.branches import experience as ex
    fails: list[str] = []
    lines = text.split("\n")
    if ex.aspect_of(question) is not None:
        if ex.SUMMARY_HEAD in text or f"> {SUMMARY_LABELS[0]}" in lines:
            fails.append("관점 있는 질문에 요약 블록")
        return text, fails
    drop: set[str] = set()
    n_sum = n_neg = 0
    for s in reply.shoes:
        sm = (http.get_json(f"/api/shoes/{s['id']}/summary") or {}).get("summary")
        if not sm:
            continue
        n_sum += 1
        for label, v in zip(SUMMARY_LABELS, (sm.get("positive"), sm.get("negative"))):
            if not v:
                continue
            n_neg += label == SUMMARY_LABELS[1]
            head, body = f"> {label}", f"> {v}"
            at = [i for i in range(len(lines) - 1) if lines[i] == head and lines[i + 1] == body]
            if at:
                drop.update((head, body))
                # 꼬리표마다 따로 된 인용 블록 — 앞줄 · 본문 다음 줄이 인용 줄이면 한 블록으로 이어진 것(사용자 2026-11-14)
                i = at[0]
                if (i > 0 and lines[i - 1].startswith(">")) or (i + 2 < len(lines) and lines[i + 2].startswith(">")):
                    fails.append(f"요약 「{label}」이 따로 된 인용 블록이 아니다: {s['model']}")
            else:
                fails.append(f"요약이 API 원문과 다르다: {s['model']} {label}")
    if text.count(ex.SUMMARY_HEAD) != n_sum:
        fails.append(f"요약 머리 문장 {text.count(ex.SUMMARY_HEAD)}번 ≠ 요약 있는 신발 {n_sum}")
    for label, n in zip(SUMMARY_LABELS, (n_sum, n_neg)):
        got = lines.count(f"> {label}")
        if got != n:
            fails.append(f"「{label}」 줄 {got} ≠ API {n}")
    return "\n".join(l for l in lines if l not in drop), fails


def check_experience(text: str, reply, trace: dict, review_src: str = "") -> list[str]:
    """경험·후기 1차 수정(사용자 2026-11-13) — 두루뭉술한 양 · 내부 말 · 순위 · 최소 건수 · 피하려는 질문"""
    from chatbot.branches import experience as ex
    fails = []
    outside = re.sub(r"\"[^\"]*\"", "", "\n".join(l for l in text.split("\n") if not l.startswith(">")))   # 인용(리뷰 원문)은 빼고
    for w in ex.VAGUE:
        if w in outside:
            fails.append(f"양을 짐작하는 말 '{w}'")
    if "분류" in outside:
        fails.append("내부 말 '분류'")
    # LLM 글의 숫자(5차 수정 1-1 → 6차 수정 3): 건수("N건")는 없어야 하고, 다른 숫자는 그 답 신발들의 리뷰 원문에 있는 것만.
    # 신발 이름의 숫자는 뺀다. 코드가 지운 뒤의 글을 본다 — 지운 횟수는 trace guard 의 "근거에 없는 숫자 문장 지움"으로 센다.
    # 코드는 신발마다 그 신발에 준 근거 리뷰로 가르고, 평가는 답 신발들의 리뷰 전부로 본다(더 느슨하다)
    from chatbot.reply import bad_digits, name_forms
    names = [n for s in reply.shoes for n in name_forms(s)]
    for g in trace.get("generated") or []:
        for s_ in re.split(r"(?<=[.!?])\s+|\n+", g):
            if bad_digits(s_, names, review_src):
                fails.append(f"LLM 글에 건수 · 리뷰에 없는 숫자: {s_[:40]}")
    tally = trace.get("tally") or []
    multi = bool(trace.get("ranked"))
    want = trace.get("want")
    if multi:
        for t in tally:
            if t["n"] < ex.MIN_REVIEWS:
                fails.append(f"리뷰 {t['n']}건 신발이 목록에({t['shoe_id']})")
            if want and t["labeled"]:
                w, o = (t["pos"], t["neg"]) if want == "positive" else (t["neg"], t["pos"])
                if (o >= w) if trace.get("avoid") else (o > w or w == 0):
                    fails.append(f"찾는 쪽({want}) {w}건 · 반대 {o}건인 신발이 목록에({t['shoe_id']})")
        if want and tally:
            ws = [t["pos"] if want == "positive" else t["neg"] for t in tally]
            if ws != sorted(ws, reverse=True):
                fails.append(f"찾는 쪽 건수 순이 아님 {ws}")
    if trace.get("avoid"):
        if reply.links():
            fails.append("피하려는 질문에 보러 가기 버튼")
        if ex.CLOSE in text:
            fails.append("피하려는 질문에 '보러 가실래요?'")
    # 여러 켤레 — 어느 신발 이야기인지(3차 수정 6 · 4차 수정 3). 4차부터 LLM 글은 신발마다 따로 쓰여 그 신발 블록
    # ("브랜드의 모델: 집계 …" + 인용) 바로 아래에 붙는다 — 그래서 이름이 없어도 어느 신발인지 정해진다.
    # 검사: ① 첫 신발 블록 앞에 LLM 문단이 없을 것 ② 신발 블록 아래 문단이 다른 신발의 이름을 말하지 않을 것(섞임).
    # 모델명 전체(또는 그 목록에서 하나뿐인 세대 뗀 이름)로 본다 — 이름 일부로 통과 · 걸림이 나지 않게
    shoes = reply.shoes
    if len(shoes) > 1:
        from chatbot import prompt
        code_paras = {ex.AVOID_HEAD, "말씀하신 부분을 리뷰에서 찾아봤어요.", ex.CLOSE, prompt.DOCTOR, ex.SUMMARY_HEAD}
        bases = [re.sub(r"\s*v?\d+\s*$", "", s["model"]) for s in shoes]
        names = {s["id"]: {s["model"]} | ({b} if bases.count(b) == 1 else set()) for s, b in zip(shoes, bases)}
        cur = None
        for p in text.split("\n\n"):
            p = p.strip()
            if not p or p.startswith(">") or p in code_paras:
                continue
            # 관점 없는 질문의 신발 블록은 「브랜드의 모델에는 리뷰가 N건 있어요.」로 시작한다(요약 블록, 2026-11-13)
            head = next((s for s in shoes if p.startswith((f"{s['brand']}의 {s['model']}:", f"{s['brand']}의 {s['model']}에는"))), None)
            if head:
                cur = head
                continue
            if cur is None:
                fails.append(f"여러 켤레인데 신발 블록 앞에 LLM 문단: {p[:30]}")
                continue
            others = [s["model"] for s in shoes if s["id"] != cur["id"] and any(n in p for n in names[s["id"]])]
            if others:
                fails.append(f"{cur['model']} 아래 문단이 다른 신발({others[0]}) 이야기: {p[:30]}")
    return fails


def sentences(text: str) -> list[str]:
    out = []
    for para in text.split("\n"):
        if para.lstrip().startswith(">"):   # 인용 블록 — 리뷰 원문(말투 검사 밖)
            continue
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
    print(f"  전체 {sum(r['ok'] for r in results)}/{total} · 평균 {sum(r['seconds'] for r in results) / max(total, 1):.1f}s"
          "(몸풀기 · 앞 턴은 넣지 않음)")
    from collections import Counter
    g = Counter()
    for r in results:
        for x in r["trace"].get("guard", []):
            m = re.match(r"(출처 말하기) (\d+)$", x)
            if m:
                g[m.group(1)] += int(m.group(2))   # 지금은 세기만(5-2 에서 다시 본다)
            else:
                g[x.split(" [")[0]] += 1
    print("  생성 검사가 한 일: " + (", ".join(f"{k} {v}" for k, v in sorted(g.items())) or "없음"))
    bad_num = sum(any(f.startswith("API 에 없는 숫자") for f in r["fails"]) for r in results)
    print(f"  수치 불일치 문항 {bad_num} · 전문의 누락 {sum('전문의 안내 누락' in r['fails'] for r in results)}")
    print("  용어 사본 · 예시 값 대조: " + ("같다" if not copy_issues else "; ".join(copy_issues)))


if __name__ == "__main__":
    sys.exit(main())
