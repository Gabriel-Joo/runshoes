"""API 값 → 색인 문서(작업 5-2, docs/09_chatbot_rag.md 11절 · 16절).

문서 둘
- 리뷰 1건 = 문서 1(`rev:<리뷰 id>`). 짧은 리뷰도 넣는다
- 설명문 문장 1개 = 문서 1(`desc:<신발 id>:<순번>`, 순번은 0부터). 「`. `」 또는 「`다.`」 뒤에서 나눈다 —
  마침표만으로 나누면 숫자 안 마침표(40.5mm)에서 깨진다

머리말(`[브랜드 모델 N세대 · 용도]`)은 임베딩 글에만 붙이고, BM25 는 본문만 본다(사용자 2026-11-12).
해시는 임베딩 글(머리말 + 본문)로 — 신발 이름 · 용도가 바뀌어도 다시 임베딩한다.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

# 「다.」 또는 「. 」 뒤 — 숫자 안 마침표(40.5)는 뒤에 공백이 없어 나뉘지 않는다
_SENT_END = re.compile(r"(?<=다\.)\s*|(?<=\.)\s+")


@dataclass
class Doc:
    doc_id: str                  # rev:123 · desc:24:3
    kind: str                    # review | desc
    shoe_id: int
    text: str                    # 본문 — BM25 · 답의 근거
    embed_text: str              # 머리말 + 본문 — 임베딩
    meta: dict = field(default_factory=dict)
    vec: object = None           # numpy float32 (1024,) — Embedder 가 단다. 색인에 넣을 때만

    @property
    def hash(self) -> str:
        return hashlib.sha1(self.embed_text.encode("utf-8")).hexdigest()


def split_sentences(desc: str) -> list[str]:
    return [s.strip() for s in _SENT_END.split(desc or "") if s and s.strip()]


def header(shoe: dict) -> str:
    """[아식스 노바블라스트 6 · 조깅·회복주] — 모델명이 세대 숫자로 끝나면 「N세대」를 덧붙이지 않는다(같은 숫자를 두 번 쓰지 않게)"""
    name = f"{shoe['brand']} {shoe['model']}"
    g = shoe.get("generation")
    if g is not None and not re.search(rf"(?<!\d)v?{g}\s*$", shoe["model"].strip(), re.IGNORECASE):
        name += f" {g}세대"
    purpose = shoe.get("purpose")
    return f"[{name} · {purpose}]" if purpose else f"[{name}]"


def shoe_meta(shoe: dict) -> dict:
    return {
        "shoe_id": shoe["id"], "brand": shoe.get("brand"), "model": shoe.get("model"), "generation": shoe.get("generation"),
        "is_current": shoe.get("isCurrent"), "purpose": shoe.get("purpose"), "stability": shoe.get("stability"),
    }


def build(shoes: list[dict], reviews: list[dict], min_sentence: int = 0) -> list[Doc]:
    """리뷰 + 설명문 문장. 신발 목록에 없는 신발의 리뷰는 넣지 않는다(공개 API 가 숨긴 신발).
    min_sentence — 이보다 짧은 설명문 문장은 넣지 않는다(0 = 모두)"""
    by_id = {s["id"]: s for s in shoes}
    docs: list[Doc] = []
    for s in shoes:
        head = header(s)
        for i, sent in enumerate(split_sentences(s.get("description") or "")):
            if len(sent) < min_sentence:
                continue
            docs.append(Doc(f"desc:{s['id']}:{i}", "desc", s["id"], sent, f"{head} {sent}", {**shoe_meta(s), "kind": "desc", "sentence": i}))
    for r in reviews:
        s = by_id.get(r.get("shoeId"))
        if s is None or not (r.get("content") or "").strip():
            continue
        body = r["content"].strip()
        docs.append(Doc(f"rev:{r['id']}", "review", s["id"], body, f"{header(s)} {body}", {
            **shoe_meta(s), "kind": "review", "rating": r.get("rating"), "like_count": r.get("likeCount") or 0,
            "created_at": r.get("createdAt"),
        }))
    return docs
