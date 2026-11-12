"""경험 · 후기 — 하이브리드 검색 + 리뷰 집계(작업 5-2, docs/09_chatbot_rag.md 6절 · 7절 · 16절).

검색은 후보를 고르는 데만 쓰고, 말은 전체를 놓고 한다(6절).
1. 신발 — 이름이 나왔으면 그 신발, 아니면 리뷰 검색 → 신발 순위 상위 3켤레
2. 집계 — 그 신발 리뷰를 API 에서 새로 읽는다(분모는 늘 지금 값). 관점(무릎 · 발볼 …)을 물었으면
   그 관점을 말한 리뷰 후보(낱말 묶음 + 임베딩 유사도)를 LLM 에 JSON 으로 한 번 묻고(temperature 0) 코드가 센다.
   긍정 + 부정 + 언급 없음 = N 을 코드가 맞춰 본다. 별점으로 대신하지 않는다
3. 답 — 집계 문장은 코드가 쓰고 LLM 은 다듬기만. 리뷰는 30건까지(넘으면 추천 많은 순, 잘랐다고 밝힌다)

리뷰는 가상 유저 200명이 만든 데이터다 — "등록된 리뷰"로 말한다(러너들이 · 실제 사용자 · 많은 사람들 금지, 코드가 막는다).
"""

from __future__ import annotations

import re

import numpy as np

from .. import http, llm, prompt
from ..reply import Reply, guard_log
from ..search.index import like_rerank, rank_shoes
from .common import generate

CAP = 30                 # 답에 넣는 리뷰 상한(사용자 2026-11-12)
CAP_PER_SHOE_MULTI = 10  # 신발을 말하지 않아 여러 켤레를 볼 때 켤레당(30 을 셋으로 — Claude 가 정함, 관리자 확인 2026-11-12)
MULTI_SHOES = 3
MENTION_COS = 0.60       # 낱말이 든 리뷰가 없을 때 임베딩만으로 후보에 넣는 문턱(candidates 참고)
EXTRA = 5                # 임베딩으로 더하는 후보 상한(신발마다)
DESC_COS = 0.50          # 설명문 문장을 근거로 줄 문턱
DESC_MAX = 3

# 관점 — 질문에서 가장 앞에 나온 것 하나. 리뷰 후보를 고르는 낱말 묶음이기도 하다
ASPECTS: list[tuple[str, tuple[str, ...]]] = [
    ("무릎", ("무릎",)),
    ("발볼", ("발볼", "볼이", "볼 넓", "볼 좁", "볼넓", "볼좁", "앞볼", "와이드", "앞쪽이 좁", "앞이 좁", "앞쪽이 넉넉", "앞이 넉넉", "빠듯", "끼어", "끼나", "끼는", "조여", "조이")),
    ("사이즈", ("사이즈", "치수", "정사이즈", "반 업", "반업", "크게 나", "작게 나", "길이")),
    ("내구성", ("내구", "닳", "마모", "해지", "해져", "밑창", "아웃솔", "오래 신", "오래가", "수명")),
    ("발바닥", ("발바닥", "족저")),
    ("종아리", ("종아리", "아킬레스")),
    ("발목", ("발목",)),
    ("뒤꿈치", ("뒤꿈치", "힐컵", "힐 카운터", "들떠", "들뜸", "들림")),
    ("발등", ("발등", "끈", "텅")),
    ("통증", ("아프", "아파", "아픈", "아팠", "통증", "부상", "족저근막", "정강이", "물집", "저려", "저림", "저리고", "쓸림", "쓸려", "쓸리", "쓸렸", "까짐", "까져")),
    ("쿠션", ("쿠션", "푹신", "딱딱", "단단", "물렁", "충격")),
    ("무게", ("무게", "가볍", "가벼", "무겁", "무거", "묵직")),
    ("통기성", ("통기", "덥", "더워", "땀", "시원", "답답")),
    ("접지", ("접지", "미끄", "그립", "젖은", "빗길")),
    ("반발", ("반발", "통통", "튕")),
    ("안정감", ("안정", "흔들", "무너", "불안", "뒤틀")),
    ("착용감", ("착용감", "편하", "편안", "편해", "편함", "편한", "불편")),
]
_ASPECT = dict(ASPECTS)

TASK = (
    "[결론 문장]의 집계 문장은 숫자 · 건수를 바꾸지 말고 그대로 넣는다. 리뷰를 옮길 때는 \"등록된 리뷰에서는\"처럼 리뷰라는 것을 밝히고, "
    "[리뷰]에 있는 내용만 쓴다. 리뷰에 없는 경향(\"대체로\" · \"자주\")을 새로 만들지 않는다. 긍정과 부정이 다 있으면 둘 다 말한다. "
    "[설명문]이 있으면 신발의 구조로 한 문장 덧붙여도 된다. 네다섯 문장으로. 보러 가기를 권할 때는 \"보러 가실래요?\"."
)
POLARITY_SYSTEM = """너는 러닝화 리뷰 분류기다. 각 리뷰가 주어진 관점에 대해 어떻게 말하는지 하나를 고른다. JSON 하나만 낸다.

- positive: 그 관점을 직접 말하면서 좋다 · 편하다 · 괜찮다 · 문제없다고 한다
- negative: 그 관점을 직접 말하면서 나쁘다 · 아프다 · 불편하다 · 아쉽다고 한다
- none: 그 관점을 직접 말하지 않는다. 신발이 전반적으로 좋다 · 편하다는 말이나 다른 부분 이야기뿐이면 none
관점이 통증이면: 통증 · 물집 · 쓸림 같은 불편이 생겼다 → negative, 그런 불편이 없었다 · 덜했다고 직접 말한다 → positive.
한 리뷰에 좋은 말과 나쁜 말이 같이 있으면 더 무게가 실린 쪽을 고른다.

{"labels": {"리뷰 번호": "positive" | "negative" | "none", ...}} — 받은 번호를 모두 넣는다."""


def aspect_of(text: str) -> str | None:
    """질문에서 가장 앞에 나온 관점"""
    best = None
    for name, words in ASPECTS:
        for w in words:
            i = text.find(w)
            if i >= 0 and (best is None or i < best[0]):
                best = (i, name)
    return best[1] if best else None


def mentions_by_words(aspect: str, content: str) -> bool:
    return any(w in content for w in _ASPECT[aspect])


# ------------------------------------------------------------------ 집계 — 코드가 센다
class Tally:
    def __init__(self, shoe: dict, reviews: list[dict], aspect: str | None):
        self.shoe = shoe
        self.reviews = reviews            # 그 신발 리뷰 전부(API 에서 지금 읽은 것)
        self.n = len(reviews)
        self.aspect = aspect
        self.labels: dict[int, str] = {}  # 리뷰 id → positive | negative (언급한 것만)
        self.labeled = False              # LLM 분류가 됐는지(실패하면 낱말로만 센다)

    @property
    def pos(self) -> int:
        return sum(1 for v in self.labels.values() if v == "positive")

    @property
    def neg(self) -> int:
        return sum(1 for v in self.labels.values() if v == "negative")

    @property
    def k(self) -> int:
        return len(self.labels)

    @property
    def rest(self) -> int:
        return self.n - self.k

    def check(self) -> bool:
        return self.pos + self.neg + self.rest == self.n and self.rest >= 0

    def mentioned(self) -> list[dict]:
        return [r for r in by_likes(self.reviews) if r["id"] in self.labels]


def by_likes(reviews: list[dict]) -> list[dict]:
    """추천 많은 순, 같으면 최근 순"""
    return sorted(reviews, key=lambda r: (-(r.get("likeCount") or 0), -(r.get("id") or 0)))


def shoe_name(s: dict) -> str:
    return f"{s['brand']}의 {s['model']}"


def summary_lines(t: Tally) -> list[str]:
    """집계 문장 — 코드가 쓴다(사용자 10 · 11)"""
    a = t.aspect
    if a is None:
        return []
    if t.k == 0:
        return [f"이 신발 리뷰 {t.n}건 가운데 그 부분을 말한 리뷰는 없었어요."]
    if not t.labeled:
        return [f"리뷰 {t.n}건 중 {a} 이야기가 나온 리뷰는 {t.k}건이에요."]
    if t.k <= 2:
        if t.k == 1:
            side = "좋다는 이야기였어요." if t.pos else "아쉽다는 이야기였어요."
        else:
            side = "둘 다 좋다는 이야기였어요." if t.pos == 2 else "둘 다 아쉽다는 이야기였어요." if t.neg == 2 else "하나는 좋다는, 하나는 아쉽다는 이야기였어요."
        return [f"리뷰 근거가 많지 않아요 — {t.n}건 중 {t.k}건에서만 나온 이야기예요.", side]
    line = f"리뷰 {t.n}건 중 {a} 관련 언급이 {t.k}건, 긍정 {t.pos}건 부정 {t.neg}건, 나머지 {t.rest}건은 언급 없음이에요."
    out = [line]
    if t.neg == 0:
        out.append("부정 언급은 없었어요.")
    elif t.pos == 0:
        out.append("긍정 언급은 없었어요.")
    return out


def quote_line(t: Tally) -> str | None:
    """인용 — 관점이 있으면 그 이야기를 한 리뷰 가운데, 없으면 등록된 리뷰 가운데 추천이 가장 많은 것"""
    pool = t.mentioned() if t.aspect else by_likes(t.reviews)
    if t.aspect:   # 관점 낱말이 그대로 든 리뷰를 먼저 — 인용만 보고도 무슨 이야기인지 알게
        pool = [r for r in pool if mentions_by_words(t.aspect, r["content"])] + [r for r in pool if not mentions_by_words(t.aspect, r["content"])]
    if not pool:
        return None
    r = pool[0]
    likes = r.get("likeCount") or 0
    top = likes > 0 and likes >= max((x.get("likeCount") or 0) for x in pool)   # 「가장 많은 추천」은 정말 그럴 때만
    q = aspect_sentence(r["content"], t.aspect)
    if t.aspect:
        head = f"{t.aspect} 이야기를 한 리뷰 가운데 가장 많은 추천을 받은 리뷰에서는" if top else f"{t.aspect} 이야기를 한 리뷰에서는"
    else:
        head = "등록된 리뷰 가운데 가장 많은 추천을 받은 리뷰에서는" if likes > 0 else "등록된 리뷰에서는"
    # 따옴표 뒤에 조사를 붙이지 않는다 — 인용 끝이 마침표 · 말줄임이라 「…주문."라고」가 됐다
    return f"{head} 이런 이야기가 나와요. \"{q}\""


def aspect_sentence(content: str, aspect: str | None, limit: int = 90) -> str:
    """인용할 문장 — 관점 낱말이 든 첫 문장, 없으면 첫 문장"""
    sents = [s for s in re.split(r"(?<=[.!?요])\s+", content.strip()) if s]
    pick = next((s for s in sents if aspect and mentions_by_words(aspect, s)), sents[0] if sents else content)
    return pick if len(pick) <= limit else pick[:limit].rstrip() + "…"


def strip_names(question: str, shoes: list[dict]) -> str:
    """질문에서 신발 이름을 뺀다 — 이름이 남으면 그 신발의 모든 문서(머리말에 같은 이름)와 유사도가 함께 오른다"""
    q = question
    for s in shoes:
        for name in sorted({s.get("model") or "", s.get("modelEn") or "", s.get("brand") or "",
                            *[(a or "").strip() for a in (s.get("modelAlias") or "").split(",")],
                            re.sub(r"\s*v?\d+\s*$", "", s.get("model") or "")}, key=len, reverse=True):
            if len(name) >= 2:
                q = q.replace(name, " ")
    q = re.sub(r"\s+", " ", q).strip()
    return q or question


# ------------------------------------------------------------------ 길
def answer(question: str, shoes: list[dict], catalog, searcher, health: bool, history: list[dict], classify=None) -> Reply:
    """shoes — 이름이 나온 신발(없으면 검색으로 고른다). searcher 가 준비 전이면 "잠시 뒤"(bot 이 먼저 본다)"""
    classify = classify or classify_llm
    aspect = aspect_of(question)
    qtext = strip_names(question, shoes)
    qvec = searcher.query_vec(qtext)
    multi = not shoes
    if multi:
        hits = like_rerank(searcher.index.search(qvec, question, 60, {"kind": "review"}))
        order = [sid for sid, _ in rank_shoes(hits) if sid in catalog.by_id]
        if aspect:
            # 관점을 물었으면 검색 결과 가운데 그 낱말이 든 리뷰가 많은 신발부터 — 상위 문서 하나로만 고르면 언급 0건 신발이 섞였다
            n_words = {sid: sum(1 for h in hits if h.shoe_id == sid and mentions_by_words(aspect, h.text)) for sid in order}
            order = sorted(order, key=lambda sid: (-n_words[sid], order.index(sid)))
        shoes = [catalog.by_id[sid] for sid in order][:MULTI_SHOES]
        if not shoes:
            return Reply(prompt.NO_DATA, branch="experience")
    shoes = shoes[:MULTI_SHOES]
    tallies = [Tally(s, http.get_json("/api/reviews", {"shoeId": s["id"]}), aspect) for s in shoes]
    tallies = [t for t in tallies if t.n > 0] or tallies
    if aspect:
        label(tallies, aspect, question, qvec, searcher, classify)

    cap = CAP if len(tallies) == 1 else CAP_PER_SHOE_MULTI
    lines: list[str] = []
    conclusions: list[str] = []
    paras: list[str] = []
    for t in tallies:
        name = shoe_name(t.shoe)
        if t.n == 0:
            c = [f"{name}에는 아직 등록된 리뷰가 없어요."]
            conclusions += c
            paras.append(" ".join(c))
            continue
        # 관점을 물었는데 말한 리뷰가 없으면 리뷰를 넣지 않는다 — 넣으면 LLM 이 다른 이야기로 채운다
        pool = t.mentioned() if aspect else by_likes(t.reviews)
        shown = pool[:cap]
        cut = len(pool) > cap
        # 잘랐으면 밝힌다 — 분모는 늘 전체(사용자 3)
        read_note = (None if not cut else f"리뷰 {t.n}건 중 추천이 많은 {len(shown)}건을 봤어요." if not aspect else
                     f"{aspect} 이야기를 한 {len(pool)}건 중 추천이 많은 {len(shown)}건을 봤어요.")
        summ = summary_lines(t)
        if not aspect:
            summ = [f"{name}에는 리뷰가 {t.n}건 있어요."]
        quote = quote_line(t)
        c = summ + ([quote] if quote and (not aspect or t.k) else []) + ([read_note] if read_note else [])
        conclusions += [f"{name}: {x}" if len(tallies) > 1 else x for x in c]
        lines.append(f"[{name}] 리뷰 {t.n}건" + (f", {aspect} 분류 — 긍정 {t.pos} · 부정 {t.neg} · 언급 없음 {t.rest}" if aspect and t.labeled else ""))
        lines.append("[리뷰]" if shown else "[리뷰] 그 부분을 말한 리뷰 없음")
        for r in shown:
            tag = {"positive": "긍정", "negative": "부정"}.get(t.labels.get(r["id"]), "")
            lines.append(f"- (별점 {r.get('rating')} · 추천 {r.get('likeCount') or 0}{' · ' + tag if tag else ''}) {r['content']}")
        para = (f"{name}: " if len(tallies) > 1 else "") + " ".join(summ)
        if quote and (not aspect or t.k):
            para += " " + quote
        if read_note:
            para += " " + read_note
        paras.append(para)

    desc = desc_lines(searcher, qvec, qtext, [t.shoe["id"] for t in tallies], aspect)
    if desc:
        lines += ["[설명문]", *desc]
    head = "말씀하신 부분을 리뷰에서 찾아봤어요." if multi else ""
    fallback = "\n\n".join(([head] if head else []) + paras + ["보러 가실래요?"])
    text, used = generate(question, lines, conclusions, fallback, health, history, TASK)
    if not used and not counts_kept(text, tallies):
        guard_log().append("코드 답: 집계 숫자가 바뀜")
        text, used = fallback, True
    reply = Reply(text, [t.shoe for t in tallies], fallback_used=used, branch="experience")
    reply.ranked = order[:10] if multi else []
    reply.tally = [{"shoe_id": t.shoe["id"], "n": t.n, "k": t.k, "pos": t.pos, "neg": t.neg, "rest": t.rest, "labeled": t.labeled} for t in tallies]
    return reply


def candidates(t: Tally, aspect: str, qvec, searcher) -> list[dict]:
    """관점 후보 — 낱말이 나온 리뷰 + 임베딩으로 그만큼 가까운 리뷰 몇 건(LLM 이 none 으로 걸러 낸다).

    유사도의 절대값으로는 가를 수 없었다 — 같은 신발 리뷰는 머리말(신발 이름)을 같이 가져 낱말이 든 리뷰도 0.55~0.76,
    안 든 리뷰도 0.70 이었다(노바블라스트 6 · 무릎, 2026-11-12). 그래서 낱말이 주 신호이고, 임베딩은 「낱말이 든 리뷰의
    중앙값보다 가까운 것」을 EXTRA 건까지 더한다. 낱말이 든 리뷰가 없으면 MENTION_COS 를 넘는 것만 EXTRA 건까지"""
    ids = [f"rev:{r['id']}" for r in t.reviews]
    have, mat = searcher.index.vectors(ids)
    cos = dict(zip(have, (mat @ np.asarray(qvec, dtype=np.float32)).tolist())) if len(have) else {}
    words = [r for r in t.reviews if mentions_by_words(aspect, r["content"])]
    hit_cos = sorted(cos.get(f"rev:{r['id']}", 0.0) for r in words)
    bar = hit_cos[len(hit_cos) // 2] if hit_cos else MENTION_COS
    rest = sorted((r for r in t.reviews if r not in words and cos.get(f"rev:{r['id']}", 0.0) >= bar),
                  key=lambda r: -cos.get(f"rev:{r['id']}", 0.0))[:EXTRA]
    return words + rest


def label(tallies: list[Tally], aspect: str, question: str, qvec, searcher, classify) -> None:
    """관점 후보(낱말 + 임베딩 유사도) → LLM 분류 한 번(모든 신발 함께) → Tally.labels"""
    cands: list[tuple[Tally, dict]] = []
    for t in tallies:
        cands += [(t, r) for r in candidates(t, aspect, qvec, searcher)]
    if not cands:
        for t in tallies:
            t.labeled = True
        return
    ok, labels = False, []
    for attempt in (1, 2):   # 가끔 번호를 빠뜨린다 — 한 번만 다시 묻는다(늦어지는 것은 그때뿐)
        try:
            labels = classify(aspect, question, [r["content"] for _, r in cands])
            ok = len(labels) == len(cands)
        except Exception as e:   # noqa: BLE001
            print(f"[experience] 분류 실패({attempt}): {e!r}")
        if ok:
            break
        if attempt == 1:
            guard_log().append("분류 다시 묻기")
    if not ok:
        # 분류가 안 되면 낱말이 나온 리뷰만 "이야기가 나온 리뷰"로 센다 — 긍부정은 말하지 않는다
        guard_log().append("분류 실패 — 낱말로만 셈")
        for t, r in cands:
            if mentions_by_words(aspect, r["content"]):
                t.labels[r["id"]] = "mentioned"
        return
    for (t, r), v in zip(cands, labels):
        if v in ("positive", "negative"):
            t.labels[r["id"]] = v
    for t in tallies:
        t.labeled = True
        if not t.check():   # 셈이 맞지 않으면 긍부정을 말하지 않는다
            guard_log().append(f"집계 대조 실패 {t.shoe['id']}")
            t.labeled = False


def classify_llm(aspect: str, question: str, contents: list[str]) -> list[str]:
    user = f"관점: {aspect}\n질문: {question}\n\n리뷰\n" + "\n".join(f"[{i + 1}] {c}" for i, c in enumerate(contents))
    data = llm.chat_json(POLARITY_SYSTEM, user, num_predict=60 + 14 * len(contents))
    raw = data.get("labels", data)
    if isinstance(raw, list):   # ["positive", …] 로 올 때가 있다
        raw = {str(i + 1): v for i, v in enumerate(raw)}
    if not isinstance(raw, dict):
        raise ValueError("분류 JSON 모양이 다르다")
    by_num = {}
    for k, v in raw.items():
        m = re.search(r"\d+", str(k))   # "1" · "[1]" · "리뷰 1"
        if m:
            by_num[int(m.group())] = v
    missing = [i for i in range(1, len(contents) + 1) if by_num.get(i) not in ("positive", "negative", "none")]
    if missing:
        raise ValueError(f"분류가 빠진 리뷰 {len(missing)}건")
    return [by_num[i] for i in range(1, len(contents) + 1)]


def desc_lines(searcher, qvec, question: str, shoe_ids: list[int], aspect: str | None) -> list[str]:
    """그 신발 설명문에서 관점을 말한 문장 — 관점 낱말이 든 것만(같은 신발 문장은 유사도가 다 높아 문턱으로 못 가른다).
    관점이 없는 질문("후기 어때요")에는 넣지 않는다 — 설명문 요약이 리뷰 이야기를 밀어냈다"""
    if not aspect:
        return []
    hits = searcher.index.search(qvec, question, 40, {"kind": "desc", "shoe_id": shoe_ids})
    out = []
    for h in hits:
        if mentions_by_words(aspect, h.text) and (h.cosine or 0) >= DESC_COS and len(out) < DESC_MAX:
            out.append(f"- {h.meta.get('model')}: {h.text}")
    return out


_COUNT = re.compile(r"(\d+)\s*건")


def counts_kept(text: str, tallies: list[Tally]) -> bool:
    """답 속 「N건」이 집계에 있는 수인지 · 각 신발의 분모가 들어 있는지(분모가 숨으면 안 된다 — 6절)"""
    allowed = set()
    for t in tallies:
        allowed |= {t.n, t.k, t.pos, t.neg, t.rest, min(t.n, CAP), min(t.k, CAP), CAP_PER_SHOE_MULTI, len(t.mentioned())}
    found = {int(x) for x in _COUNT.findall(text)}
    if found - allowed:
        return False
    return all(t.n == 0 or str(t.n) in text for t in tallies)
