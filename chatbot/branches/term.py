"""용어 — 사전 그대로. 생성하지 않는다(09 8절). 사전에 없는 말은 거절하고 기록한다(5-1 은 설명문 검색이 없다)"""

from __future__ import annotations

from ..facts import josa
from ..prompt import NO_TERM
from ..reply import Reply
from ..terms import Dictionary


def answer(dic: Dictionary, found: list[dict], asked: str | None) -> tuple[Reply, str | None]:
    """(답, 기록할 사전에 없는 용어)"""
    if found:
        return Reply("\n\n".join(Dictionary.render(e) for e in found[:3]), branch="term"), None
    word = (asked or "").strip()
    near = dic.near(word)
    text = NO_TERM.format(near=josa(near["name"], "은", "는"))
    return Reply(text, branch="term"), word or None
