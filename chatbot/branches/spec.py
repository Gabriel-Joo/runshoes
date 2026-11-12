"""스펙 — 운영 API 의 신발 값(GET /api/shoes)으로. 숫자는 facts 가 넣는다"""

from __future__ import annotations

from .. import facts
from ..reply import Reply
from .common import generate

TASK = (
    "질문에 답한다. 물은 것만 3~5문장으로 짧게. 물은 값이 '정보 없음'이면 "
    "\"그 부분은 등록된 정보에 없어서 확인이 어려워요.\"라고 말한다. 세대 줄이 있으면 \"N세대 기준이에요\"를 한 번 밝힌다. "
    "통증 이야기가 있으면 설명의 신발 특성만 근거로 쓴다."
)


def answer(question: str, shoes: list[tuple[dict, bool]], health: bool, history: list[dict]) -> Reply:
    """shoes — (신발, 세대 밝힘) 1~3켤레"""
    lines: list[str] = []
    fb: list[str] = []
    for shoe, note in shoes[:3]:
        lines += facts.shoe_facts(shoe, note) + [""]
        fb.append(facts.spec_fallback(shoe, note, question))
    fallback = "\n\n".join(fb)
    text, used = generate(question, lines, [], fallback, health, history, TASK)
    return Reply(text, [s for s, _ in shoes[:3]], fallback_used=used, branch="spec")
