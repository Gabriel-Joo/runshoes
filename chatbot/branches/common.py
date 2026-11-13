"""생성 갈래(스펙 · 비교 · 추천 · 특성 설명 · 경험·후기)가 함께 쓰는 길 — 사실 문장을 주고 말투만 다듬게 한 뒤 검사한다"""

from __future__ import annotations

from .. import llm, prompt
from ..reply import guard


CONCLUSION_HEAD = "[결론 문장] — 뜻과 숫자를 바꾸지 말고 넣는다"
REFERENCE_HEAD = "[참고 답] 아래는 코드가 쓴 답이다. 내용과 숫자는 그대로 두고 말투만 예시처럼 자연스럽게 다듬어도 된다."
# 코드가 네 답 앞뒤에 붙이는 글 — 그 턴에 실제로 붙는 것만 보여 준다(5-2 2차 수정, 사용자 2026-11-13).
# LLM 이 무엇이 붙을지 모르고 끝내서 "다만" 두 번 · 묻는 말 둘 · 0건 문장 겹침이 났다. 금지 문구를 더하는 대신 알려 준다
BEFORE_HEAD = "[이미 쓴 앞부분] 코드가 이미 썼고 네 글 앞에 그대로 붙는다. 너는 그다음 문단만 쓴다 — 이 부분을 다시 쓰거나 요약하지 않는다."
AFTER_HEAD = "[네 답 뒤에 그대로 붙는 문장] 코드가 붙인다. 겹치지 않게 끝낸다."


def after_lines(health: bool, tails: list[str] = ()) -> list[str]:
    """답 뒤에 붙을 문장 — 의료 안내(통증)는 코드 끝 단락 앞(reply.with_doctor 와 같은 자리)"""
    return ([prompt.DOCTOR] if health else []) + [t for t in tails if t]


def generate(question: str, fact_lines: list[str], conclusions: list[str], fallback: str, health: bool,
             history: list[dict], task: str, reference: bool = True, shoes_given: bool = True,
             before: list[str] = (), tails: list[str] = ()) -> tuple[str, bool]:
    """(글, fallback 을 썼는지). LLM 이 실패해도 코드 답을 낸다.
    reference — 코드 답을 참고로 보여 줄지. 특성 설명은 사전 원문(합니다체)이라 보여 주면 그대로 옮겨 쓴다 — 끈다.
    before — 코드가 이 글 앞에 붙이는 글(경험·후기의 집계 · 인용). tails — 코드가 뒤에 붙이는 끝 단락(의료 안내는 health 로 더한다)"""
    parts = [f"질문: {question}", "", "[등록된 정보]", *fact_lines]
    if conclusions:
        parts += ["", CONCLUSION_HEAD, *conclusions]
    if before:
        parts += ["", BEFORE_HEAD, *before]
    parts += ["", f"[할 일] {task}"]
    after = after_lines(health, list(tails))
    if after:
        parts += ["", AFTER_HEAD, *after]
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
    allowed = "\n".join(fact_lines + conclusions + list(before) + [fallback, question])
    return guard(out, allowed, fallback, shoes_given)
