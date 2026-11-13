"""비교 — GET /api/compare?ids= 를 그대로 쓴다(파이썬에 다시 구현하지 않는다, 09 3절). 결론 문장은 코드가 쓴다(8g 규칙)"""

from __future__ import annotations

import re

from .. import facts, http
from ..reply import Reply
from .common import generate

TASK = (
    "신발마다 무게 · 쿠션 높이 · 앞뒤 높이 차이 · 발매가와 [등록된 정보]의 위치 말(가벼운 편 · 중간 · 높은 편 등)을 그대로 쓰고, "
    "[결론 문장]을 넣는다. 무게만 물었으면 무게만 답한다. 어느 신발이 더 좋다고 단정하지 않는다. "
    "마지막은 \"보러 가실래요?\"로 끝낸다."
)
VERDICT_TASK = "답의 첫 줄은 [결론 문장]의 첫 문장 그대로다."


# "뭐가 더 좋아요"처럼 우열을 물으면 첫 줄에 한 줄(사용자 2회차 승인) — 단정하지 않고 차이로 넘어간다
VERDICT_ASKED = re.compile(r"좋|낫|나아|나을|최고|베스트")
VERDICT_LINE = "어느 쪽이 더 좋다기보다는 쓰임에 따라 갈려요. 차이를 정리해 드릴게요."


def answer(question: str, shoes: list[dict], health: bool, history: list[dict]) -> Reply:
    shoes = shoes[:5]
    api = http.get_json("/api/compare", {"ids": ",".join(str(s["id"]) for s in shoes)})
    lines, conclusions, fallback = facts.compare_facts(shoes, api)
    if VERDICT_ASKED.search(question):
        first, _, rest = fallback.partition("\n\n")
        fallback = VERDICT_LINE + "\n\n" + rest
        conclusions = [VERDICT_LINE] + conclusions
    task = TASK + (" " + VERDICT_TASK if VERDICT_ASKED.search(question) else "")
    text, used = generate(question, lines, conclusions, fallback, health, history, task, branch="compare")
    return Reply(text, shoes, fallback_used=used, branch="compare")
