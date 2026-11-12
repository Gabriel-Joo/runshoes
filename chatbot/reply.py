"""답 하나 — 글 · 버튼 · 언급한 신발. 생성한 글의 검사(guard)도 여기.

검사(사용자 승인 11절): LLM 답의 숫자가 사실 문장 · 사용자 문장에 없는 것이면 코드가 쓴 답(fallback)을 그대로 낸다.
금칙어가 나와도 같다. 이모지는 지우고, 의료 안내 문장은 지운 뒤 코드가 한 번 붙인다(누락률 0 — 사용자 5절).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .prompt import DOCTOR, LINK_LABEL

BANNED = ("전문가", "완벽한 선택", "죄송합니다만", "러너들이", "실제 사용자", "실제 사용자들", "많은 사람들이")
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
    explained: list[str] = field(default_factory=list)   # 특성 설명의 근거로 쓴 사전 용어(평가가 본다)

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


def guard(generated: str, allowed_source: str, fallback: str) -> tuple[str, bool]:
    """(낼 글, fallback 을 썼는지)"""
    text = _EMOJI.sub("", generated).strip()
    text = re.sub(r"\*\*|__|^#+\s*", "", text, flags=re.MULTILINE)
    text = strip_medical(text)
    text = plain_words(text)
    if not text:
        return fallback, True
    bad = numbers(text) - numbers(allowed_source)
    if bad:
        print(f"[guard] 사실에 없는 숫자 {sorted(bad)} — 코드 답으로")
        return fallback, True
    if any(b in text for b in BANNED):
        print("[guard] 금칙어 — 코드 답으로")
        return fallback, True
    if help_claims(text)[0]:
        print(f"[guard] 신발이 몸에 도움이 된다는 문장 {help_claims(text)[0]} — 코드 답으로")
        return fallback, True
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
          ("쓰입니다", "쓰여요"), ("붙입니다", "붙여요"), ("집니다", "져요"), ("줍니다", "줘요"), ("씁니다", "써요"), ("합니다", "해요")]


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


def with_doctor(text: str, health: bool) -> str:
    return f"{text}\n\n{DOCTOR}" if health else text
