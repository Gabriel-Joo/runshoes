"""대화 한 턴 — 이름 찾기 → 라우터 → 갈래 → 버튼. 웹소켓과 떼어 둔다(평가가 같은 길로 부른다).

대화 상태는 연결마다 메모리에(사용자 승인 11절): 마지막으로 말한 신발 · 되묻는 중인 것 · 최근 대화 6줄.
웹소켓 하나는 한 Pod 에 붙어 있으므로 replicas 2 여도 된다. 다시 연결하면 사라진다.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field

from . import http, prompt, router
from .branches import compare, experience, explain, recommend, spec, term
from .catalog import Catalog, Mention, norm
from .facts import josa
from .reply import Reply, guard_log, guard_reset, with_doctor
from .terms import Dictionary


# 신발 종류 이름 — 모델이 아니다. 라우터 LLM 이 "카본화"를 shoe_names 에 넣어 "등록되지 않은 모델"로 답한 일이 있었다(경계 평가)
_CATEGORY = re.compile(r"^(카본|안정|중립|쿠션|러닝|레이스|레이싱|트레일|입문|조깅|마라톤|데일리|맥시멀|미니멀|경량|와이드|슈퍼)\s*(화|슈즈|신발|러닝화)$")


def is_category(name: str) -> bool:
    return bool(_CATEGORY.match(name.strip()))


@dataclass
class State:
    last_shoe_ids: list[int] = field(default_factory=list)
    history: list[dict] = field(default_factory=list)      # {"role": "user"|"assistant", "content"}
    pending: dict | None = None                            # {"kind": "choose"|"purpose"|"similar", ...}
    logged: set = field(default_factory=set)               # 이 연결에서 이미 기록한 것(같은 말을 거듭 남기지 않는다)


_GREETING = re.compile(r"^\s*(안녕|하이|hi|hello|반가)", re.IGNORECASE)


def record_miss(state: State, kind: str, query: str, message: str, post=None) -> None:
    """없는 신발 · 용어 → V18(내부 POST). 실패해도 답은 낸다 — 기록은 따로 돈다"""
    key = (kind, query)
    if not query or key in state.logged:
        return
    state.logged.add(key)
    print(f"[miss] {kind}: {query}")
    poster = post or (lambda body: http.post_json("/api/internal/chatbot-misses", body))

    def run():
        try:
            poster({"kind": kind, "query": query, "message": message})
        except Exception as e:   # noqa: BLE001
            print(f"[miss] 기록 실패: {e}")

    threading.Thread(target=run, daemon=True).start()


class Bot:
    def __init__(self, load=Catalog.load, ask=router.ask_llm, post=None, searcher=None):
        self.load = load
        self.ask = ask
        self.post = post
        self.searcher = searcher   # search.service.Searcher — 없거나 준비 전이면 경험·후기는 "잠시 뒤", 특성 설명은 사전만

    def turn(self, state: State, text: str) -> tuple[Reply, dict]:
        """(답, 기록 — 평가용: 갈래 · health · 찾은 신발)"""
        cat = self.load()
        dic = Dictionary(cat.terms)
        guard_reset()
        reply, trace = self._turn(state, text, cat, dic)
        trace["guard"] = list(guard_log())
        state.history += [{"role": "user", "content": text}, {"role": "assistant", "content": reply.text}]
        state.history = state.history[-6:]
        if reply.shoes:
            state.last_shoe_ids = [s["id"] for s in reply.shoes]
        return reply, trace

    # ------------------------------------------------------------------
    def _turn(self, state: State, text: str, cat: Catalog, dic: Dictionary) -> tuple[Reply, dict]:
        pending, state.pending = state.pending, None
        mentions = self._filter_brand(cat.find(text), text)

        # 되묻은 뒤의 답 — 고른 신발로 원래 질문을 다시
        if pending and pending["kind"] == "choose":
            picked = self._choose(pending, text, cat)
            if picked:
                return self._turn_with(state, pending["question"], cat, dic, forced=[picked])
        if pending and pending["kind"] == "similar" and router.is_yes(text):
            # "비슷한 모델로 찾아볼까요?"에 "네" — 처음 질문의 조건으로 추천을 잇는다
            cond, health = dict(pending.get("cond") or {}), bool(pending.get("health"))
            question = pending.get("question") or text
            trace = {"branch": "recommend", "health": health, "pending": "similar"}
            if cond.get("purpose"):
                trace["conditions_used"] = cond
                return self._recommend(state, question, cond, cat, health), trace
            state.pending = {"kind": "purpose", "cond": cond, "question": question, "health": health}
            return Reply(with_doctor(prompt.ASK_PURPOSE_CALM if health else prompt.ASK_PURPOSE, health), branch="recommend"), trace

        return self._turn_with(state, text, cat, dic, mentions=mentions, pending=pending)

    def _turn_with(self, state: State, text: str, cat: Catalog, dic: Dictionary, mentions: list[Mention] | None = None,
                   forced: list[dict] | None = None, pending: dict | None = None) -> tuple[Reply, dict]:
        mentions = mentions if mentions is not None else self._filter_brand(cat.find(text), text)
        # 되물어 고른 신발 + 처음 질문의 다른 신발(고른 것으로 목록을 갈아 끼우지 않는다)
        found = list(forced or []) + [m.shoe for m in mentions if m.shoe and m.shoe["id"] not in {f["id"] for f in forced or []}]
        notes = {s["id"]: m.generation_note for m in mentions if m.shoe for s in [m.shoe]}
        ambiguous = [] if forced else [m for m in mentions if m.candidates]   # 되물어 고른 뒤에는 다시 묻지 않는다
        unregistered = [m for m in mentions if m.line and not m.shoe]   # 라인은 있는데 그 세대가 없다
        terms_found = dic.find(text)
        state_shoes = [cat.by_id[i] for i in state.last_shoe_ids if i in cat.by_id]
        # 직전 신발은 "그거 · 둘 다" 같은 가리키는 말이 있을 때만 쓴다(15절)
        context = state_shoes if router.has_any(text, router.REFER_WORDS) else []

        r = router.route(text, len(found) + len(ambiguous) + len(unregistered), len(state_shoes), len(terms_found), state.history, self.ask)
        trace = {"explained": [], "branch": r.branch, "health": r.health, "by_rule": r.by_rule, "llm_ok": r.llm_ok,
                 "shoes": [s["id"] for s in found], "shoe_names": r.shoe_names, "term": r.term, "conditions": r.conditions}

        # 추천 — 용도를 되물은 뒤의 답
        if pending and pending["kind"] == "purpose":
            cond = {**pending["cond"], **r.conditions}
            if not cond.get("purpose"):
                cond["purpose"] = router.purpose_by_rule(text)
            if cond.get("purpose"):
                health = bool(pending.get("health")) or r.health   # 통증 질문 뒤의 짧은 답("조깅이요")에서 health 를 잃지 않게
                trace["branch"] = "recommend"
                trace["health"] = health
                trace["conditions_used"] = cond
                return self._recommend(state, pending["question"] + " / " + text, cond, cat, health), trace

        # 되묻기 — 같은 말이 여러 라인에 걸린다(하나만 묻는다)
        if ambiguous and r.branch != "out_of_scope":
            m = ambiguous[0]
            picks = [ln.pick(m.gen) or ln.pick(None) for ln in m.candidates][:4]
            names = [f"{s['brand']}의 {s['model']}" for s in picks]
            state.pending = {"kind": "choose", "ids": [s["id"] for s in picks], "question": text}
            q = " · ".join(names)
            trace["branch"] = "choose"
            return Reply(f"{q} 가운데 어느 신발을 말씀하시는 건가요?", branch="choose"), trace

        # 등록되지 않은 신발 — 라인이 있으면 그 라인의 등록된 세대를 권한다(예시 ①)
        unknown_names = self._unknown_names(r.shoe_names, cat, found)
        if (unregistered or unknown_names) and (not found or r.branch in ("compare", "spec")):
            # 등록되지 않은 신발을 빼고 남은 신발이나 직전 신발로 바꿔 답하지 않는다 — 없다고 먼저 말한다
            return self._no_shoe(state, text, unregistered, unknown_names, r), trace
        for m in unregistered:
            record_miss(state, "shoe", self._mention_text(m), text, self.post)
        for n in unknown_names:
            record_miss(state, "shoe", n, text, self.post)

        b = r.branch
        if b == "greeting" and not found:
            return Reply(prompt.GREETING, branch="greeting"), trace
        if b == "out_of_scope" and not found:
            if r.health:   # 몸 이야기가 섞였으면 거절하지 않고 특성으로(7절)
                return self._explain(state, text, dic, r, trace, cat), trace
            return Reply(prompt.OUT_OF_SCOPE, links_off=True, branch="out_of_scope"), trace
        if b == "explain" and not found:
            return self._explain(state, text, dic, r, trace, cat), trace
        if b == "term":
            reply, miss = term.answer(dic, terms_found, r.term)
            if miss:
                record_miss(state, "term", miss, text, self.post)
            reply.text = with_doctor(reply.text, r.health)
            return reply, trace
        if b == "compare":
            shoes = list(found)
            for s in context:
                if len(shoes) >= 2:
                    break
                if s["id"] not in [x["id"] for x in shoes]:
                    shoes.insert(0, s)
            if len(shoes) < 2:
                if shoes:
                    state.last_shoe_ids = [shoes[0]["id"]]
                return Reply(prompt.ASK_SECOND, branch="compare"), trace
            reply = compare.answer(text, shoes, r.health, state.history)
            reply.text = with_doctor(reply.text, r.health)
            return reply, trace
        if b == "recommend":
            cond = dict(r.conditions)
            if not cond.get("purpose"):
                cond["purpose"] = router.purpose_by_rule(text)
            if not cond.get("purpose"):
                cond.pop("purpose", None)
                if r.health:
                    # 통증 + 추천인데 용도가 없으면 되묻기 전에 특성을 먼저 말한다(사용자 2026-11-12)
                    extra = tuple(explain.FROM_CONDITION[k] for k in ("cushion", "stability", "width") if k in cond)
                    reply = explain.answer(text, dic, True, state.history, extra, tail=prompt.ASK_PURPOSE_CALM,
                                           searcher=self.searcher, catalog=cat)
                    trace["explained"] = reply.explained
                    state.pending = {"kind": "purpose", "cond": cond, "question": text, "health": True}
                    reply.text = with_doctor(reply.text, True)
                    return reply, trace
                state.pending = {"kind": "purpose", "cond": cond, "question": text, "health": r.health}
                return Reply(prompt.ASK_PURPOSE, branch="recommend"), trace
            trace["conditions_used"] = cond
            return self._recommend(state, text, cond, cat, r.health), trace
        if b == "spec":
            shoes = found or context[:3]
            if not shoes:
                return Reply(prompt.ASK_SHOE, branch="spec"), trace
            reply = spec.answer(text, [(s, notes.get(s["id"], False)) for s in shoes], r.health, state.history)
            reply.text = with_doctor(reply.text, r.health)
            return reply, trace
        if b == "explain":   # 신발 이름이 함께 나온 특성 질문 — 그 신발의 값으로 답한다
            reply = spec.answer(text, [(s, notes.get(s["id"], False)) for s in found], r.health, state.history)
            reply.text = with_doctor(reply.text, r.health)
            return reply, trace
        # 경험·후기(5-2) — 리뷰 집계. 색인 준비 전 · model-service 실패면 "잠시 뒤"(다른 갈래는 그대로)
        shoes = (found or context)[:3]
        ready = self.searcher is not None and self.searcher.ready
        if r.health and not shoes and not router.has_any(text, router.REVIEW_WORDS):
            # 몸 이야기 + 신발 없음 + 후기를 직접 묻지 않음 — 특성으로(5-1 과 같다). "저려서 큰 사이즈로 신는데 괜찮을까요"에
            # 여러 신발의 리뷰 목록을 내면 물음을 비켜 간다(5-2 평가 경계 B06 · B08)
            return self._explain(state, text, dic, r, trace, cat), trace
        if not ready:
            trace["experience"] = "not_ready"
            return Reply(with_doctor(prompt.EXPERIENCE_WAIT, r.health), shoes, branch="experience"), trace
        try:
            reply = experience.answer(text, shoes, cat, self.searcher, r.health, state.history)
        except Exception as e:   # noqa: BLE001 — model-service · API 가 안 되면 기다려 달라고 한다
            print(f"[experience] 실패: {e!r}")
            trace["experience"] = f"error {type(e).__name__}"
            return Reply(with_doctor(prompt.EXPERIENCE_WAIT, r.health), shoes, branch="experience"), trace
        trace["shoes"] = [s["id"] for s in reply.shoes]
        trace["ranked"] = reply.ranked
        trace["tally"] = reply.tally
        reply.text = with_doctor(reply.text, r.health)
        return reply, trace

    # ------------------------------------------------------------------
    def _explain(self, state: State, text: str, dic: Dictionary, r, trace: dict, cat: Catalog | None = None) -> Reply:
        """특성 설명 — 끝에 "어떤 달리기에 신으실지…"를 붙이고, 다음 답이 용도면 추천으로 잇는다"""
        reply = explain.answer(text, dic, r.health, state.history, searcher=self.searcher, catalog=cat)
        trace["explained"] = reply.explained
        if not reply.explained:
            # 사전에 걸리는 특성이 없어 답하지 못했다 — 무엇을 궁금해하는지 남긴다(사용자 2회차, kind feature)
            record_miss(state, "feature", r.feature or text[:40], text, self.post)
        else:
            state.pending = {"kind": "purpose", "cond": dict(r.conditions), "question": text, "health": r.health}
        reply.text = with_doctor(reply.text, r.health)
        return reply

    def _recommend(self, state: State, question: str, cond: dict, cat: Catalog, health: bool) -> Reply:
        reply = recommend.answer(question, cond, cat, health, state.history)
        reply.text = with_doctor(reply.text, health)
        return reply

    def _no_shoe(self, state: State, text: str, unregistered: list[Mention], unknown_names: list[str], r) -> Reply:
        greet = "안녕하세요! " if _GREETING.match(text) else ""
        if unregistered:
            m = unregistered[0]
            asked = self._mention_text(m)
            record_miss(state, "shoe", asked, text, self.post)
            other = m.line.pick(None)
            reviews = "스펙이랑 리뷰가 다" if (other.get("reviewCount") or 0) > 0 else "스펙이"
            body = (f"{greet}{josa(asked, '은', '는')} 아직 이 사이트에 등록되어 있지 않았어요. "
                    f"같은 라인의 {josa(other['model'], '은', '는')} {reviews} 올라와 있는데, 보러 가실래요?")
            return Reply(with_doctor(body, r.health), [other], branch="no_shoe")
        for n in unknown_names:
            record_miss(state, "shoe", n, text, self.post)
        state.pending = {"kind": "similar", "question": text, "cond": dict(r.conditions), "health": r.health}
        return Reply(with_doctor(greet + prompt.NO_SHOE, r.health), branch="no_shoe")

    @staticmethod
    def _mention_text(m: Mention) -> str:
        """"마하 7" — 라인의 이름(현행 모델명에서 세대를 뗀 것) + 물은 세대"""
        base = m.line.pick(None)["model"]
        g = m.line.pick(None).get("generation")
        if g is not None:
            base = re.sub(rf"\s*v?{g}\s*$", "", base).strip()
        return f"{base} {m.gen}" if m.gen is not None else base

    @staticmethod
    def _unknown_names(names: list[str], cat: Catalog, found: list[dict]) -> list[str]:
        """라우터가 뽑은 이름 가운데 카탈로그 어디에도 없는 것 — 브랜드 이름만인 것, 이미 찾은 신발 이름의 일부인 것
        (LLM 이 "엔돌핀 스피드 4"를 "스피드 4"로 줄여 뽑는다)은 뺀다"""
        brands = {s["brand"] for s in cat.shoes}
        found_names = [norm(x) for s in found for x in [s["model"], s.get("modelEn") or "", *(s.get("modelAlias") or "").split(",")] if x]
        out = []
        for n in names:
            k = norm(n)
            if n in brands or not k or cat.find(n) or any(k in f for f in found_names) or is_category(n):
                continue
            out.append(n)
        return out

    @staticmethod
    def _filter_brand(mentions: list[Mention], text: str) -> list[Mention]:
        """되물을 후보가 여러 브랜드면 문장의 브랜드로 좁힌다("브룩스 레벨")"""
        out = []
        for m in mentions:
            if m.candidates:
                kept = [ln for ln in m.candidates if ln.shoes[0]["brand"] in text]
                if len(kept) == 1:
                    ln = kept[0]
                    shoe = ln.pick(m.gen)
                    out.append(Mention(m.text, ln, m.gen, shoe, generation_note=m.gen is None and ln.multi_generation))
                    continue
                if kept:
                    m = Mention(m.text, None, m.gen, None, kept)
            out.append(m)
        return out

    @staticmethod
    def _choose(pending: dict, text: str, cat: Catalog) -> dict | None:
        ids = pending["ids"]
        hits = [s["id"] for m in cat.find(text) if m.shoe for s in [m.shoe] if s["id"] in ids]
        if not hits:
            # "앞에 거" · "첫 번째" · 브랜드만
            for i, sid in enumerate(ids):
                s = cat.by_id[sid]
                if s["brand"] in text or (i == 0 and re.search(r"첫|앞", text)) or (i == 1 and re.search(r"두 ?번째|뒤", text)):
                    hits = [sid]
                    break
        return cat.by_id[hits[0]] if hits else None
