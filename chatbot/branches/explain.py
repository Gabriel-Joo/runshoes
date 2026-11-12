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
# 사전 용어 → 챗봇 문장에서 부르는 이름(8절 쉬운 말). 비어 있으면 LLM 이 정의 문장을 이름처럼 써서 같은 말을 되풀이했다(1회차 B06)
PLAIN_NAME = {"stackHeight": "쿠션 높이", "drop": "앞뒤 높이 차이", "midsole": "쿠션 소재", "wideAvailable": "넓은 폭(2E·4E) 버전",
              "pronation": "착지할 때 발이 안쪽으로 기우는 움직임", "stabilityPair": "안정화와 중립화", "width": "발볼",
              "carbon": "카본 플레이트", "weight": "무게", "neutral": "중립화", "stability": "안정화", "outsole": "겉창",
              "trail": "트레일 러닝", "tempo": "템포런", "lsd": "LSD"}
# 추천 조건 → 근거 용어(통증 + 추천인데 용도가 없을 때)
FROM_CONDITION = {"cushion": "stackHeight", "stability": "stabilityPair", "width": "width"}

# 첫 문장 틀은 두지 않는다(사용자 2회차) — 질문 유형별로 문장을 고르는 것도 키워드 규칙이라 쓰지 않고, LLM 이 질문에 맞게 시작한다.
# 단정 유도만 예외(설명부터 하면 동의한 것처럼 읽힌다). 효과를 약속하지 않는 것은 문장 전체로 — 끝의 전문의 안내는 코드가 붙인다
TASK = (
    "사용자가 단정하는 말투로 물으면, 먼저 그 단정에 동의하지 않는다고 짧게 밝히고 설명한다. "
    "그 밖에는 질문에 맞게 바로 시작한다. "
    "효과를 약속하지 않는 것은 문장 전체로 지키고, 첫 문장으로 미리 방어하지 않는다. "
    "[등록된 정보]의 특성만 근거로, 해요체로 서너 문장. 같은 뜻을 두 번 쓰지 않는다. "
    "특성은 [등록된 정보] 줄 첫머리의 이름(쿠션 높이 · 카본 플레이트 등)으로 부른다. 괄호로 다른 이름을 덧붙이지 않는다. "
    "신발이나 특성이 몸에 \"도움이 된다\"고 쓰지 않는다(\"무릎에 도움이 될 수 있어요\" 금지). "
    "사람이 무엇을 확인 · 비교하는 것이 도움이 된다는 말은 써도 된다. "
    "사용자의 말이나 상태를 되받지 않는다(\"~하셨네요\", \"~하신 것 같아요\", \"~찾으시는군요\" 금지). "
    "몸 상태를 판단하지 않는다 — 사용자가 말한 몸 이야기(체중 · 평발 등)를 \"~시니까\"로 다시 말하지 않는다. "
    "\"~때문이에요\"로 원인을 말하지 않는다. 정보에 없는 특성 · 효과는 말하지 않는다. "
    "\"보러 가실래요?\"와 마지막 안내 문장은 쓰지 않는다(따로 붙는다)."
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
    # 근거는 설명(description)만 — 짧은 정의(short)까지 주면 같은 정의를 두 번 썼다(1회차). 사전 용어는 미리 쉬운 말로
    lines: list[str] = []
    for e in entries:
        lines.append(f"{PLAIN_NAME.get(e['key'], e['name'])}: {plain_words(e['description'])}")
        for name, desc in e.get("values") or []:
            lines.append(f"  · {name}: {plain_words(desc)}")
    # 코드 답 — 사전 원문을 해요체 · 쉬운 말로(원문 그대로 내면 합니다체에 사전 용어가 섞인다)
    fallback = "관련된 신발 특성을 정리해 드릴게요.\n\n" + "\n\n".join(
        plain_words(f"{josa(PLAIN_NAME.get(e['key'], e['name']), '은', '는')} {haeyo(e['description'])}") for e in entries)
    text, used = generate(question, lines, [], fallback, health, history, TASK, reference=False)
    # 보여 줄 신발이 없다 — LLM 이 예시를 따라 붙인 "보러 가실래요?"는 지운다
    text = "\n\n".join(p for p in (q.replace("보러 가실래요?", "").strip() for q in text.split("\n\n")) if p)
    reply = Reply(text + ("\n\n" + tail if tail else ""), branch="explain", fallback_used=used)
    reply.explained = [e["key"] for e in entries]
    return reply
