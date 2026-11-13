"""스펙 — 운영 API 의 신발 값(GET /api/shoes)으로. 숫자는 facts 가 넣는다"""

from __future__ import annotations

from .. import facts
from ..reply import Reply
from .common import generate

TASK = (
    "물은 것만 3~5문장으로 짧게 답한다. 세대 줄이 있으면 \"N세대 기준이에요\"를 한 번 밝힌다. "
    "보러 가기를 권할 때는 \"보러 가실래요?\"로 끝낸다."
)


def answer(question: str, shoes: list[tuple[dict, bool]], health: bool, history: list[dict]) -> Reply:
    """shoes — (신발, 세대 밝힘) 1~3켤레"""
    lines: list[str] = []
    fb: list[str] = []
    for shoe, note in shoes[:3]:
        lines += facts.shoe_facts(shoe, note) + [""]
        fb.append(facts.spec_fallback(shoe, note, question))
    fallback = "\n\n".join(fb)
    text, used = generate(question, lines, [], fallback, health, history, TASK, branch="spec")
    return Reply(text, [s for s, _ in shoes[:3]], fallback_used=used, branch="spec")
