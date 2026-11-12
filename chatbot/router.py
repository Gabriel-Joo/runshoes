"""갈래 나누기(작업 5-1 사용자 2절 · 09 7절 · 9절).

1. 규칙이 먼저 — 정해지면 LLM 의 branch 는 무시한다
   - 이름 2개 이상, 또는 "비교 · vs · 차이"(+ 대화 상태의 신발로 2개 이상) → 비교
   - "추천 · 골라 · 뭐가 좋" → 추천
   - 이름 1개(없으면 대화 상태의 신발) + 스펙 낱말 → 스펙
   - 사전 낱말 + 뜻을 묻는 말 → 용어
2. 라우터 LLM 은 매 질문 한 번 부른다(사용자 승인 4절) — health_context 는 키워드로 잡지 않고, 등록되지 않은 신발 이름도
   문장에서 뽑아야 하므로. 규칙이 못 정하면 LLM 의 branch 를 쓴다. 실패하면 health_context=true, branch 는 경험·후기
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from . import llm

BRANCHES = ("term", "spec", "compare", "recommend", "explain", "experience", "out_of_scope", "greeting")

COMPARE_WORDS = ("비교", "vs", "차이")
RECOMMEND_WORDS = ("추천", "골라", "뭐가 좋")
SPEC_WORDS = (
    "무게", "가볍", "무겁", "몇 g", "몇g", "그램", "드롭", "스택", "쿠션", "높이", "가격", "얼마", "발매가", "발볼", "와이드",
    "폭", "미드솔", "소재", "폼", "카본", "플레이트", "안정", "중립", "용도", "스펙", "사양", "정보",
)
# 이름 없이 직전 신발을 가리키는 말 — 이게 있어야 대화 상태의 신발로 스펙 · 비교를 정한다
REFER_WORDS = ("그거", "그것", "그 신발", "그신발", "이거", "이 신발", "저거", "걔", "얘", "방금", "아까", "둘 다", "둘다", "두 개", "두개", "세 개", "셋 다")
# 경험 · 후기(5-2) — 리뷰를 직접 말하면 신발이 없어도, 착용감 · 사이즈감처럼 겪어 봐야 아는 말은 신발이 하나 정해졌을 때만.
# 통증 낱말만으로는 정하지 않는다 — 신발 없는 통증 질문은 라우터 LLM 이 특성 설명 · 추천으로 보낸다(경계 15문항)
REVIEW_WORDS = ("후기", "리뷰", "평가", "평이", "신어 본", "신어본", "신어 보신", "써 본", "써본")
FEEL_WORDS = ("착용감", "사이즈감", "내구", "닳", "편해", "편한가", "편하나", "편할까", "편안", "불편", "아파", "아프", "아픈", "물집",
              "쓸려", "쓸림", "까져", "끼어", "끼나", "끼는", "조이", "헐렁", "치수", "정사이즈", "크게 나", "작게 나")
DEFINE_WORDS = ("뭐예요", "뭐에요", "뭔가요", "뭐야", "뭐지", "뭡니까", "뜻", "의미", "란?", "이란", "란 ", "무슨 말", "설명해", "알려줘", "알려주세요")

PURPOSES = ("조깅·회복주", "템포·인터벌", "LSD·장거리", "레이스", "트레일")
WIDTHS = ("넓음", "보통")
STABILITIES = ("안정화", "중립화", "중립화-outer")
CUSHIONS = ("high", "mid", "low")

ROUTER_SYSTEM = f"""너는 러닝화 사이트 챗봇의 질문 분류기다. 사용자 문장을 읽고 JSON 하나만 낸다. 설명은 쓰지 않는다.

{{
  "branch": "term" | "spec" | "compare" | "recommend" | "explain" | "experience" | "out_of_scope" | "greeting",
  "health_context": true | false,
  "shoe_names": ["문장에 나온 신발 모델 이름 그대로"],
  "term": "뜻을 물은 러닝화 용어(없으면 null)",
  "feature": "신발 특성을 물었다면 그 특성을 짧은 명사구로(예: 뒤꿈치 쓸림, 힐컵, 통기성). 없으면 null",
  "conditions": {{
    "purpose": {json.dumps(list(PURPOSES), ensure_ascii=False)} 중 하나 또는 null,
    "width": "넓음" | "보통" | null,
    "stability": "안정화" | "중립화" | "중립화-outer" | null,
    "cushion": "high" | "mid" | "low" | null,
    "budget_won": 숫자(원) 또는 null,
    "price_level": "low" | "mid" | "any" | null
  }}
}}

branch
- term: 러닝화 용어의 뜻을 묻는다("드롭이 뭐예요", "PEBA가 뭐야")
- spec: 특정 신발 하나의 스펙 · 특징을 묻는다
- compare: 신발 둘 이상을 견준다
- recommend: 신발을 골라 달라고 한다("입문용 찾아요", "발볼 넓은데 뭐 신어요", "~한 신발 추천해 주세요"). 묻는 것이 특성 · 효과라면 recommend 가 아니다
- explain: 신발의 특성 · 원리 · 효과를 묻는다. 특정 신발 하나의 값도, 골라 달라는 요청도 아니다
  ("쿠션 좋은 신발 신으면 나을까요", "신발 바꾸면 달라질까요", "카본화는 입문자에게 안 좋죠?", "비싼 게 좋은 거 아닌가요",
   "이거 신으면 기록 줄어드나요", "안정화가 도움이 될까요", "큰 사이즈로 신어도 괜찮을까요")
- experience: 착용감 · 내구성 · 사이즈감처럼 후기가 있어야 답할 수 있는 질문
  ("발볼 끼어요?", "무릎 편하다는 후기 있는 신발", "오래 신으면 밑창 금방 닳아요?")
- out_of_scope: 러닝화와 상관없는 질문
- greeting: 인사 · 감사만 있고 질문이 없다

health_context
- 문장에 통증 · 부상 · 몸의 불편함이 조금이라도 드러나면 true. 낱말이 아니라 뜻으로 본다
  ("발 디딜 때마다 찌릿해요", "오래 뛰면 다리가 못 버텨요", "무릎이 시큰거려요" 모두 true)
- 그런 이야기가 없으면 false

shoe_names
- 문장에 나온 러닝화 모델 이름을 세대 숫자까지 그대로 적는다("호카 마하 7" → "마하 7"). 브랜드만 나오면 넣지 않는다.
  "카본화 · 안정화 · 쿠션화 · 트레일화"처럼 신발 종류는 모델이 아니다 — 넣지 않는다. 없으면 []

conditions — 추천에 쓸 조건. 문장에 드러난 것만, 짐작하지 않는다
- purpose: 조깅 · 회복주 · 입문 · 매일 · 데일리 → "조깅·회복주", 템포 · 인터벌 · 스피드 훈련 → "템포·인터벌",
  장거리 · LSD · 마라톤 연습 → "LSD·장거리", 대회 · 레이스 · 레이스화 → "레이스", 산 · 트레일 → "트레일"
  ("기록이 줄어드나요"처럼 효과를 묻는 말은 용도가 아니다 — 넣지 않는다)
- width: 발볼이 넓다 → "넓음", 보통 → "보통"
- stability: 발이 안쪽으로 무너진다 · 평발 · 안정감 → "안정화", 중립 → "중립화", 밑창 바깥쪽(새끼발가락 쪽)이 닳는다 → "중립화-outer"
- cushion: 푹신 · 쿠션 많이 → "high", 적당 → "mid", 얇게 · 지면 느낌 → "low"
- budget_won: 금액을 말했을 때만. "15만원" → 150000, "20만원 이하" → 200000
- price_level: 금액 없이 가격만 말했을 때. 저렴한 · 싼 · 가성비 → "low", 적당한 가격 → "mid", 비싸도 괜찮다 · 가격 상관없다 → "any". 금액을 말했으면 null
"""


@dataclass
class Route:
    branch: str
    health: bool
    by_rule: bool
    shoe_names: list[str] = field(default_factory=list)
    term: str | None = None
    conditions: dict = field(default_factory=dict)
    llm_ok: bool = True
    feature: str | None = None


def has_any(text: str, words: tuple[str, ...]) -> bool:
    t = text.lower()
    return any(w in t for w in words)


def rule_branch(text: str, n_shoes: int, n_state: int, n_terms: int) -> str | None:
    """규칙으로 정할 수 있으면 갈래, 아니면 None"""
    refer = has_any(text, REFER_WORDS)
    if n_shoes >= 2 or (has_any(text, COMPARE_WORDS) and n_shoes + n_state >= 2 and (n_shoes >= 1 or refer)):
        return "compare"
    if has_any(text, RECOMMEND_WORDS):
        return "recommend"
    one = n_shoes == 1 or (n_shoes == 0 and n_state >= 1 and refer)
    if has_any(text, REVIEW_WORDS) or (one and has_any(text, FEEL_WORDS)):
        return "experience"
    if (n_shoes == 1 or (n_shoes == 0 and n_state >= 1 and refer)) and has_any(text, SPEC_WORDS):
        return "spec"
    if n_terms >= 1 and n_shoes == 0 and has_any(text, DEFINE_WORDS):
        return "term"
    return None


def ask_llm(text: str, history: list[dict]) -> dict:
    recent = "\n".join(f"{'사용자' if h['role'] == 'user' else '챗봇'}: {h['content'][:200]}" for h in history[-4:])
    user = (f"이전 대화:\n{recent}\n\n" if recent else "") + f"분류할 문장: {text}"
    return llm.chat_json(ROUTER_SYSTEM, user)


def route(text: str, n_shoes: int, n_state: int, n_terms: int, history: list[dict], ask=ask_llm) -> Route:
    rule = rule_branch(text, n_shoes, n_state, n_terms)
    try:
        data = ask(text, history)
        ok = True
    except Exception as e:   # noqa: BLE001 — 어떤 실패든 기본값(health_context=true)
        print(f"[router] LLM 실패: {e}")
        data, ok = {}, False
    branch = rule or (data.get("branch") if data.get("branch") in BRANCHES else None) or "experience"
    health = data.get("health_context") if ok and isinstance(data.get("health_context"), bool) else True
    names = [n.strip() for n in data.get("shoe_names") or [] if isinstance(n, str) and n.strip()][:5]
    term = data.get("term") if isinstance(data.get("term"), str) and data.get("term").strip() else None
    feature = data.get("feature").strip()[:40] if isinstance(data.get("feature"), str) and data.get("feature").strip() else None
    if branch == "term" and not term:
        term = guess_term(text)   # LLM 이 용어 이름을 비워 보낼 때가 있다 — 기록(V18)이 빠지지 않게
    cond = clean_conditions(data.get("conditions"))
    # 가격 조건은 문장에 가격 이야기가 있을 때만 — LLM 이 말하지 않은 "가격 상관없음"을 붙이는 일이 있었다(2026-11-12 평가)
    if not has_any(text, PRICE_WORDS):
        cond.pop("price_level", None)
    if not re.search(r"\d|만\s*원|천\s*원", text):
        cond.pop("budget_won", None)
    return Route(branch, health, rule is not None, names, term, cond, ok, feature)


PRICE_WORDS = ("가격", "값", "원", "싼", "싸", "저렴", "비싸", "비싼", "가성비", "예산", "돈", "부담", "상관없", "얼마")


def guess_term(text: str) -> str | None:
    """"갑피가 뭐예요" → "갑피" — 뜻을 묻는 말 앞의 낱말"""
    m = re.match(r"\s*([0-9A-Za-z가-힣·\- ]{1,20}?)\s*(?:이|가|은|는|란|이란)?\s*(?:뭐|무슨|뜻|의미|어떤)", text)
    return m.group(1).strip() if m and m.group(1).strip() else None


def clean_conditions(raw) -> dict:
    """LLM 이 낸 조건을 API 가 받는 값으로만 — 밖의 값은 버린다(= 묻지 않은 것)"""
    c = raw if isinstance(raw, dict) else {}
    out = {}
    if c.get("purpose") in PURPOSES:
        out["purpose"] = c["purpose"]
    if c.get("width") in WIDTHS:
        out["width"] = c["width"]
    if c.get("stability") in STABILITIES:
        out["stability"] = c["stability"]
    if c.get("cushion") in CUSHIONS:
        out["cushion"] = c["cushion"]
    b = c.get("budget_won")
    if isinstance(b, (int, float)) and 10000 <= b <= 5000000:
        out["budget_won"] = int(b)                     # API budget 은 1 ~ 1억 — 말이 안 되는 금액은 버린다
    elif c.get("price_level") in ("low", "mid", "any"):
        out["price_level"] = c["price_level"]          # 금액이 있으면 금액이 이긴다
    return out


def purpose_by_rule(text: str) -> str | None:
    """되물은 뒤의 짧은 답("트레일요")은 규칙으로도 받는다"""
    t = text.replace(" ", "")
    for p in PURPOSES:
        if p.replace("·", "") in t.replace("·", "") or p in t:
            return p
    table = (("조깅", "조깅·회복주"), ("회복", "조깅·회복주"), ("입문", "조깅·회복주"), ("데일리", "조깅·회복주"),
             ("템포", "템포·인터벌"), ("인터벌", "템포·인터벌"), ("lsd", "LSD·장거리"), ("장거리", "LSD·장거리"),
             ("마라톤", "LSD·장거리"), ("레이스", "레이스"), ("대회", "레이스"), ("트레일", "트레일"), ("산길", "트레일"))
    tl = t.lower()
    for w, p in table:
        if w in tl:
            return p
    return None


# 낱말 경계까지 본다 — "예산은", "네이버", "좋아하는", "어디서"가 "네"로 읽히지 않게
_YES = re.compile(r"^(네|넹|예|응|좋아요|좋아|좋습니다|그래요|그래|부탁해요|부탁드려요|부탁|찾아\s*주세요|찾아줘|ㅇㅇ|yes)(?=$|[\s.!~,?])", re.IGNORECASE)


def is_yes(text: str) -> bool:
    return bool(_YES.match(text.strip()))
