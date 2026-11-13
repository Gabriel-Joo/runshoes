"""SearchIndex 인터페이스와 순위 규칙(작업 5-2, docs/09_chatbot_rag.md 1절 · 6절 · 16절).

챗봇 코드는 이 인터페이스만 부른다 — 지금 구현은 MemoryIndex(memory.py). 1절의 전환 기준을 넘으면 벡터 DB 로 바꾼다.
임베딩(Embedder, embed.py)은 색인 밖이다 — upsert 하는 문서는 벡터를 달고 온다.

순위
- 섞기: RRF(k=60) — 임베딩 순위와 BM25 순위
- 리뷰 추천수: 점수 = 유사도 × 0.8 + log(1+추천수)/log(1+그때의 최댓값) × 0.2 (최댓값을 박지 않는다).
  유사도는 RRF 점수를 그 검색의 1등 RRF 점수로 나눈 값(0~1) — RRF 는 크기가 1/(60+순위)라 그대로 섞으면 추천수가 다 이긴다
- 신발 순위: 신발마다 상위 문서 점수(가장 높은 것)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Protocol

RRF_K = 60
SIM_WEIGHT, LIKE_WEIGHT = 0.8, 0.2


@dataclass
class Hit:
    doc_id: str
    kind: str
    shoe_id: int
    text: str
    meta: dict
    score: float                 # RRF(섞은 뒤)
    cosine: float | None = None  # 임베딩 유사도(질의 벡터와) — 문턱에 쓴다
    bm25_rank: int | None = None
    vec_rank: int | None = None
    final: float = 0.0           # 추천수 리랭킹 뒤(리뷰만 — 그 밖은 score 와 같은 자리)


class SearchIndex(Protocol):
    def upsert(self, docs: list) -> None: ...                    # corpus.Doc(vec 달림)
    def delete(self, doc_ids: list[str]) -> None: ...
    def search(self, query_vec, query_text: str, k: int, filter: dict | None = None) -> list[Hit]: ...
    def ids_with_hash(self) -> dict[str, str]: ...


def rrf(rank_lists: list[list[int]], k: int = RRF_K) -> dict[int, float]:
    out: dict[int, float] = {}
    for ranks in rank_lists:
        for r, i in enumerate(ranks):
            out[i] = out.get(i, 0.0) + 1.0 / (k + r + 1)
    return out


def like_rerank(hits: list[Hit], sim_w: float = SIM_WEIGHT, like_w: float = LIKE_WEIGHT) -> list[Hit]:
    """리뷰의 추천수를 섞는다. 최댓값은 이 후보들 가운데 — 44 를 박지 않는다(사용자 2026-11-12)"""
    if not hits:
        return hits
    top = max(h.score for h in hits) or 1.0
    likes = [int(h.meta.get("like_count") or 0) for h in hits if h.kind == "review"]
    mx = max(likes) if likes else 0
    for h in hits:
        sim = h.score / top
        if h.kind == "review" and mx > 0:
            h.final = sim * sim_w + math.log1p(int(h.meta.get("like_count") or 0)) / math.log1p(mx) * like_w
        else:
            h.final = sim * sim_w   # 추천수가 없는 문서(설명문 · 추천 0뿐인 후보)는 그 몫이 0
    return sorted(hits, key=lambda h: -h.final)


def rank_shoes(hits: list[Hit]) -> list[tuple[int, float]]:
    """신발 순위 — 신발마다 상위 문서 점수(final, 없으면 score)"""
    best: dict[int, float] = {}
    for h in hits:
        v = h.final or h.score
        if v > best.get(h.shoe_id, -1):
            best[h.shoe_id] = v
    return sorted(best.items(), key=lambda kv: -kv[1])


@dataclass
class Filter:
    """search 의 filter — 딕셔너리로도 받는다: {"kind": "review", "shoe_id": [24, 25]}"""
    kind: str | None = None
    shoe_ids: set[int] = field(default_factory=set)

    @classmethod
    def of(cls, f: dict | None) -> "Filter":
        f = f or {}
        sid = f.get("shoe_id")
        ids = set(sid) if isinstance(sid, (list, tuple, set)) else ({sid} if sid is not None else set())
        return cls(f.get("kind"), ids)

    def ok(self, kind: str, shoe_id: int) -> bool:
        return (self.kind is None or kind == self.kind) and (not self.shoe_ids or shoe_id in self.shoe_ids)
