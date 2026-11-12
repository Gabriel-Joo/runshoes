"""생성 갈래(스펙 · 비교 · 추천)가 함께 쓰는 길 — 사실 문장을 주고 말투만 다듬게 한 뒤 검사한다"""

from __future__ import annotations

from .. import llm, prompt
from ..reply import guard


CONCLUSION_HEAD = "[결론 문장] — 뜻과 숫자를 바꾸지 말고 넣는다"
REFERENCE_HEAD = "[참고 답] 아래는 코드가 쓴 답이다. 내용과 숫자는 그대로 두고 말투만 예시처럼 자연스럽게 다듬어도 된다."


def generate(question: str, fact_lines: list[str], conclusions: list[str], fallback: str, health: bool,
             history: list[dict], task: str, reference: bool = True, shoes_given: bool = True) -> tuple[str, bool]:
    """(글, fallback 을 썼는지). LLM 이 실패해도 코드 답을 낸다.
    reference — 코드 답을 참고로 보여 줄지. 특성 설명은 사전 원문(합니다체)이라 보여 주면 그대로 옮겨 쓴다 — 끈다"""
    parts = [f"질문: {question}", "", "[등록된 정보]", *fact_lines]
    if conclusions:
        parts += ["", CONCLUSION_HEAD, *conclusions]
    parts += ["", f"[할 일] {task}"]
    if reference:
        parts += ["", REFERENCE_HEAD, fallback]
    user = "\n".join(parts)
    msgs = [{"role": h["role"], "content": h["content"]} for h in history[-4:]]
    msgs.append({"role": "user", "content": user})
    try:
        out = llm.chat(prompt.system(health), msgs)
    except Exception as e:   # noqa: BLE001
        print(f"[generate] LLM 실패: {e}")
        from ..reply import guard_log
        guard_log().append(f"코드 답: LLM 실패 {type(e).__name__}")
        return fallback, True
    allowed = "\n".join(fact_lines + conclusions + [fallback, question])
    return guard(out, allowed, fallback, shoes_given)
