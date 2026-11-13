"""특성 설명 — 신발의 특성 · 원리를 묻는 일반 질문(작업 5-1, 2026-11-12 사용자).

"쿠션 좋은 신발 신으면 나을까요", "카본화는 입문자에게 안 좋죠?", "비싼 게 좋은 거 아닌가요"처럼
특정 신발의 값도, 신발을 골라 달라는 것도 아닌 질문. 근거는 용어 사전(툴팁과 같은 원문)뿐이다 — 질문에 걸리는 용어를
셋까지 골라 사실로 주고, LLM 은 쉬운 말 · 해요체로 두세 문장을 쓴다. 숫자는 사전에 있는 것만(검사 — 어긋나면 사전 원문).
사전에 걸리는 용어가 없으면 거절한다(9절 "근거 없음" + 할 수 있는 것 하나). 설명문 검색은 5-2.
"""

from __future__ import annotations

from .. import prompt
from ..facts import josa
from ..reply import Reply, drop_asks, haeyo, plain_words
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
    "서너 문장으로, 같은 뜻을 두 번 쓰지 않는다. 특성은 [등록된 정보] 줄 첫머리의 이름(쿠션 높이 · 카본 플레이트 등)으로 부르고, "
    "괄호로 다른 이름을 덧붙이지 않는다. 되묻지 않는다."
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


DESC_COS = 0.55   # 설명문 문장을 근거로 줄 문턱(임베딩 유사도) — 평가로 정했다(09 16절)
DESC_MAX = 3
DESC_HEAD = "[설명문에서 찾은 문장] 이 사이트에 등록된 신발의 설명이다. 예로 들 때는 브랜드와 모델을 밝힌다."


def find_desc(searcher, question: str) -> list:
    """설명문 문장 — 색인이 준비됐을 때만. 실패하면 사전만으로 답한다(5-1 과 같게)"""
    if searcher is None or not searcher.ready:
        return []
    try:
        hits = searcher.search(question, DESC_MAX * 2, {"kind": "desc"})
    except Exception as e:   # noqa: BLE001
        print(f"[explain] 설명문 검색 실패: {e!r}")
        return []
    return [h for h in hits if (h.cosine or 0) >= DESC_COS][:DESC_MAX]


def answer(question: str, dic: Dictionary, health: bool, history: list[dict], extra: tuple[str, ...] = (),
           tail: str = prompt.EXPLAIN_TAIL, searcher=None, catalog=None) -> Reply:
    entries = pick(dic, question, extra)
    # 통증 질문에는 설명문(신발 이름 · 보러 가기)을 쓰지 않는다(사용자 2026-11-13) — 병명 → 신발로 가는 근거가 사전에 없어
    # 챗봇이 고른 신발이 "이 병에는 이 신발"로 읽힌다. 사용자가 지목한 신발은 이 길로 오지 않는다(스펙 · 경험·후기)
    desc = [] if health else find_desc(searcher, question)
    if not entries and not desc:
        return Reply(prompt.NO_FEATURE, branch="explain")
    # 근거는 설명(description)만 — 짧은 정의(short)까지 주면 같은 정의를 두 번 썼다(1회차). 사전 용어는 미리 쉬운 말로
    lines: list[str] = []
    for e in entries:
        lines.append(f"{PLAIN_NAME.get(e['key'], e['name'])}: {plain_words(haeyo(e['description']))}")
        for name, desc_text in e.get("values") or []:
            lines.append(f"  · {name}: {plain_words(haeyo(desc_text))}")
    # 설명문 문장(5-2) — 사전이 한두 줄뿐이라 같은 말을 되풀이하던 것(B06)을 신발의 실제 구조로 채운다
    shoes = []
    if desc:
        lines += ["", DESC_HEAD]
        for h in desc:
            lines.append(f"- {h.meta.get('brand')}의 {h.meta.get('model')}: {plain_words(haeyo(h.text))}")
    # 코드 답 — 사전 원문을 해요체 · 쉬운 말로(원문 그대로 내면 합니다체에 사전 용어가 섞인다)
    paras = [plain_words(f"{josa(PLAIN_NAME.get(e['key'], e['name']), '은', '는')} {haeyo(e['description'])}") for e in entries]
    if not entries:
        h = desc[0]
        paras.append(plain_words(f"{h.meta.get('brand')}의 {josa(h.meta.get('model'), '은', '는')} 설명에 이런 내용이 있어요. {haeyo(h.text)}"))
    fallback = "관련된 신발 특성을 정리해 드릴게요.\n\n" + "\n\n".join(paras)
    text, used = generate(question, lines, [], fallback, health, history, TASK, reference=False, shoes_given=bool(desc),
                          tails=[tail] if tail else [], branch="explain")
    # 생성한 글도 해요체 표로 — 근거가 사전뿐(통증 질문)이면 LLM 이 "무난하다고 합니다"처럼 원문 말투를 따랐다(1차 수정 평가 B04 · B05)
    text = haeyo(text)
    # 보여 줄 신발 — 답에 이름이 나온 설명문의 신발만. 그 밖에는 LLM 이 예시를 따라 붙인 "보러 가실래요?"를 지운다
    if desc and catalog is not None:
        shoes = [catalog.by_id[h.shoe_id] for h in desc if h.meta.get("model") and h.meta["model"] in text and h.shoe_id in catalog.by_id]
    if not shoes:
        text = "\n\n".join(p for p in (q.replace("보러 가실래요?", "").strip() for q in text.split("\n\n")) if p)
    # 묻는 말은 코드가 붙인다(용도 — 추천으로 이어지는 길). LLM 이 따로 물으면 두 번 묻게 된다(B03) — 그 문장을 지운다
    text = drop_asks(text) or fallback
    uniq = list({s["id"]: s for s in shoes}.values())
    reply = Reply(text + ("\n\n" + tail if tail else ""), uniq, branch="explain", fallback_used=used)
    reply.explained = [e["key"] for e in entries] + [h.doc_id for h in desc]
    return reply
