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
from ..facts import PRICE_NOTE
from ..reply import Reply, drop_asks, guard_log, haeyo, plain_words
from ..search.index import like_rerank, rank_shoes
from .common import generate

CAP = 30                 # 답에 넣는 리뷰 상한(사용자 2026-11-12)
CAP_PER_SHOE_MULTI = 10  # 신발을 말하지 않아 여러 켤레를 볼 때 켤레당(30 을 셋으로 — Claude 가 정함, 사용자 확인 2026-11-13)
MULTI_SHOES = 3
MULTI_POOL = 5           # 여러 켤레 — 긍부정을 세 볼 후보 신발. 반대 쪽이 많은 신발을 빼도 셋이 남게(Claude 가 정함)
MIN_REVIEWS = 3          # 여러 켤레 목록에 넣는 최소 리뷰 수 — 리뷰 요약 기능과 같은 기준(사용자 2026-11-13). 지목한 신발은 그대로
# 셀 수 있는 것을 두루뭉술하게 말하는 낱말 — 건수로 말하거나 "~다는 이야기가 있어요"로 끝낸다(사용자 2026-11-13). 이 갈래 생성 검사가 막는다
VAGUE = ("많아요", "대부분", "전반적으로", "주로", "흔히")
CLOSE = "보러 가실래요?"   # 끝 안내 — 코드가 붙인다(LLM 이 쓰면 묻는 말이 둘 됐다, E14)
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

# 집계 문장 · 인용은 코드가 앞에 붙이고(2차 수정 — 꼭 들어갈 문장은 코드가), LLM 은 그 밖의 이야기만 잇는다.
# 끝에 붙는 문장은 [네 답 뒤에 그대로 붙는 문장]으로 보여 준다(common.generate) — 1차의 "질문으로 끝내지 않는다" 금지 문구는 뺐다.
# 금지 예시는 따옴표로 들지 않는다 — "이렇게 확인해 봤어요"를 들었더니 15문항 중 4~7문항이 그대로 붙였다(1차 수정 평가)
TASK = (
    "집계와 인용은 [네 답 앞에 그대로 붙는 글]에 이미 있다. 그것을 되풀이하지 말고, [리뷰]에서 그 밖에 나온 이야기를 이어서 쓴다. "
    "리뷰에서 온 말은 \"등록된 리뷰에서는\"처럼 리뷰라는 것을 밝히고, 리뷰 원문을 따옴표로 옮기지 않는다. "
    "얼마나 나왔는지는 센 건수로만 말한다. 세지 않은 이야기는 \"~다는 이야기가 있어요\"로 끝내고, "
    "\"많아요 · 대부분 · 전반적으로 · 주로 · 흔히 · 대체로 · 자주\"처럼 양을 짐작하는 말을 쓰지 않는다. 긍정과 부정이 다 있으면 둘 다 말한다. "
    "[설명문]은 이 사이트가 쓴 신발 설명이고 리뷰가 아니다 — 옮길 때는 \"신발 설명을 보면\"처럼 리뷰와 갈라 말한다. "
    "한두 문장에서 서너 문장으로 쓰고, 할 말이 적으면 짧게 끝낸다. 어느 신발에나 해당하는 당연한 말로 채우지 않는다. "
    "[설명문]에 질문의 답이 되는 내용이 없으면 설명문 이야기는 하지 않는다."
)
# 여러 켤레 — LLM 글은 모든 신발의 집계 · 인용 뒤에 한데 붙는다. 이름 없이 "리뷰에서는"으로 쓰면 어느 신발 이야기인지 모른다(2차 수정 평가 E11)
MULTI_TASK = " 신발이 여럿이다 — 문단마다 어느 신발 리뷰인지 신발 이름으로 밝힌다."
# 피하려는 질문(라우터 avoid) — 고른 신발을 권하는 모양이 되지 않게(사용자 2026-11-13, E12)
AVOID_TASK = (
    " 사용자는 이런 이야기가 나온 신발을 피하려고 묻는다. 신발을 권하거나 좋게 말하지 말고, 어느 신발 리뷰에서 그 이야기가 나왔는지만 알린다."
)
POLARITY_SYSTEM = """너는 러닝화 리뷰 분류기다. 각 리뷰가 주어진 관점에 대해 어떻게 말하는지 하나를 고른다. JSON 하나만 낸다.

- positive: 그 관점을 직접 말하면서 좋다 · 편하다 · 괜찮다 · 문제없다고 한다
- negative: 그 관점을 직접 말하면서 나쁘다 · 아프다 · 불편하다 · 아쉽다고 한다
- none: 그 관점을 직접 말하지 않는다. 신발이 전반적으로 좋다 · 편하다는 말이나 다른 부분 이야기뿐이면 none
관점이 통증이면: 통증 · 물집 · 쓸림 같은 불편이 생겼다 → negative, 그런 불편이 없었다 · 덜했다고 직접 말한다 → positive.
한 리뷰에 좋은 말과 나쁜 말이 같이 있으면 더 무게가 실린 쪽을 고른다.

asks — 질문이 그 관점에서 어느 쪽 이야기를 찾는지. 좋다는 이야기("편하다는 후기", "넉넉하다는 리뷰") → positive,
나쁘다는 이야기("덥다는 후기", "쓸린다는 후기", "금방 닳아요?") → negative, 어느 쪽도 아니면("무릎 어때요?") → none

{"labels": {"1": "positive" | "negative" | "none", "2": ..., 받은 번호 모두}, "asks": "positive" | "negative" | "none"} — 받은 번호를 모두 넣는다."""
# labels 를 먼저 쓰게 한다 — asks 를 앞에 두었더니 그쪽(negative) 리뷰 번호만 적고 나머지를 빠뜨렸다(28건 중 6건, 2026-11-13)


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

    def count(self, side: str) -> int:
        return self.pos if side == "positive" else self.neg


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


QUOTE_MAX = 220   # 인용 블록 글자 수 상한 — 넘으면 관점 낱말이 든 문장 위주로 줄인다


def quote(t: Tally, want: str | None = None) -> tuple[str, str] | None:
    """인용 — (소개 문장, 인용 블록). 코드가 고르고 코드가 붙인다(2차 수정 — 리뷰 원문을 문장 속에 넣으면 원문의 마침표에 엉켰다, E12).
    관점이 있으면 그 이야기를 한 리뷰 가운데, 찾는 쪽(want)이 있으면 그쪽 리뷰 가운데(avoid 는 부정), 없으면 등록된 리뷰 가운데.
    관점 낱말이 든 리뷰를 먼저, 그 안에서 추천 많은 순. 리뷰는 통째로 옮긴다 — 한 문장만 떼면 "발이 넓어 와이드로 신습니다"처럼 뜻이 빠졌다(E11)"""
    pool = t.mentioned() if t.aspect else by_likes(t.reviews)
    side = None
    if want and any(t.labels.get(r["id"]) == want for r in pool):
        pool = [r for r in pool if t.labels.get(r["id"]) == want]
        side = want
    if t.aspect:
        pool = [r for r in pool if mentions_by_words(t.aspect, r["content"])] + [r for r in pool if not mentions_by_words(t.aspect, r["content"])]
    if not pool:
        return None
    r = pool[0]
    likes = r.get("likeCount") or 0
    top = likes > 0 and likes >= max((x.get("likeCount") or 0) for x in pool)   # 「가장 많은 추천」은 소개한 무리 안에서 정말 그럴 때만
    if t.aspect:
        group = {"positive": f"{t.aspect} 이야기를 좋게 한 리뷰", "negative": f"{t.aspect} 이야기를 아쉽게 한 리뷰"}.get(side, f"{t.aspect} 이야기를 한 리뷰")
    else:
        group = "등록된 리뷰"
    intro = f"{group} 가운데 가장 많은 추천을 받은 리뷰예요." if top else f"{group} 가운데 하나예요."
    return intro, quote_block(r["content"], t.aspect)


def quote_block(content: str, aspect: str | None) -> str:
    """"> " 인용 블록 — 문장마다 한 줄(짧은 꼬리 "실망." 같은 것은 앞 줄에 붙인다)"""
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", content.strip()) if s.strip()]
    if len(" ".join(sents)) > QUOTE_MAX:
        keep = [s for s in sents if aspect and mentions_by_words(aspect, s)] or sents[:1]
        out, n = [], 0
        for s in keep:
            if n + len(s) > QUOTE_MAX and out:
                break
            out.append(s)
            n += len(s)
        sents = out[:-1] + [out[-1].rstrip(".") + " …"] if out else sents[:1]
    lines: list[str] = []
    for s in sents:
        if lines and len(s) < 8:
            lines[-1] += " " + s
        else:
            lines.append(s)
    return "\n".join("> " + x for x in lines)


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
def answer(question: str, shoes: list[dict], catalog, searcher, health: bool, history: list[dict], classify=None,
           avoid: bool = False) -> Reply:
    """shoes — 이름이 나온 신발(없으면 검색으로 고른다). searcher 가 준비 전이면 "잠시 뒤"(bot 이 먼저 본다).
    avoid — 피하려는 질문(라우터). 그 이야기(부정)가 나온 신발만 남기고, 버튼 · "보러 가실래요?"를 붙이지 않는다"""
    classify = classify or classify_llm
    aspect = aspect_of(question)
    qtext = strip_names(question, shoes)
    qvec = searcher.query_vec(qtext)
    multi = not shoes
    order: list[int] = []
    if multi:
        hits = like_rerank(searcher.index.search(qvec, question, 60, {"kind": "review"}))
        # 리뷰 3건 미만인 신발은 목록에 넣지 않는다(사용자 2026-11-13 — 리뷰 요약과 같은 기준)
        order = [sid for sid, _ in rank_shoes(hits) if sid in catalog.by_id and (catalog.by_id[sid].get("reviewCount") or 0) >= MIN_REVIEWS]
        if aspect:
            # 관점을 물었으면 검색 결과 가운데 그 낱말이 든 리뷰가 많은 신발부터 — 상위 문서 하나로만 고르면 언급 0건 신발이 섞였다
            n_words = {sid: sum(1 for h in hits if h.shoe_id == sid and mentions_by_words(aspect, h.text)) for sid in order}
            order = sorted(order, key=lambda sid: (-n_words[sid], order.index(sid)))
        shoes = [catalog.by_id[sid] for sid in order][:MULTI_POOL if aspect else MULTI_SHOES]
        if not shoes:
            return Reply(prompt.NO_DATA, branch="experience")
    else:
        shoes = shoes[:MULTI_SHOES]
    tallies = [Tally(s, http.get_json("/api/reviews", {"shoeId": s["id"]}), aspect) for s in shoes]
    if multi:
        tallies = [t for t in tallies if t.n >= MIN_REVIEWS]   # 카탈로그 건수와 지금 건수가 다를 때
    else:
        tallies = [t for t in tallies if t.n > 0] or tallies
    want = None
    if aspect and tallies:
        asks = label(tallies, aspect, question, qvec, searcher, classify)
        # 피하려는 질문은 늘 부정 쪽(쓸린다 · 덥다는 이야기가 나온 신발)
        want = "negative" if avoid else asks if asks in ("positive", "negative") else None
    if multi:
        tallies = pick_shoes(tallies, want, avoid)
        if not tallies:
            return Reply(NO_MATCH, links_off=True, branch="experience")

    cap = CAP if len(tallies) == 1 else CAP_PER_SHOE_MULTI
    named = multi or len(tallies) > 1   # 챗봇이 고른 신발은 하나만 남아도 이름을 앞에(무슨 신발 이야기인지 모른다)
    lines: list[str] = []    # LLM 에 주는 근거(리뷰 원문 · 설명문)
    blocks: list[str] = []   # 코드가 쓰는 앞 글 — 집계 문장 · 인용(꼭 들어갈 문장은 코드가, 2차 수정 2 · 5)
    for t in tallies:
        name = shoe_name(t.shoe)
        if t.n == 0:
            blocks.append(f"{name}에는 아직 등록된 리뷰가 없어요.")
            continue
        # 관점을 물었는데 말한 리뷰가 없으면 리뷰를 넣지 않는다 — 넣으면 LLM 이 다른 이야기로 채운다
        pool = t.mentioned() if aspect else by_likes(t.reviews)
        shown = pool[:cap]
        cut = len(pool) > cap
        # 잘랐으면 밝힌다 — 분모는 늘 전체(사용자 3)
        read_note = (None if not cut else f"리뷰 {t.n}건 중 추천이 많은 {len(shown)}건을 봤어요." if not aspect else
                     f"{aspect} 이야기를 한 {len(pool)}건 중 추천이 많은 {len(shown)}건을 봤어요.")
        summ = summary_lines(t) or [f"{name}에는 리뷰가 {t.n}건 있어요."]
        q = quote(t, want) if (not aspect or t.k) else None
        blocks.append((f"{name}: " if named and aspect else "") + " ".join(summ + ([read_note] if read_note else []) + ([q[0]] if q else [])))
        if q:
            blocks.append(q[1])
        # 근거 머리 — 내부 말("분류" · "관점")을 쓰지 않는다. LLM 이 그대로 옮겼다(E09 "내구성 분류에 대한 언급이 없어요")
        lines.append(f"[{name}] 리뷰 {t.n}건" + (f" — {aspect} 이야기: 좋다 {t.pos}건 · 아쉽다 {t.neg}건 · 그 이야기 없음 {t.rest}건" if aspect and t.labeled else ""))
        lines.append("[리뷰]" if shown else f"[리뷰] {aspect or '그 부분'} 이야기를 한 리뷰 없음")
        for r in shown:
            tag = {"positive": "긍정", "negative": "부정"}.get(t.labels.get(r["id"]), "")
            lines.append(f"- (별점 {r.get('rating')} · 추천 {r.get('likeCount') or 0}{' · ' + tag if tag else ''}) {r['content']}")

    desc = [] if avoid else desc_lines(searcher, qvec, qtext, [t.shoe["id"] for t in tallies], aspect)   # 피할 신발의 구조 설명은 권하는 말이 된다
    if desc:
        lines += [DESC_HEAD, *desc]
    head = (AVOID_HEAD if avoid else "말씀하신 부분을 리뷰에서 찾아봤어요.") if multi else ""
    before = ([head] if head else []) + blocks
    tails = [] if avoid else [CLOSE]
    body, used = "", False
    if any(l.startswith("- (") for l in lines) or desc:   # 집계 · 인용 밖에 말할 거리가 있을 때만 LLM 을 부른다(0건이면 코드 글로 끝)
        task = TASK + (MULTI_TASK if len(tallies) > 1 else "") + (AVOID_TASK if avoid else "")
        body, used = generate(question, lines, [], "", health, history, task,
                              reference=False, before=before, tails=tails)
        if used:
            body = ""   # 검사에 걸리면 LLM 글만 뺀다 — 앞 글(집계 · 인용)과 끝은 코드가 쓴 그대로
        else:
            body = tidy(drop_repeats(body, before))
            if not counts_kept(body, tallies, need_denominator=False):
                guard_log().append("LLM 글 뺌: 집계에 없는 건수")
                body, used = "", True
    text = "\n\n".join(before + ([body] if body else []) + tails)
    reply = Reply(text, [t.shoe for t in tallies], links_off=avoid, fallback_used=used, branch="experience")
    reply.ranked = order[:10] if multi else []
    reply.tally = [{"shoe_id": t.shoe["id"], "n": t.n, "k": t.k, "pos": t.pos, "neg": t.neg, "rest": t.rest, "labeled": t.labeled} for t in tallies]
    reply.want = want
    return reply


AVOID_HEAD = "말씀하신 이야기가 나온 리뷰를 찾아봤어요. 아래 신발은 등록된 리뷰에 그런 이야기가 있었어요."
NO_MATCH = "말씀하신 이야기가 나온 리뷰를 등록된 리뷰에서 찾지 못했어요. 신발 이름을 알려주시면 그 신발 리뷰를 살펴볼게요."


DESC_HEAD = "[설명문] 이 사이트가 쓴 신발 설명이다(리뷰가 아니다)"


def tidy(body: str) -> str:
    """LLM 글 다듬기 — 양 짐작 문장 · 발매가 문장 · 묻는 문장을 지우고 해요체로"""
    # 양을 짐작하는 말이 든 문장은 지운다 — 답 전체를 코드 답으로 바꾸면 짧고 딱딱해진다(5-1 B03)
    body = drop_vague(body)
    # 이 갈래는 가격을 다루지 않는다 — 말투 예시의 발매가 문장을 그대로 옮겨 붙였다(1차 수정 평가 E01 · E06 · E11)
    body = "\n\n".join(p for p in (q.replace(PRICE_NOTE, "").strip() for q in body.split("\n\n")) if p)
    # 묻는 말은 코드가 끝에 붙인다 — 남은 묻는 문장은 지운다(뒤에 붙는 문장을 보여 준 뒤에도 남는지 guard 로그로 센다)
    body = drop_asks(body)
    return haeyo(body)


def _key(s: str) -> str:
    return re.sub(r"[\s\"'>.,!?·—:-]", "", s)


def drop_repeats(body: str, before: list[str]) -> str:
    """앞 글(코드가 쓴 집계 · 인용)을 LLM 이 그대로 다시 쓴 문장을 지운다 — 앞부분이라고 알려 줘도 옮겨 썼다(2차 수정 평가 E11 · E12)"""
    seen = {_key(s) for b in before for s in re.split(r"(?<=[.!?])\s+|\n+", b) if len(_key(s)) >= 6}
    paras = []
    for para in body.split("\n\n"):
        kept = [s for s in re.split(r"(?<=[.!?])\s+", para.strip()) if _key(s) not in seen or len(_key(s)) < 6]
        # 한 문장에 앞 글 두 문장이 붙어 온 것("…없음이에요. 발볼 이야기를…")도 위에서 문장으로 나뉘어 걸린다
        if len(kept) < len([s for s in re.split(r"(?<=[.!?])\s+", para.strip()) if s]):
            guard_log().append("앞 글 되풀이 지움")
        if kept:
            paras.append(" ".join(kept))
    return "\n\n".join(paras)


def drop_vague(text: str) -> str:
    """VAGUE 낱말이 든 문장을 지운다(인용 따옴표 안은 리뷰 원문이라 둔다)"""
    paras = []
    for para in text.split("\n\n"):
        sents = re.split(r"(?<=[.!?])\s+", para.strip())
        kept = []
        for s in sents:
            outside = re.sub(r"\"[^\"]*\"", "", s)
            if any(w in outside for w in VAGUE):
                guard_log().append("양 짐작 문장 지움")
                continue
            kept.append(s)
        if kept:
            paras.append(" ".join(kept))
    return "\n\n".join(paras)


def pick_shoes(tallies: list[Tally], want: str | None, avoid: bool) -> list[Tally]:
    """여러 켤레 — 질문이 찾는 쪽(want) 건수가 많은 순으로 셋(사용자 2026-11-13, E11).
    반대 쪽이 더 많은 신발은 뺀다(Claude 가 정함 — 넣고 먼저 밝히는 것보다 낫다: 09 16절). 피하려는 질문은 부정이 긍정보다 많은 신발만(E12).
    분류가 안 됐으면(낱말로만 셈) 긍부정을 모르니 거르지 않는다"""
    if want is None or not all(t.labeled for t in tallies):
        return tallies[:MULTI_SHOES]
    other = "negative" if want == "positive" else "positive"
    if avoid:
        keep = [t for t in tallies if t.count(want) > t.count(other)]
    else:
        keep = [t for t in tallies if t.count(want) >= 1 and t.count(other) <= t.count(want)]
    keep.sort(key=lambda t: -t.count(want))   # 같으면 검색 순서(안정 정렬)
    return keep[:MULTI_SHOES]


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


def label(tallies: list[Tally], aspect: str, question: str, qvec, searcher, classify) -> str | None:
    """관점 후보(낱말 + 임베딩 유사도) → LLM 분류 한 번(모든 신발 함께) → Tally.labels.
    돌려주는 것은 질문이 찾는 쪽(asks — positive · negative · none, 모르면 None). classify 는 목록이나 (목록, asks) 를 낸다"""
    cands: list[tuple[Tally, dict]] = []
    for t in tallies:
        cands += [(t, r) for r in candidates(t, aspect, qvec, searcher)]
    if not cands:
        for t in tallies:
            t.labeled = True
        return None
    ok, labels, asks = False, [], None
    for attempt in (1, 2):   # 가끔 번호를 빠뜨린다 — 한 번만 다시 묻는다(늦어지는 것은 그때뿐)
        try:
            out = classify(aspect, question, [r["content"] for _, r in cands])
            labels, asks = out if isinstance(out, tuple) else (out, None)
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
        return None
    for (t, r), v in zip(cands, labels):
        if v in ("positive", "negative"):
            t.labels[r["id"]] = v
    for t in tallies:
        t.labeled = True
        if not t.check():   # 셈이 맞지 않으면 긍부정을 말하지 않는다
            guard_log().append(f"집계 대조 실패 {t.shoe['id']}")
            t.labeled = False
    return asks


def classify_llm(aspect: str, question: str, contents: list[str]) -> tuple[list[str], str | None]:
    user = f"관점: {aspect}\n질문: {question}\n\n리뷰\n" + "\n".join(f"[{i + 1}] {c}" for i, c in enumerate(contents))
    data = llm.chat_json(POLARITY_SYSTEM, user, num_predict=80 + 14 * len(contents))
    asks = data.get("asks") if data.get("asks") in ("positive", "negative", "none") else None
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
    return [by_num[i] for i in range(1, len(contents) + 1)], asks


def desc_lines(searcher, qvec, question: str, shoe_ids: list[int], aspect: str | None) -> list[str]:
    """그 신발 설명문에서 관점을 말한 문장 — 관점 낱말이 든 것만(같은 신발 문장은 유사도가 다 높아 문턱으로 못 가른다).
    관점이 없는 질문("후기 어때요")에는 넣지 않는다 — 설명문 요약이 리뷰 이야기를 밀어냈다"""
    if not aspect:
        return []
    hits = searcher.index.search(qvec, question, 40, {"kind": "desc", "shoe_id": shoe_ids})
    out = []
    for h in hits:
        if mentions_by_words(aspect, h.text) and (h.cosine or 0) >= DESC_COS and len(out) < DESC_MAX:
            # 설명문 원문은 합니다체 · 사전 용어 — 해요체 · 쉬운 말로 바꿔 준다(2차 수정 6 — 여러 켤레 답에 "평이 있습니다"가 샜다)
            out.append(f"- {h.meta.get('model')}: {plain_words(haeyo(h.text))}")
    return out


_COUNT = re.compile(r"(\d+)\s*건")


def counts_kept(text: str, tallies: list[Tally], need_denominator: bool = True) -> bool:
    """답 속 「N건」이 집계에 있는 수인지 · 각 신발의 분모가 들어 있는지(분모가 숨으면 안 된다 — 6절).
    need_denominator=False — LLM 글만 볼 때(분모는 코드가 쓴 앞 글에 있다)"""
    allowed = set()
    for t in tallies:
        allowed |= {t.n, t.k, t.pos, t.neg, t.rest, min(t.n, CAP), min(t.k, CAP), CAP_PER_SHOE_MULTI, len(t.mentioned())}
    found = {int(x) for x in _COUNT.findall(text)}
    if found - allowed:
        return False
    return not need_denominator or all(t.n == 0 or str(t.n) in text for t in tallies)
