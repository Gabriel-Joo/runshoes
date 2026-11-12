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

    def links(self) -> list[dict]:
        """1켤레 → 상세 모달, 2켤레 이상 → 비교하기. 라벨은 언제나 "보러 가기"(사용자 7절)"""
        if self.links_off or not self.shoes:
            return []
        ids = list(dict.fromkeys(s["id"] for s in self.shoes))[:5]
        href = f"/?shoe={ids[0]}" if len(ids) == 1 else "/compare?ids=" + ",".join(map(str, ids))
        return [{"label": LINK_LABEL, "href": href}]


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
    if not text:
        return fallback, True
    bad = numbers(text) - numbers(allowed_source)
    if bad:
        print(f"[guard] 사실에 없는 숫자 {sorted(bad)} — 코드 답으로")
        return fallback, True
    if any(b in text for b in BANNED):
        print("[guard] 금칙어 — 코드 답으로")
        return fallback, True
    return text, False


def with_doctor(text: str, health: bool) -> str:
    return f"{text}\n\n{DOCTOR}" if health else text
