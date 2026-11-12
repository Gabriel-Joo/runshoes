"""생성 갈래(스펙 · 비교 · 추천)가 함께 쓰는 길 — 사실 문장을 주고 말투만 다듬게 한 뒤 검사한다"""

from __future__ import annotations

from .. import llm, prompt
from ..reply import guard


def generate(question: str, fact_lines: list[str], conclusions: list[str], fallback: str, health: bool,
             history: list[dict], task: str) -> tuple[str, bool]:
    """(글, fallback 을 썼는지). LLM 이 실패해도 코드 답을 낸다"""
    parts = [f"질문: {question}", "", "[등록된 정보]", *fact_lines]
    if conclusions:
        parts += ["", "[결론 문장] — 뜻과 숫자를 바꾸지 말고 넣는다", *conclusions]
    parts += ["", f"[할 일] {task}", "", "[참고 답] 아래는 코드가 쓴 답이다. 내용과 숫자는 그대로 두고 말투만 예시처럼 자연스럽게 다듬어도 된다.", fallback]
    user = "\n".join(parts)
    msgs = [{"role": h["role"], "content": h["content"]} for h in history[-4:]]
    msgs.append({"role": "user", "content": user})
    try:
        out = llm.chat(prompt.system(health), msgs)
    except Exception as e:   # noqa: BLE001
        print(f"[generate] LLM 실패: {e}")
        return fallback, True
    allowed = "\n".join(fact_lines + conclusions + [fallback, question])
    return guard(out, allowed, fallback)
