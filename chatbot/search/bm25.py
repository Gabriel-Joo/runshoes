"""BM25 — 한국어 글자 2-gram(09 1절). 본문만 본다(머리말은 임베딩에만, 사용자 2026-11-12).

"발볼" · "뒤꿈치" 같은 낱말 일치와 PEBA · EVA 같은 고유명사를 잡으려고 둔다. 낱말(공백으로 나눈 것) 안에서만 2-gram 을 만들고,
한 글자 낱말은 그 글자 하나로 둔다. 색인이 바뀌면 통째로 다시 만든다 — 3,438문서에 수십 ms 라 증분은 두지 않는다.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter

_WORD = re.compile(r"[0-9a-z가-힣]+")
K1, B = 1.5, 0.75


def tokens(text: str) -> list[str]:
    t = unicodedata.normalize("NFC", text or "").lower()
    out: list[str] = []
    for w in _WORD.findall(t):
        if len(w) == 1:
            out.append(w)
        else:
            out += [w[i:i + 2] for i in range(len(w) - 1)]
    return out


class BM25:
    def __init__(self, texts: list[str]):
        self.tf = [Counter(tokens(x)) for x in texts]
        self.len = [sum(c.values()) for c in self.tf]
        self.avg = (sum(self.len) / len(self.len)) if self.len else 0.0
        df: Counter = Counter()
        for c in self.tf:
            df.update(c.keys())
        n = len(texts)
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}
        # 낱말 → 그 낱말이 나오는 문서 — 질의 낱말이 없는 문서는 셈하지 않는다
        self.post: dict[str, list[int]] = {}
        for i, c in enumerate(self.tf):
            for t in c:
                self.post.setdefault(t, []).append(i)

    def scores(self, query: str) -> dict[int, float]:
        """{문서 자리: 점수} — 질의 낱말이 하나라도 나온 문서만"""
        out: dict[int, float] = {}
        for t in set(tokens(query)):
            idf = self.idf.get(t)
            if idf is None:
                continue
            for i in self.post[t]:
                f = self.tf[i][t]
                norm = f * (K1 + 1) / (f + K1 * (1 - B + B * self.len[i] / (self.avg or 1)))
                out[i] = out.get(i, 0.0) + idf * norm
        return out
