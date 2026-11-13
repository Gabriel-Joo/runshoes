"""경험 · 후기 — 하이브리드 검색 + 리뷰 집계(작업 5-2, docs/09_chatbot_rag.md 6절 · 7절 · 16절).

검색은 후보를 고르는 데만 쓰고, 말은 전체를 놓고 한다(6절).
1. 신발 — 이름이 나왔으면 그 신발, 아니면 리뷰 검색 → 신발 순위 상위 3켤레
2. 집계 — 그 신발 리뷰를 API 에서 새로 읽는다(분모는 늘 지금 값). 관점(무릎 · 발볼 …)을 물었으면
   그 관점을 말한 리뷰 후보(낱말 묶음 + 임베딩 유사도)를 LLM 에 JSON 으로 한 번 묻고(temperature 0) 코드가 센다.
   좋다 + 아쉽다 = 그 이야기가 나온 리뷰 ≤ N 을 코드가 맞춰 본다. 별점으로 대신하지 않는다
3. 답 — 틀리면 안 되는 것(집계 · 인용)은 코드가 쓰고, LLM 은 리뷰 여러 건을 묶어 말하기만(5차 수정).
   LLM 근거에는 건수가 없고, 근거 리뷰에 없는 숫자 · 건수가 든 문장은 지운다. 설명문은 이 갈래에서 쓰지 않는다(운영 뒤).
   리뷰는 30건까지(넘으면 추천 많은 순, 잘랐다고 밝힌다)

리뷰는 가상 유저 200명이 만든 데이터다 — "등록된 리뷰"로 말한다(러너들이 · 실제 사용자 · 많은 사람들 금지, 코드가 막는다).
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from .. import http, llm, prompt
from ..facts import (PRICE_NOTE, STABILITY_PLAIN, WIDE_SCOPE, WIDTH_PLAIN, euro, josa, jong, num, weight_converted,
                     weight_phrase)
from ..reply import Reply, drop_asks, guard_log, guard_reset, haeyo, name_forms
from ..search.index import like_rerank, rank_shoes
from .common import generate

CAP = 30                 # 답에 넣는 리뷰 상한(사용자 2026-11-12)
# 관점이 없는 질문("후기 어때요") — 리뷰를 좋다는 쪽 · 아쉽다는 쪽으로 묶어 준다(8차 수정, 사용자 2026-11-13).
# 7차의 주제 묶음(theme_groups — 주제마다 추천 많은 2건)은 추천 많은 리뷰가 거의 좋다는 쪽이라 아쉬운 이야기가 빠졌다(E06 · E07 · E15)
SIDE_GOOD = 3            # 좋다는 쪽에서 LLM 에 주는 리뷰(추천 많은 순) — 8차 측정으로 정함(09 16절)
SIDE_BAD = 4             # 아쉽다는 쪽에서 LLM 에 주는 리뷰 — 3 이면 클리프톤 10 "튀는 맛이 없다"(추천 7위)가 빠졌다. 5 와 문장 수 · 내용이 비슷
CAP_PER_SHOE_MULTI = 10  # 신발을 말하지 않아 여러 켤레를 볼 때 켤레당(30 을 셋으로 — Claude 가 정함, 사용자 확인 2026-11-13)
MULTI_SHOES = 3
MULTI_POOL = 5           # 여러 켤레 — 긍부정을 세 볼 후보 신발. 반대 쪽이 많은 신발을 빼도 셋이 남게(Claude 가 정함)
MIN_REVIEWS = 3          # 여러 켤레 목록에 넣는 최소 리뷰 수 — 리뷰 요약 기능과 같은 기준(사용자 2026-11-13). 지목한 신발은 그대로
# 셀 수 있는 것을 두루뭉술하게 말하는 낱말 — 건수로 말하거나 "~다는 이야기가 있어요"로 끝낸다(사용자 2026-11-13). 이 갈래 생성 검사가 막는다
VAGUE = ("많아요", "대부분", "전반적으로", "주로", "흔히")
CLOSE = "보러 가실래요?"   # 끝 안내 — 코드가 붙인다(LLM 이 쓰면 묻는 말이 둘 됐다, E14)
MENTION_COS = 0.60       # 낱말이 든 리뷰가 없을 때 임베딩만으로 후보에 넣는 문턱(candidates 참고)
EXTRA = 5                # 임베딩으로 더하는 후보 상한(신발마다)
# 설명문은 이 갈래에서 쓰지 않는다(5-2 운영 뒤, 사용자 2026-11-13 — "밑창 금방 닳아요?"에 갑피 · 통기성 · 텅 이야기까지 붙었다.
# 리뷰로 답이 되고 설명문은 상세 페이지에 있다). 5차부터 코드가 LLM 글 뒤에 붙이던 "신발 설명을 보면 …"을 걷었다. 특성 설명 갈래는 그대로

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
# 앞뒤에 붙는 것은 문장을 보여 주지 않고 무엇인지만 알린다(BEFORE_NOTE · common.attached_note — 3차 수정, 보여 주면 따라 썼다).
# 금지 예시는 따옴표로 들지 않는다 — 보여 주면 따라 쓴다(1차 "이렇게 확인해 봤어요"). 4차 수정: 낱말 금지 대신 원칙으로.
# 5차 수정(사용자 2026-11-13): 코드와 LLM 의 역할을 나눈다 — 집계 · 인용 · 설명문은 코드가, LLM 은 리뷰 여러 건을 묶어 말하기만.
# 근거에서 건수 · 설명문을 뺐다(4차에 준 건수를 엉뚱한 말에 붙였다 — E03 "발볼이 눌린다는 이야기가 3건").
# 6차 수정 3: "숫자를 쓰지 않는다"가 리뷰 속 "9월"까지 "아홉월"로 바꾸게 했다 — 막는 것은 건수 · 양만, 리뷰 속 숫자는 그대로.
# 코드는 근거 리뷰에 없는 숫자 · "N건"이 든 문장만 지운다
# 앞머리만 갈린다 — 관점 있는 질문은 리뷰 하나하나(TASK_EACH, 그대로), 관점 없는 질문은 쪽 묶음마다(TASK_SIDES — 8차 수정.
# 7차의 주제 묶음 TASK_THEMES 는 뺐다)
TASK_EACH = "[리뷰]에 있는 이야기를 리뷰 하나하나 전한다 — \"한 리뷰에서는 …다는 이야기가 있어요\", \"다른 리뷰에서는 …\"처럼 "
TASK_SIDES = (
    "[리뷰]는 좋다는 쪽과 아쉽다는 쪽으로 묶여 있다. 좋다는 쪽 묶음의 이야기를 한두 문장, 아쉽다는 쪽 묶음의 이야기를 한두 문장으로 쓴다 — "
    "아쉽다는 쪽 묶음에서는 그 리뷰의 아쉬운 이야기만 쓰고, 그 리뷰에 섞인 좋은 말은 쓰지 않는다. 묶음이 없는 쪽은 쓰지 않는다. "
    "\"~다는 이야기가 있어요\"처럼 "
)
TASK_BODY = (
    "리뷰에서 나온 말이라는 꼴로 쓰고, 리뷰 문장을 그대로 옮기거나 리뷰 내용을 네 말로 단정하지 않는다. "
    "[리뷰]에 있는 내용만 말한다. [리뷰]에 없는 것은 없다고도 말하지 않는다. "
    "건수나 양을 세지 않는다 — 몇 건인지는 앞의 집계가 이미 말했다. 리뷰에 있는 숫자는 그대로 써도 된다. "
    "좋다는 쪽과 아쉽다는 쪽이 다 있으면 둘 다 말한다. "
    "문단마다 앞에서 하지 않은 새 이야기가 있어야 한다. 할 말이 없으면 그 문단을 쓰지 않는다 — 쓸 것이 하나도 없으면 아무것도 쓰지 않아도 된다."
)
TASK = TASK_EACH + TASK_BODY
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

# 관점 없는 질문의 쪽 가르기(8차 수정) — 리뷰 전체를 놓고. 별점으로 대신하지 않는다(5-2 처음 결정 9).
# 좋은 말과 아쉬운 말이 같이 든 리뷰(mixed)는 아쉽다는 쪽 칸에 넣는다 — 아쉬운 이야기를 놓치지 않게(사용자 2026-11-13,
# "쿠션은 좋은데 롱런엔 모자라다"). 다만 아쉬움이 중심인 리뷰(negative)를 먼저 고른다 — 추천 순으로만 고르면 아쉬움이 작은
# 섞인 리뷰("처음엔 어색했어요")가 자리를 차지하고, 아쉬움이 큰 리뷰는 추천이 적어 뒤로 밀렸다(노바블라스트 6: 24 · 30위, 8차 측정)
SIDES_SYSTEM = """너는 러닝화 리뷰 분류기다. 각 리뷰가 신발을 어떻게 말하는지 하나를 고른다. JSON 하나만 낸다.

- positive: 신발에 대해 좋다 · 편하다 · 만족한다는 말만 있다
- mixed: 좋은 말과 아쉬운 점(불편 · 모자란 점)이 같이 있다
- negative: 아쉬운 점 · 불편 · 실망이 중심이다
- none: 신발에 대한 평가가 없다

{"labels": {"1": "positive" | "mixed" | "negative" | "none", "2": ..., 받은 번호 모두}} — 받은 번호를 모두 넣는다."""


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
        self.sides: dict[int, str] | None = None   # 관점 없는 질문 — 리뷰 id → positive · negative(8차 수정). 집계 문장에는 쓰지 않는다

    @property
    def pos(self) -> int:
        return sum(1 for v in self.labels.values() if v == "positive")

    @property
    def neg(self) -> int:
        return sum(1 for v in self.labels.values() if v == "negative")

    @property
    def k(self) -> int:
        return len(self.labels)

    def check(self) -> bool:
        """좋다 + 아쉽다 = 그 이야기가 나온 리뷰, 그 수 ≤ 전체(5차 수정 — "나머지 N건은 언급 없음"을 빼며 칸을 셋에서 둘로)"""
        return self.pos + self.neg == self.k <= self.n

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
    # 5차 수정: "나머지 N건은 언급 없음"은 N - k 라 새 정보가 없어 뺐다. 긍정 · 부정 → 좋다 · 아쉽다(인용 소개 문장과 같은 말).
    # 한쪽이 0이면 "모두 …쪽"으로 한 문장에(따로 두던 "부정 언급은 없었어요"는 같은 말을 두 번 했다)
    head = f"리뷰 {t.n}건 중 {a} 이야기가 {t.k}건이고"
    if t.neg == 0:
        return [f"{head}, 모두 좋다는 쪽이에요."]
    if t.pos == 0:
        return [f"{head}, 모두 아쉽다는 쪽이에요."]
    return [f"{head}, 그중 좋다는 쪽이 {t.pos}건 아쉽다는 쪽이 {t.neg}건이에요."]


QUOTE_MAX = 160   # 인용 글자 수 상한(3차 수정 220 → 160 — 관점 문장 + 앞뒤 한 문장이면 넉넉하다)
SHORT = 20        # 관점 문장이 이보다 짧으면 다음 문장을 붙인다("발이 넓어 와이드로 신습니다." → 뒤 문장이 뜻을 잇는다, E11)
_LEAD = re.compile(r"^(그래서|그런데|근데|하지만|그래도|그러니|그러다|그랬더니|대신|덕분에|그 덕에|그만큼)")

# 소개 문장 — 조립하지 않고 경우마다 따로 둔다(3차 수정 1 — "통증 이야기를 아쉽게 한 리뷰"가 한국어가 아니었다)
# 열쇠: (찾는 쪽, 가장 많은 추천인지). {a} 는 관점 + 을/를
INTRO = {
    (None, True): "{a} 말한 리뷰 가운데 가장 많은 추천을 받은 리뷰예요.",
    (None, False): "{a} 말한 리뷰 가운데 한 건이에요.",
    ("positive", True): "{a} 말한 리뷰 중 좋다는 쪽에서, 가장 많은 추천을 받은 리뷰예요.",
    ("positive", False): "{a} 말한 리뷰 중 좋다는 쪽의 한 건이에요.",
    ("negative", True): "{a} 말한 리뷰 중 아쉽다는 쪽에서, 가장 많은 추천을 받은 리뷰예요.",
    ("negative", False): "{a} 말한 리뷰 중 아쉽다는 쪽의 한 건이에요.",
}
INTRO_ALL = {True: "등록된 리뷰 가운데 가장 많은 추천을 받은 리뷰예요.", False: "등록된 리뷰 가운데 한 건이에요."}


def quote(t: Tally, want: str | None = None, focus: tuple[str, ...] = ()) -> tuple[str, str, int] | None:
    """인용 — (소개 문장, 인용 블록, 리뷰 id). 코드가 고르고 코드가 붙인다(2차 수정 — 리뷰 원문을 문장 속에 넣으면 원문의 마침표에 엉켰다, E12).
    관점이 있으면 그 이야기를 한 리뷰 가운데, 찾는 쪽(want)이 있으면 그쪽 리뷰 가운데(avoid 는 부정), 없으면 등록된 리뷰 가운데.
    질문의 낱말(focus — "물집" · "쓸리")이 든 리뷰 → 관점 낱말이 든 리뷰 → 나머지, 그 안에서 추천 많은 순"""
    pool = t.mentioned() if t.aspect else by_likes(t.reviews)
    side = None
    if want and any(t.labels.get(r["id"]) == want for r in pool):
        pool = [r for r in pool if t.labels.get(r["id"]) == want]
        side = want
    words = tuple(focus) or (_ASPECT[t.aspect] if t.aspect else ())
    if t.aspect:
        rank = lambda r: 0 if any(w in r["content"] for w in focus) else 1 if mentions_by_words(t.aspect, r["content"]) else 2   # noqa: E731
        pool = sorted(pool, key=rank)   # 안정 정렬 — 같은 무리 안은 추천 순 그대로
    if not pool:
        return None
    r = pool[0]
    likes = r.get("likeCount") or 0
    top = likes > 0 and likes >= max((x.get("likeCount") or 0) for x in pool)   # 「가장 많은 추천」은 소개한 무리 안에서 정말 그럴 때만
    if t.aspect:
        intro = INTRO[(side, top)].format(a=josa(t.aspect, "을", "를"))
    else:
        intro = INTRO_ALL[top]
    return intro, quote_block(r["content"], words), r["id"]


def quote_block(content: str, words: tuple[str, ...] = ()) -> str:
    """"> " 인용 블록 — 리뷰 통째가 아니라 관점 문장 중심(3차 수정 3 — E13 가이드 19 는 네 줄 중 한 줄만 질문과 관련).
    관점 낱말이 든 문장(둘까지)에, 그 문장이 짧거나 이음말로 시작하면 앞뒤 한 문장. 관점 문장이 없으면 앞 두 문장.
    문장마다 한 줄(짧은 꼬리 "실망." 같은 것은 앞 줄에 붙인다)"""
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", content.strip()) if s.strip()]
    hits = [i for i, s in enumerate(sents) if words and any(w in s for w in words)][:2]
    if hits:
        idx = set(hits)
        for i in hits:
            if _LEAD.match(sents[i]) and i > 0:
                idx.add(i - 1)
            if (len(sents[i]) < SHORT or (i + 1 < len(sents) and len(sents[i + 1]) < 8)) and i + 1 < len(sents):
                idx.add(i + 1)
        picked = [sents[i] for i in sorted(idx)]
    else:
        picked = sents[:2]
    out, n = [], 0
    for s in picked:
        if out and n + len(s) > QUOTE_MAX:
            break
        out.append(s)
        n += len(s)
    sents = out
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
           avoid: bool = False, classify_sides=None) -> Reply:
    """shoes — 이름이 나온 신발(없으면 검색으로 고른다). searcher 가 준비 전이면 "잠시 뒤"(bot 이 먼저 본다).
    avoid — 피하려는 질문(라우터). 그 이야기(부정)가 나온 신발만 남기고, 버튼 · "보러 가실래요?"를 붙이지 않는다"""
    classify = classify or classify_llm
    classify_sides = classify_sides or classify_sides_llm
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

    # 관점이 없는 질문은 이 리뷰를 좋다 · 아쉽다로 갈라 쪽마다 몇 건만 LLM 에 준다(8차 수정 — split_sides · evidence).
    # 6차엔 10건으로 줄여도 길이가 줄지 않았고(묶을 축이 없다), 7차의 주제 묶음은 아쉬운 이야기를 빠뜨렸다
    cap = CAP if len(tallies) == 1 else CAP_PER_SHOE_MULTI
    named = multi or len(tallies) > 1   # 챗봇이 고른 신발은 하나만 남아도 이름을 앞에(무슨 신발 이야기인지 모른다)
    sections: list[list[str]] = []   # 신발마다 코드가 쓰는 글 — 집계 문장 + 소개, 인용 블록(꼭 들어갈 문장은 코드가, 2차 수정 2 · 5)
    jobs: list[tuple | None] = []    # 신발마다 LLM 에 줄 근거
    # 통증은 낱말 묶음이 넓다(아프 · 물집 · 쓸림 · 저림 …) — 질문의 낱말("물집" · "쓸리")이 든 리뷰만 인용 · 근거로(3차 수정 3, E12)
    focus = tuple(w for w in _ASPECT[aspect] if w in question) if aspect == "통증" else ()
    for t in tallies:
        name = shoe_name(t.shoe)
        if t.n == 0:
            sections.append([f"{name}에는 아직 등록된 리뷰가 없어요."])
            jobs.append(None)
            continue
        # 관점을 물었는데 말한 리뷰가 없으면 리뷰를 넣지 않는다 — 넣으면 LLM 이 다른 이야기로 채운다
        pool = t.mentioned() if aspect else by_likes(t.reviews)
        shown = pool[:cap]
        cut = len(pool) > cap
        # 잘랐으면 밝힌다 — 분모는 늘 전체(사용자 3). "봤다"는 이 답이 고른 범위 = 인용과 근거를 고른 리뷰 수.
        # 관점 없는 질문(8차 수정)은 이 30건에서 인용을 고르고 좋다 · 아쉽다를 가르고, LLM 에는 쪽마다 몇 건만 준다
        read_note = (None if not cut else f"리뷰 {t.n}건 중 추천이 많은 {len(shown)}건을 봤어요." if not aspect else
                     f"{aspect} 이야기를 한 {len(pool)}건 중 추천이 많은 {len(shown)}건을 봤어요.")
        summ = summary_lines(t) or [f"{name}에는 리뷰가 {t.n}건 있어요."]
        # 그 관점 이야기가 0건이면 스펙으로 답할 수 있는 관점만 스펙 한 줄(운영 뒤, 사용자 승인 — 0건이 흔해 답이 자주 비었다)
        if aspect in SPEC_ASPECTS and t.n and t.k == 0:
            line = spec_line(t.shoe, aspect)
            if line:
                summ = summ + [line]
        q = quote(t, want, focus) if (not aspect or t.k) else None
        sec = [(f"{name}: " if named and aspect else "") + " ".join(summ + ([read_note] if read_note else []) + ([q[0]] if q else []))]
        if q:
            sec.append(q[1])
        sections.append(sec)
        # 인용한 리뷰는 근거에서 뺀다 — 근거에 남기면 인용 바로 아래에서 리뷰 말투째 다시 풀어 썼다(3차 수정 2, E16)
        shown_ids = {r["id"] for r in shown} - ({q[2]} if q else set())
        # 관점이 없으면 상한 안 리뷰(인용 뺌) 전체를 좋다 · 아쉽다로 가른다 — LLM 호출 하나(8차 수정). 아쉬운 리뷰는 추천이 적어
        # 추천 순 뒤쪽에 있다(노바블라스트 6: 6 · 8 · 24 · 26 · 30위) — 그래서 30건 전체를 가른다(6차의 10건 상한은 다시 두지 않는다)
        if not aspect:
            t.sides = split_sides([r for r in shown if r["id"] in shown_ids], classify_sides)
        ev = evidence(t, pool, shown_ids, aspect, focus, t.sides)
        # LLM 글에 써도 되는 숫자의 출처 — 이 신발에 준 근거 리뷰 + 인용 블록(6차 수정 3)
        jobs.append((t, ev, "\n".join(ev + ([q[1]] if q else []))) if ev else None)

    head = (AVOID_HEAD if avoid else "말씀하신 부분을 리뷰에서 찾아봤어요.") if multi else ""
    before = [x for sec in sections for x in sec]
    tails = [] if avoid else [CLOSE]
    # 길이 — 신발마다 따로 쓰니 여러 켤레면 짧게(한데 쓸 때의 "한두~서너 문장"을 신발마다 맞춤)
    # 관점 없는 질문은 쪽 묶음이 길이를 정한다(좋다 · 아쉽다 × 한두 문장 — 8차 수정)
    task = (TASK_SIDES + TASK_BODY if not aspect else
            TASK + (" 두세 문장, 한 문단으로." if len(tallies) > 1 else " 두 문장에서 네 문장으로.")) + (AVOID_TASK if avoid else "")

    def comment(job) -> tuple[str, bool, list[str]]:
        """신발 하나의 LLM 글 — 신발마다 따로 부른다(4차 수정 3: 한데 쓰게 하면 어느 신발 이야기인지 이름이 빠졌다).
        글은 그 신발의 인용 바로 아래에 붙는다. guard 로그는 스레드마다라 돌려준다"""
        guard_reset()
        if job is None:
            return "", False, []
        t, ev, src = job
        lines = [f"[{shoe_name(t.shoe)}]", *ev]
        # 근거 리뷰에 없는 숫자 · 건수("N건")가 든 문장은 검사 전에 지운다(5차 수정 1-1 → 6차 수정 3에서 좁힘).
        # 말투 예시는 주지 않는다(9차 수정 — prompt.EXAMPLES_BY_BRANCH)
        body, used = generate(question, lines, [], "", health, [], task, reference=False, before=before,
                              before_note=BEFORE_NOTE, tails=tails, no_digits=name_forms(t.shoe), digit_source=src,
                              branch="experience")
        if used:
            # 검사에 걸리면 LLM 글만 뺀다 — 집계 · 인용과 끝은 코드가 쓴 그대로. 빈 글(쓸 것이 없음)은 걸린 것이 아니다
            empty = guard_log()[-1:] == ["코드 답: 빈 글"]
            return "", not empty, list(guard_log())
        return tidy(body), False, list(guard_log())

    # 대화 기록은 주지 않는다(4차 수정 — 앞 턴의 스펙 답에서 "쿠션 소재가 FF Blast Max …"를 옮겨 왔다, E15). 근거는 [리뷰]뿐
    if sum(j is not None for j in jobs) > 1:
        with ThreadPoolExecutor(max_workers=len(jobs)) as ex_:
            outs = list(ex_.map(comment, jobs))
    else:
        mine = list(guard_log())
        outs = [comment(j) for j in jobs]
        guard_log()[:0] = mine   # comment 가 이 스레드의 로그를 비웠다 — 앞의 것을 되돌린다
    used = False
    parts = [head] if head else []
    for sec, (body, u, logs) in zip(sections, outs):
        # 신발마다: 집계 + 인용(코드) → 리뷰 이야기(LLM). 5차부터 붙이던 설명문 단락은 뺐다(운영 뒤)
        parts += sec + ([body] if body else [])
        used = used or u
        if sum(j is not None for j in jobs) > 1:
            guard_log().extend(logs)
    text = "\n\n".join(parts + tails)
    reply = Reply(text, [t.shoe for t in tallies], links_off=avoid, fallback_used=used, branch="experience")
    reply.ranked = order[:10] if multi else []
    reply.tally = [{"shoe_id": t.shoe["id"], "n": t.n, "k": t.k, "pos": t.pos, "neg": t.neg, "labeled": t.labeled,
                    # 관점 없는 질문의 쪽(8차) — 어떤 리뷰가 아쉽다는 쪽인지 평가 · 보고에서 본다
                    "sides": {str(k): v for k, v in t.sides.items()} if t.sides else None} for t in tallies]
    reply.want = want
    reply.generated = [body for body, _, _ in outs if body]
    return reply


# 0건일 때 스펙 한 줄(운영 뒤, 사용자 승인 2026-11-13) — 스펙으로 답할 수 있는 관점만. LLM 을 부르지 않는다.
# 0건 고정 문장("이 신발 리뷰 N건 가운데 그 부분을 말한 리뷰는 없었어요.") 바로 뒤에 붙으므로 "리뷰에는 없지만"을 되풀이하지 않고
# "등록된 스펙으로는"으로 리뷰와 가른다(Claude 가 정함). 숫자 · 위치 말은 스펙 갈래 · 비교하기와 같은 출처(facts · GET /api/compare)
SPEC_ASPECTS = ("쿠션", "무게", "발볼", "안정감")
SPEC_HEAD = "등록된 스펙으로는 "


def spec_words(shoe: dict) -> dict:
    """비교하기와 같은 위치 말(무게 · 쿠션 높이의 "높은 편" · "중간" …) — 한 켤레로 /api/compare. 실패하면 말 없이"""
    try:
        rows = http.get_json("/api/compare", {"ids": str(shoe["id"])}).get("shoes", [])
        r = next((x for x in rows if x.get("id") == shoe["id"]), {})
        return {k: (r.get(k) or {}).get("word") for k in ("weight", "stackHeight")}
    except Exception as e:   # noqa: BLE001
        print(f"[experience] 위치 말 읽기 실패: {e!r}")
        return {}


def spec_line(shoe: dict, aspect: str, words: dict | None = None) -> str | None:
    """쿠션 → 쿠션 높이 + 위치 말 · 무게 → 무게(기준 사이즈) + 270mm 환산 + 위치 말 · 발볼 → 발볼 칸 + 넓은 폭 버전 ·
    안정감 → 안정성 칸. 값이 비어 있으면 None(붙이지 않는다)"""
    if aspect == "쿠션":
        v = shoe.get("stackHeight")
        if v is None:
            return None
        w = (words if words is not None else spec_words(shoe)).get("stackHeight")
        return f"{SPEC_HEAD}쿠션 높이가 {num(v)}mm" + (f"로 {w}이에요." if w else "예요.")
    if aspect == "무게":
        p = weight_phrase(shoe)
        if p is None:
            return None
        c = weight_converted(shoe)
        w = (words if words is not None else spec_words(shoe)).get("weight")
        body = p + (f", 270mm로 환산하면 약 {c}g" if c is not None else "")
        return f"{SPEC_HEAD}무게가 {body}" + (f"으로 {w}이에요." if w else "이에요.")
    if aspect == "발볼":
        width = WIDTH_PLAIN.get(shoe.get("width"))
        wide = shoe.get("wideAvailable")
        wide_s = (f"넓은 폭(2E·4E) 버전은 {WIDE_SCOPE.get(shoe.get('wideScope'), '있어요')}" if wide is True
                  else "넓은 폭(2E·4E) 버전은 따로 없어요" if wide is False else None)
        if width and wide_s:
            return f"{SPEC_HEAD}발볼이 {euro(width)} 나와 있고, {wide_s}."
        if width:
            return f"{SPEC_HEAD}발볼이 {euro(width)} 나와 있어요."
        return f"발볼은 등록된 스펙에 없지만, {wide_s}." if wide_s else None   # "스펙으로는 … 버전은"처럼 "는"이 겹치지 않게
    if aspect == "안정감":
        v = shoe.get("stability")
        if not v:
            return None
        # "중립화(교정 장치 없이 …)" — 조사는 괄호 앞 낱말로 고른다
        return f"{SPEC_HEAD}{STABILITY_PLAIN.get(v, v)}{'으로' if jong(v) and jong(v) != 8 else '로'} 나와 있어요."
    return None


AVOID_HEAD = "말씀하신 이야기가 나온 리뷰를 찾아봤어요. 아래 신발은 등록된 리뷰에 그런 이야기가 있었어요."
NO_MATCH = "말씀하신 이야기가 나온 리뷰를 등록된 리뷰에서 찾지 못했어요. 신발 이름을 알려주시면 그 신발 리뷰를 살펴볼게요."


# 앞에 나간 것 — 글은 보여 주지 않고 무엇이 나갔는지만(3차 수정 5 — 통째로 보여 주니 "이야기가 총 3건 …"처럼 다시 썼다)
BEFORE_NOTE = ("[이미 앞에 나간 것] 이 신발의 이름 · 리뷰 수 · 질문한 이야기의 집계 문장과 인용 리뷰 한 건은 코드가 바로 앞에 썼다. "
               "그 집계 문장을 다시 쓰지 않는다. 인용한 리뷰는 [리뷰]에서 뺐다 — 그 리뷰 이야기도 다시 쓰지 않는다. "
               "네 글은 그 바로 아래에 붙으니 신발 이름으로 시작하지 않아도 된다.")
# 근거 묶음의 머리 — 쪽(좋다 · 아쉽다)만, 건수 없이(5차 수정 1-1 — 4차에 준 쪽 건수 · 이야기별 건수를 엉뚱한 말에 붙였다)
SIDE_NAME = {"positive": "좋다는 쪽", "negative": "아쉽다는 쪽", "mentioned": "그 이야기가 나온"}


DIVERSE_SKIP = ("착용감",)   # "편하다 · 불편하다"는 아무 리뷰에나 걸려 이야기를 가르지 못한다(7차 측정 — 30건 중 5~12건)


def diverse(candidates: list[dict], n: int) -> list[dict]:
    """쪽 칸을 이야기가 다른 리뷰부터 채운다(9차 수정, 사용자 승인 — 추천 순으로만 채우니 노바블라스트 6 은 쿠션 이야기만 넷).
    이야기 = 관점 사전(ASPECTS) 낱말이 걸리는 관점들(착용감 빼고). 후보 순서(추천 많은 순)대로 보면서
    ① 이미 넣은 리뷰의 이야기와 하나도 겹치지 않는 리뷰를 먼저 넣고(이야기가 둘 이상 걸린 리뷰는 그 모두가 새것이어야 한다),
    ② 남은 자리는 후보 순서대로 채운다 — 이야기가 겹치는 리뷰 · 어느 관점에도 안 걸리는 리뷰는 여기서만 들어간다.
    넣은 리뷰는 후보 순서로 돌려준다"""
    covered: set[str] = set()
    first: list[dict] = []
    for r in candidates:
        if len(first) == n:
            break
        topics = {a for a, _ in ASPECTS if a not in DIVERSE_SKIP and mentions_by_words(a, r["content"])}
        if topics and not topics & covered:
            first.append(r)
            covered |= topics
    picked = {r["id"] for r in first}
    rest = [r for r in candidates if r["id"] not in picked][:n - len(first)]
    picked |= {r["id"] for r in rest}
    return [r for r in candidates if r["id"] in picked]


def evidence(t: Tally, pool: list[dict], shown_ids: set[int], aspect: str | None, focus: tuple[str, ...],
             sides: dict[int, str] | None = None) -> list[str]:
    """LLM 근거 — 리뷰 원문 줄만. 숫자(건수 · 별점 · 추천 수)를 붙이지 않는다(5차 수정 1-1).
    관점이 있으면 쪽마다 묶는다("[무릎 — 좋다는 쪽 리뷰]") — 쪽은 분류가 정한 것이라 LLM 이 다시 가르지 않게(Claude 가 정함).
    인용한 리뷰는 shown_ids 에서 이미 빠졌다(자리 표시도 하지 않는다 — 4차의 자리 표시는 LLM 이 건수를 세지 않게 하려던 것)"""
    lines: list[str] = []
    if aspect:
        for side in ("positive", "negative", "mentioned"):
            members = [r for r in pool if t.labels.get(r["id"]) == side and r["id"] in shown_ids]
            if focus:
                members = [r for r in members if any(w in r["content"] for w in focus)]
            if members:
                lines.append(f"[{aspect} — {SIDE_NAME[side]} 리뷰]")
                lines += [f"- {r['content']}" for r in members]
    else:
        # 관점이 없으면 좋다는 쪽 · 아쉽다는 쪽으로 묶는다(8차 수정) — 쪽마다 추천 많은 순 SIDE_GOOD · SIDE_BAD 건, 건수 없이.
        # 쪽 가르기가 실패했으면(sides None) 추천 많은 리뷰를 한 묶음으로
        reviews = [r for r in pool if r["id"] in shown_ids]
        if sides is None:
            groups = [("[리뷰]", reviews[:SIDE_GOOD + SIDE_BAD])]
        else:
            groups = [("[좋다는 쪽 리뷰]", diverse([r for r in reviews if sides.get(r["id"]) == "positive"], SIDE_GOOD)),
                      # 아쉬움이 중심인 리뷰 먼저, 그다음 좋은 말이 섞인 리뷰 — 각각 추천 많은 순(SIDES_SYSTEM 주석)
                      ("[아쉽다는 쪽 리뷰]", diverse([r for r in reviews if sides.get(r["id"]) == "negative"]
                                                + [r for r in reviews if sides.get(r["id"]) == "mixed"], SIDE_BAD))]
        for head, members in groups:
            if members:
                lines.append(head)
                lines += [f"- {r['content']}" for r in members]
    return lines


def tidy(body: str) -> str:
    """LLM 글 다듬기 — 양 짐작 문장 · 발매가 문장 · 묻는 문장을 지우고 해요체로(모두 문장 통째로)"""
    # 양을 짐작하는 말이 든 문장은 지운다 — 답 전체를 코드 답으로 바꾸면 짧고 딱딱해진다(5-1 B03)
    body = drop_vague(body)
    # 이 갈래는 가격을 다루지 않는다 — 말투 예시의 발매가 문장을 옮겨 붙였다(1차 수정 평가 E01 · E06 · E11).
    # 5차부터 숫자 문장은 앞에서 지워지지만 "가격은 발매가 기준이라 …"에는 숫자가 없다 — 남긴다
    body = _drop_sentences(body, lambda s: "발매가 기준" in s, "발매가 문장 지움")
    # 묻는 말은 코드가 끝에 붙인다 — 남은 묻는 문장은 지운다(뒤에 붙는 것을 알려 준 뒤에도 남는지 guard 로그로 센다)
    body = drop_asks(body)
    return haeyo(body)


def _drop_sentences(body: str, bad, log: str) -> str:
    paras = []
    for para in body.split("\n\n"):
        sents = [s for s in re.split(r"(?<=[.!?])\s+", para.strip()) if s]
        kept = [s for s in sents if not bad(s)]
        if len(kept) < len(sents):
            guard_log().append(log)
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
    return _labels_from(data, len(contents)), asks


def classify_sides_llm(contents: list[str]) -> list[str]:
    """관점 없는 질문 — 리뷰마다 positive · negative · none(SIDES_SYSTEM, temperature 0). 8차 수정"""
    user = "리뷰\n" + "\n".join(f"[{i + 1}] {c}" for i, c in enumerate(contents))
    return _labels_from(llm.chat_json(SIDES_SYSTEM, user, num_predict=80 + 14 * len(contents)), len(contents),
                        ("positive", "mixed", "negative", "none"))


def _labels_from(data: dict, n: int, allowed: tuple[str, ...] = ("positive", "negative", "none")) -> list[str]:
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
    missing = [i for i in range(1, n + 1) if by_num.get(i) not in allowed]
    if missing:
        raise ValueError(f"분류가 빠진 리뷰 {len(missing)}건")
    return [by_num[i] for i in range(1, n + 1)]


def split_sides(reviews: list[dict], classify_sides) -> dict[int, str] | None:
    """관점 없는 질문 — 리뷰 id → positive · mixed · negative(none 은 뺀다). 번호를 빠뜨리면 한 번 더 묻고, 그래도 안 되면 None"""
    if not reviews:
        return {}
    for attempt in (1, 2):
        try:
            labels = classify_sides([r["content"] for r in reviews])
            if len(labels) == len(reviews):
                return {r["id"]: v for r, v in zip(reviews, labels) if v in ("positive", "mixed", "negative")}
        except Exception as e:   # noqa: BLE001
            print(f"[experience] 쪽 가르기 실패({attempt}): {e!r}")
        if attempt == 1:
            guard_log().append("쪽 가르기 다시 묻기")
    guard_log().append("쪽 가르기 실패 — 추천 많은 리뷰만")
    return None


