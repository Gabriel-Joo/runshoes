"""답 하나 — 글 · 버튼 · 언급한 신발. 생성한 글의 검사(guard)도 여기.

검사(사용자 승인 11절): LLM 답의 숫자가 사실 문장 · 사용자 문장에 없는 것이면 코드가 쓴 답(fallback)을 그대로 낸다.
금칙어가 나와도 같다. 이모지는 지우고, 의료 안내 문장은 지운 뒤 코드가 한 번 붙인다(누락률 0 — 사용자 5절).
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field

from .prompt import ASK_PURPOSE, ASK_PURPOSE_CALM, DOCTOR, EXPLAIN_TAIL, LINK_LABEL

# 리뷰는 가상 유저 200명이 만든 데이터다 — 실제 사람들의 반응처럼 말하는 낱말을 막는다(09 6절, 5-2 에서 셋 더함)
BANNED = ("전문가", "완벽한 선택", "죄송합니다만", "러너들이", "실제 사용자", "많은 사람들", "대부분의 사용자", "사용자들")
_EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
_MEDICAL = re.compile(r"(전문의|전문 의료|의료기관|병원|진료|진단)")


@dataclass
class Reply:
    text: str
    shoes: list[dict] = field(default_factory=list)   # 버튼을 붙일 신발(언급한 순서)
    links_off: bool = False                           # 범위 밖 등 — 버튼을 붙이지 않는다
    fallback_used: bool = False                       # 검사에 걸려 코드 답을 냈는지(로그 · 평가)
    branch: str = ""
    explained: list[str] = field(default_factory=list)   # 특성 설명의 근거로 쓴 사전 용어 · 설명문 문장(평가가 본다)
    ranked: list[int] = field(default_factory=list)      # 경험·후기 — 신발을 말하지 않았을 때 검색이 고른 신발 순위(Hit@5)
    tally: list[dict] = field(default_factory=list)      # 경험·후기 — 신발마다 N · 언급 · 긍정 · 부정 · 언급 없음(평가 · 로그)
    want: str | None = None                              # 경험·후기 — 질문이 찾는 쪽(positive · negative). 여러 켤레 순위의 기준

    def links(self) -> list[dict]:
        """1켤레 → 상세 모달, 2켤레 이상 → 비교하기. 라벨은 언제나 "보러 가기"(사용자 7절)"""
        if self.links_off or not self.shoes:
            return []
        ids = list(dict.fromkeys(s["id"] for s in self.shoes))[:5]
        href = f"/?shoe={ids[0]}" if len(ids) == 1 else "/compare?ids=" + ",".join(map(str, ids))
        return [{"label": LINK_LABEL, "href": href}]


# "도움이 된다" — 주어로 가른다(사용자 2회차). 사람이 무엇을 하는 것이 도움이 되는 건 괜찮고, 신발이 몸에 도움이 된다는 건 효과 약속
_HELP = re.compile(r"도움이\s*(될|돼|됩|되)")
_PERSON_ACT = re.compile(r"(보시|해 보|해보|확인|살펴|비교해|비교하|고르시|고를 때|고려하|알아보|신어 보|참고하)")
_SHOE_SUBJ = re.compile(r"(신발|쿠션|안정화|중립화|카본|플레이트|높이 차이|소재|발볼|폭|모델|버전|러닝화)")


def help_claims(text: str) -> tuple[list[str], list[str]]:
    """(효과 약속으로 보는 문장, 주어를 가리기 어려운 문장)"""
    bad, unsure = [], []
    for s in re.split(r"(?<=[.!?])\s+|\n+", text):
        if not _HELP.search(s) or _PERSON_ACT.search(s):
            continue
        (bad if _SHOE_SUBJ.search(s[:_HELP.search(s).start()]) else unsure).append(s.strip())
    return bad, unsure


def numbers(text: str) -> set[str]:
    out = set()
    for m in _NUM.findall(text):
        v = m.replace(",", "")
        try:
            f = float(v)
        except ValueError:
            continue
        out.add(f"{f:g}")
    return out


def strip_medical(text: str) -> str:
    """LLM 이 쓴 의료 안내 문장은 지운다 — 코드가 한 번만 붙인다"""
    paras = []
    for para in text.split("\n\n"):
        sents = re.split(r"(?<=[.!?요])\s+", para.strip())
        kept = [s for s in sents if not _MEDICAL.search(s)]
        if kept:
            paras.append(" ".join(kept))
    return "\n\n".join(paras)


# 이 턴에 검사가 한 일 — 지운 것 · 코드 답으로 바꾼 까닭. 턴마다 bot 이 비우고 trace 에 옮긴다(스레드마다 따로 — 서버는 턴을 스레드에서 돌린다)
_LOG = threading.local()


def guard_log() -> list[str]:
    if not hasattr(_LOG, "items"):
        _LOG.items = []
    return _LOG.items


def guard_reset() -> None:
    _LOG.items = []


# 사이트 목록에 대한 말 — 근거에 신발이 없을 때(특성 설명) 나오면 지어낸 것이다(2026-11-12 사용자 승인)
_CATALOG = re.compile(r"(등록된|이 사이트의?|사이트에 있는)\s*(신발|모델)|(모델|신발)들?이\s*(있어요|있습니다|많아요)|(이|가)\s*해당(해요|돼요|합니다)|해당하는\s*(신발|모델)|(신발|모델)\s*목록|목록에서")
# 출처를 밝히는 말 — 지금은 세기만 한다(5-2 에서 근거가 바뀌면 다시 본다)
SOURCE_PHRASE = re.compile(r"등록된 정보에 (따르면|나와|있어|의하면)|(다|라)고 해요|(다|라)고 나와 있어요")
_ASK = re.compile(r"(알려\s*주시면|말씀해\s*주시면|궁금하신지|어떠세요\?|할까요\?|실래요\?)")


def drop_asks(text: str) -> str:
    """묻는 문장을 지운다 — 묻는 말은 코드가 붙인다(특성 설명)"""
    paras = []
    for para in text.split("\n\n"):
        sents = re.split(r"(?<=[.!?])\s+", para.strip())
        kept = [s for s in sents if not _ASK.search(s) and not s.rstrip().endswith("?")]   # 묻는 문장은 모두(…싶으신가요? · …있나요?)
        if len(kept) < len([s for s in sents if s]):
            guard_log().append("묻는 문장 지움")   # 뒤에 붙는 문장을 알려 준 뒤에도 얼마나 남는지 센다(2차 수정)
        if kept:
            paras.append(" ".join(kept))
    return "\n\n".join(paras)


def guard(generated: str, allowed_source: str, fallback: str, shoes_given: bool = True) -> tuple[str, bool]:
    """(낼 글, fallback 을 썼는지). shoes_given — 근거에 신발이 있나(없으면 목록 이야기를 막는다)"""
    log = guard_log()
    text = _EMOJI.sub("", generated).strip()
    if text != generated.strip():
        log.append("이모지 지움")
    # 화면은 마크다운을 그리지만(2차 수정) LLM 글에는 쓰지 않는다 — 인용 블록은 코드만 붙인다. 굵게 · 머리 · 목록 · 인용 표시를 지운다
    md = re.sub(r"\*\*|__|^#+\s*|^\s*(?:[-*+]|\d+\.)\s+|^>\s?", "", text, flags=re.MULTILINE)
    if md != text:
        log.append("마크다운 지움")
    text = strip_medical(md)
    if text != md:
        log.append("의료 문장 지움")
    pw = plain_words(text)
    if pw != text:
        log.append("사전 용어 → 쉬운 말")
    text = pw
    if not text:
        log.append("코드 답: 빈 글")
        return fallback, True
    bad = numbers(text) - numbers(allowed_source)
    if bad:
        print(f"[guard] 사실에 없는 숫자 {sorted(bad)} — 코드 답으로")
        log.append(f"코드 답: 사실에 없는 숫자 {sorted(bad)}")
        return fallback, True
    hit = [b for b in BANNED if b in text]
    if hit:
        print("[guard] 금칙어 — 코드 답으로")
        log.append(f"코드 답: 금칙어 {hit}")
        return fallback, True
    if help_claims(text)[0]:
        print(f"[guard] 신발이 몸에 도움이 된다는 문장 {help_claims(text)[0]} — 코드 답으로")
        log.append("코드 답: 신발이 몸에 도움")
        return fallback, True
    if not shoes_given and _CATALOG.search(text):
        print(f"[guard] 근거에 신발이 없는데 목록 이야기 '{_CATALOG.search(text).group(0)}' — 코드 답으로")
        log.append("코드 답: 목록 이야기")
        return fallback, True
    n = len(SOURCE_PHRASE.findall(text))
    if n:
        log.append(f"출처 말하기 {n}")
    return text, False


# 사전 용어 → 쉬운 말(8절). 생성한 글에서 코드가 바꾼다 — 프롬프트로만 지키면 설명문 · 사전을 옮길 때 섞였다(경계 평가)
PLAIN = {"스택하이트": "쿠션 높이", "드롭": "앞뒤 높이 차이", "미드솔": "쿠션 소재"}
_PARTICLE = {"은": "는", "이": "가", "을": "를", "과": "와", "으로": "로", "이에요": "예요", "이고": "고"}


def plain_words(text: str) -> str:
    """"미드솔은" → "쿠션 소재는", "(스택하이트)" 괄호는 지운다. 바꾼 말은 모두 받침이 없어 조사를 맞춘다"""
    text = re.sub(r"\s*\((?:" + "|".join(PLAIN) + r")\)", "", text)
    def sub(m: re.Match) -> str:
        p = m.group(2) or ""
        return PLAIN[m.group(1)] + _PARTICLE.get(p, p)
    return re.sub(r"(" + "|".join(PLAIN) + r")(으로|이에요|이고|은|는|이|가|을|를|과|와|로|의|에서|에|도|만)?", sub, text)


_HAEYO = [("있습니다", "있어요"), ("없습니다", "없어요"), ("좋습니다", "좋아요"), ("했습니다", "했어요"), ("아닙니다", "아니에요"),
          ("쓰입니다", "쓰여요"), ("붙입니다", "붙여요"), ("나눕니다", "나눠요"), ("집니다", "져요"), ("줍니다", "줘요"), ("씁니다", "써요"), ("합니다", "해요"),
          # 설명문(5-2 — 특성 설명 · 경험·후기의 근거)에 자주 나오는 끝. 합니다체를 그대로 주면 LLM 이 "나온답니다"처럼 옮겼다(경계 B01)
          ("나옵니다", "나와요"), ("됩니다", "돼요"), ("듭니다", "들어요"), ("봅니다", "봐요"), ("옵니다", "와요"), ("맞습니다", "맞아요"),
          ("납니다", "나요"), ("잡습니다", "잡아요"), ("갑니다", "가요"), ("받습니다", "받아요")]


def haeyo(text: str) -> str:
    """사전 원문(합니다체) → 해요체 — 코드 답(특성 설명)에 쓴다"""
    for a, b in _HAEYO:
        text = text.replace(a + ".", b + ".")
    def ip(m: re.Match) -> str:
        w = m.group(1)
        base = re.sub(r"\([^()]*\)$", "", w) or w      # "차이(mm)입니다" — 괄호 앞 글자로 고른다
        c = base[-1]
        return w + ("이에요." if (("가" <= c <= "힣") and (ord(c) - 0xAC00) % 28) or c in "0136789" else "예요.")
    return re.sub(r"(\S+)입니다\.", ip, text)


# 코드가 붙이는 끝 단락 — 의료 안내는 이 앞에 넣는다(7절 "전문의 안내 1회. 그 뒤 사이트 쪽으로 돌아온다").
# 코드 자신의 고정 문구만 본다(LLM 문장을 보고 자리를 고르지 않는다). 한 단락 전체가 이 문구일 때만
_TAILS = (EXPLAIN_TAIL, ASK_PURPOSE_CALM, ASK_PURPOSE, "보러 가실래요?")


def with_doctor(text: str, health: bool) -> str:
    if not health:
        return text
    for tail in _TAILS:
        if text == tail or text.endswith("\n\n" + tail):
            head = text[: -len(tail)].rstrip()
            return (f"{head}\n\n" if head else "") + f"{DOCTOR}\n\n{tail}"
    return f"{text}\n\n{DOCTOR}"
