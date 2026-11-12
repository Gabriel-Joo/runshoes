"""특성 설명 — 신발의 특성 · 원리를 묻는 일반 질문(작업 5-1, 2026-11-12 사용자).

"쿠션 좋은 신발 신으면 나을까요", "카본화는 입문자에게 안 좋죠?", "비싼 게 좋은 거 아닌가요"처럼
특정 신발의 값도, 신발을 골라 달라는 것도 아닌 질문. 근거는 용어 사전(툴팁과 같은 원문)뿐이다 — 질문에 걸리는 용어를
셋까지 골라 사실로 주고, LLM 은 쉬운 말 · 해요체로 두세 문장을 쓴다. 숫자는 사전에 있는 것만(검사 — 어긋나면 사전 원문).
사전에 걸리는 용어가 없으면 거절한다(9절 "근거 없음" + 할 수 있는 것 하나). 설명문 검색은 5-2.
"""

from __future__ import annotations

from .. import prompt
from ..facts import josa
from ..reply import Reply, haeyo, plain_words
from ..terms import Dictionary
from .common import generate

# 질문 낱말 → 근거로 줄 사전 용어. 갈래를 정하는 것이 아니라(그건 라우터) 근거를 고르는 표다
HINTS: dict[str, tuple[str, ...]] = {
    "stackHeight": ("쿠션", "푹신", "충격", "두꺼", "두터", "두께", "딱딱", "발바닥", "무릎", "다리", "체중", "오래 뛰", "스택", "디딜", "첫 발", "족저"),
    "drop": ("드롭", "앞뒤", "종아리", "아킬레스", "뒤꿈치 착지", "무릎"),
    "stabilityPair": ("안정", "평발", "무너", "발목", "흔들", "삐끗", "과내전"),
    "pronation": ("평발", "무너", "안쪽으로", "프로네이션"),
    "carbon": ("카본", "플레이트", "기록", "빠르", "속도", "반발", "비싼", "비싸", "고가", "레이스화"),
    "midsole": ("미드솔", "폼", "소재", "비싼", "비싸", "고가"),
    "width": ("발볼", "넓", "좁", "저려", "저림", "저리", "앞쪽", "사이즈", "꽉", "끼"),
    "wideAvailable": ("와이드", "2e", "4e"),
    "weight": ("무게", "가볍", "무겁"),
    "trail": ("트레일", "산길"),
    "tempo": ("템포", "인터벌"),
    "lsd": ("lsd", "장거리"),
}
# 사전 용어 → 챗봇 문장의 쉬운 말(8절)
PLAIN_NAME = {"stackHeight": "쿠션 높이", "drop": "앞뒤 높이 차이", "midsole": "쿠션 소재", "wideAvailable": "넓은 폭(2E·4E) 버전",
              "pronation": "착지할 때 발이 안쪽으로 기우는 움직임", "stabilityPair": "안정화 · 중립화"}
# 추천 조건 → 근거 용어(통증 + 추천인데 용도가 없을 때)
FROM_CONDITION = {"cushion": "stackHeight", "stability": "stabilityPair", "width": "width"}

TASK = (
    "첫 문장은 질문에 대한 답이다. 효과를 묻는 질문(나을까요 · 달라질까요 · 기록이 줄어드나요 · 도움이 될까요)에는 "
    "\"신발만으로 그렇게 된다고 말씀드리긴 어려워요\"처럼 약속하지 않는 말로 먼저 답하고, 이어서 관련된 신발 특성을 설명한다. "
    "예 · 아니오로 단정하지 않고 [등록된 정보]의 신발 특성으로 설명한다. 해요체로 서너 문장. "
    "사용자의 말이나 상태를 되받지 않는다(\"~하셨네요\", \"~하신 것 같아요\", \"~찾으시는군요\" 금지). "
    "\"~때문이에요\"로 원인을 말하지 않는다. \"보러 가실래요?\"는 쓰지 않는다(보여 줄 신발이 없다). "
    "사전 용어를 괄호로 덧붙이지 않는다. "
    "사전 용어는 쉬운 말로 바꿔 쓴다(괄호 안의 이름). 정보에 없는 특성 · 효과는 말하지 않는다. "
    "몸 상태를 판단하지 않는다 — 사용자가 말한 몸 이야기(체중 · 평발 등)를 \"~시니까\"로 다시 말하지 않는다. "
    "\"좋다 · 나쁘다 · 무조건\"을 단정하지 않고 \"용도와 발에 맞는지가 기준\"으로 말한다. "
    "마지막 문장은 쓰지 않는다(따로 붙는다)."
)


def pick(dic: Dictionary, text: str, extra: tuple[str, ...] = ()) -> list[dict]:
    """질문에 걸리는 사전 용어 — 많이 걸린 순, 셋까지. extra(조건에서 온 용어)가 앞"""
    t = text.lower()
    score = {k: sum(1 for w in words if w in t) for k, words in HINTS.items()}
    keys = [k for k in extra if k in dic.by_key]
    keys += [k for k, n in sorted(score.items(), key=lambda kv: -kv[1]) if n > 0 and k not in keys and k in dic.by_key]
    for e in dic.find(text):                      # 질문에 사전 이름이 그대로 있으면 그것도
        if e["key"] not in keys:
            keys.append(e["key"])
    return [dic.by_key[k] for k in keys[:3]]


def answer(question: str, dic: Dictionary, health: bool, history: list[dict], extra: tuple[str, ...] = (),
           tail: str = prompt.EXPLAIN_TAIL) -> Reply:
    entries = pick(dic, question, extra)
    if not entries:
        return Reply(prompt.NO_FEATURE, branch="explain")
    lines: list[str] = []
    for e in entries:
        plain = PLAIN_NAME.get(e["key"], e["name"])
        lines.append(f"{plain}(사전 용어: {e['name']}) — {e['short']}" if e.get("short") else f"{plain}(사전 용어: {e['name']})")
        lines.append(f"  {e['description']}")
        for name, desc in e.get("values") or []:
            lines.append(f"  · {name}: {desc}")
    # 코드 답 — 사전 원문을 해요체 · 쉬운 말로(원문 그대로 내면 합니다체에 사전 용어가 섞인다)
    fallback = "관련된 신발 특성을 정리해 드릴게요.\n\n" + "\n\n".join(
        plain_words(f"{josa(PLAIN_NAME.get(e['key'], e['name']), '은', '는')} {haeyo(e['description'])}") for e in entries)
    text, used = generate(question, lines, [], fallback, health, history, TASK, reference=False)
    # 보여 줄 신발이 없다 — LLM 이 예시를 따라 붙인 "보러 가실래요?"는 지운다
    text = "\n\n".join(p for p in (q.replace("보러 가실래요?", "").strip() for q in text.split("\n\n")) if p)
    reply = Reply(text + ("\n\n" + tail if tail else ""), branch="explain", fallback_used=used)
    reply.explained = [e["key"] for e in entries]
    return reply
