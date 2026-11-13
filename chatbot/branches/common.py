"""생성 갈래(스펙 · 비교 · 추천 · 특성 설명 · 경험·후기)가 함께 쓰는 길 — 사실 문장을 주고 말투만 다듬게 한 뒤 검사한다"""

from __future__ import annotations

import re

from .. import llm, prompt
from ..reply import drop_digit_sentences, drop_repeats, guard, guard_log


CONCLUSION_HEAD = "[결론 문장] — 뜻과 숫자를 바꾸지 말고 넣는다"
REFERENCE_HEAD = "[참고 답] 아래는 코드가 쓴 답이다. 내용과 숫자는 그대로 두고 말투만 예시처럼 자연스럽게 다듬어도 된다."
# 코드가 네 답 앞뒤에 붙이는 것 — 그 턴에 실제로 붙는 것을 "무엇인지"만 알린다(5-2 3차 수정, 사용자 2026-11-13).
# 2차 때는 붙는 문장을 통째로 보여 줬더니 LLM 이 그대로 따라 썼다(용도 묻기 두 번 B05 · B09, 집계 다시 말하기 E03 · E08).
NOTE_HEAD = "[참고 — 답에 옮기지 않는다]"
AFTER_TAIL = "너는 이것들을 쓰지 않고, 묻지 않는다."
# 지시 · 근거 머리가 답에 새면 지운다(3차 수정 평가 B09 — "코드가 붙는다"가 답 한 줄로 나갔다)
_LEAK = re.compile(r"코드가|\[(참고|이미|등록된|리뷰|설명문|할 일|결론|네 답)")
# 붙는 문장 → 무엇인지(문장은 보여 주지 않는다)
TAIL_KIND = {
    prompt.DOCTOR: "통증이 이어지면 의료기관에 가 보라는 안내",
    prompt.EXPLAIN_TAIL: "어떤 달리기에 신을지 묻는 문장",
    prompt.ASK_PURPOSE_CALM: "어떤 달리기에 신을지 묻는 문장",
    prompt.ASK_PURPOSE: "어떤 달리기에 신을지 묻는 문장",
    "보러 가실래요?": "신발을 보러 가겠냐고 묻는 문장",
}


def attached(health: bool, tails: list[str] = ()) -> tuple[list[str], list[str]]:
    """(답 앞에 붙는 문장, 뒤에 붙는 문장) — 의료 안내(통증)는 맨 앞(reply.with_doctor, 4차 수정)"""
    return ([prompt.DOCTOR] if health else []), [t for t in tails if t]


def attached_note(front: list[str], after: list[str]) -> str:
    parts = []
    if front:
        parts.append("네 답 앞에 따로 붙는 것: " + " · ".join(dict.fromkeys(TAIL_KIND.get(t, "안내 문장") for t in front)) + ".")
    if after:
        parts.append("네 답이 끝난 뒤에 따로 붙는 것: " + " · ".join(dict.fromkeys(TAIL_KIND.get(t, "안내 문장") for t in after)) + ".")
    return f"{NOTE_HEAD} {' '.join(parts)} {AFTER_TAIL}"


def _drop_leaks(text: str) -> str:
    paras = []
    for para in text.split("\n\n"):
        sents = [s for s in re.split(r"(?<=[.!?])\s+|\n", para.strip()) if s]
        kept = [s for s in sents if not _LEAK.search(s)]
        if len(kept) < len(sents):
            guard_log().append("지시 문구 샘 지움")
        if kept:
            paras.append(" ".join(kept))
    return "\n\n".join(paras)


def generate(question: str, fact_lines: list[str], conclusions: list[str], fallback: str, health: bool,
             history: list[dict], task: str, reference: bool = True, shoes_given: bool = True,
             before: list[str] = (), before_note: str = "", tails: list[str] = (),
             no_digits: list[str] | None = None) -> tuple[str, bool]:
    """(글, fallback 을 썼는지). LLM 이 실패해도 코드 답을 낸다.
    reference — 코드 답을 참고로 보여 줄지. 특성 설명은 사전 원문(합니다체)이라 보여 주면 그대로 옮겨 쓴다 — 끈다.
    before — 코드가 이 글 앞에 붙이는 글(경험·후기의 집계 · 인용). 보여 주지 않고 before_note 로 무엇이 나갔는지만 알린다.
    숫자 검사 · 되풀이 지우기에는 쓴다. tails — 코드가 뒤에 붙이는 끝 단락(의료 안내는 health 로 더한다).
    no_digits — 숫자를 쓰면 안 되는 글(경험·후기, 5차 수정)이면 신발 이름 꼴 목록. 숫자가 든 문장을 검사 전에 지운다 —
    검사(guard)는 사실에 없는 숫자면 글 전체를 코드 답으로 바꾸므로, 그 전에 문장만 덜어 낸다"""
    parts = [f"질문: {question}", "", "[등록된 정보]", *fact_lines]
    if conclusions:
        parts += ["", CONCLUSION_HEAD, *conclusions]
    if before_note:
        parts += ["", before_note]
    parts += ["", f"[할 일] {task}"]
    front, after = attached(health, list(tails))
    if front or after:
        parts += ["", attached_note(front, after)]
    if reference:
        parts += ["", REFERENCE_HEAD, fallback]
    user = "\n".join(parts)
    msgs = [{"role": h["role"], "content": h["content"]} for h in history[-4:]]
    msgs.append({"role": "user", "content": user})
    try:
        out = llm.chat(prompt.system(health), msgs)
    except Exception as e:   # noqa: BLE001
        print(f"[generate] LLM 실패: {e}")
        guard_log().append(f"코드 답: LLM 실패 {type(e).__name__}")
        return fallback, True
    if no_digits is not None and out.strip():
        out = drop_digit_sentences(out, no_digits)
        if not out:
            guard_log().append("코드 답: 숫자 문장만")
            return fallback, True
    allowed = "\n".join(fact_lines + conclusions + list(before) + [fallback, question])
    text, used = guard(out, allowed, fallback, shoes_given)
    if not used:
        # 코드가 앞뒤에 붙이는 문장과 같은 문장은 지운다(문장 통째로) — 알리기만 해도 가끔 따라 쓴다
        text = drop_repeats(text, list(before) + front + after)
        text = _drop_leaks(text)
        if not text:
            return fallback, True
    return text, used
