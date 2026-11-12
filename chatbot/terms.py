"""용어 — 사전 그대로 낸다. Ollama 를 부르지 않는다(09 8절 · 0절 원칙 3).

사전 = DB terms 13개(GET /api/terms) + 화면이 직접 가진 둘(src/utils/terms.ts 의 WIDE_TERM · stabilityTerm).
툴팁이 사이트의 진실의 원천이라 검색하지 않고 전량을 쓴다. 화면 둘은 여기 사본을 둔다 —
두 벌이라 어긋나지 않는지 평가(chatbot/eval)가 terms.ts 와 대조한다.
"""

from __future__ import annotations

from .catalog import norm

# src/utils/terms.ts WIDE_TERM 의 사본 — 고치면 둘 다 고친다(평가가 대조한다)
WIDE_TERM = {
    "id": 0,
    "key": "wideAvailable",
    "name": "와이드 모델",
    "short": "넓은 폭(2E·4E) 버전이 따로 나오는지",
    "description": "그 신발의 넓은 폭(2E·4E) 버전이 따로 나오는지를 뜻합니다.",
    "values": [
        ["있음", "국내에서 살 수 있습니다."],
        ["국외에만 있음", "해외에는 나오지만 국내에서는 살 수 없습니다. 해외 직구로만 구할 수 있습니다."],
        ["없음", "찾아봤지만 넓은 폭 버전이 없습니다."],
        ["정보 없음", "아직 확인하지 못했습니다."],
    ],
}

# src/utils/terms.ts stabilityTerm 의 사본 — 값 설명은 terms 의 중립화 · 안정화 그대로
STABILITY_DESCRIPTION = "발이 안쪽으로 무너지는 과내전을 잡아 주는지에 따라 나눕니다."


def stability_term(terms: list[dict]) -> dict | None:
    neutral = next((t for t in terms if t.get("key") == "neutral"), None)
    stable = next((t for t in terms if t.get("key") == "stability"), None)
    if not neutral or not stable:
        return None
    return {
        "id": 0,
        "key": "stabilityPair",
        "name": "안정성",
        "short": "",
        "description": STABILITY_DESCRIPTION,
        "values": [[neutral["name"], neutral["description"]], [stable["name"], stable["description"]]],
    }


# 챗봇 문장에서 쓰는 쉬운 말 → 사전 용어(작업 5-1 사용자 8절). 사용자가 쉬운 말로 물어도 사전을 찾는다
PLAIN = {
    "쿠션 높이": "stackHeight",
    "쿠션높이": "stackHeight",
    "앞뒤 높이 차이": "drop",
    "앞뒤높이차이": "drop",
    "쿠션 소재": "midsole",
    "넓은 폭": "wideAvailable",
    "와이드": "wideAvailable",
    "스택": "stackHeight",
    "겉창": "outsole",
    "중창": "midsole",
    "카본": "carbon",
    "템포": "tempo",
    "trail": "trail",
    "트레일": "trail",
}

# 사전에 없는 용어에 "대신 OO은 설명해드릴 수 있어요"의 OO — 09 8절 보강 목록(21개)에서 가까운 사전 용어로
NEAR = {
    "갑피": "width", "텅": "width", "메시": "width", "니트": "width", "토박스": "width", "앞코": "width", "중족부": "width", "라스트": "width",
    "eva": "midsole", "peba": "midsole", "tpu": "midsole",
    "러그": "outsole",
    "데일리트레이너": "tempo", "슈퍼트레이너": "carbon", "슈퍼슈즈": "carbon", "레이싱": "carbon",
    "회복주": "lsd", "인터벌": "tempo", "울트라": "lsd",
    "미드풋": "drop", "과내전": "pronation",
}


class Dictionary:
    def __init__(self, terms: list[dict]):
        self.entries: list[dict] = list(terms) + [WIDE_TERM]
        st = stability_term(terms)
        if st:
            self.entries.append(st)
        self.by_key = {e["key"]: e for e in self.entries}

    def find(self, message: str) -> list[dict]:
        """문장에 나온 사전 용어 — 이름 · 쉬운 말. 긴 이름부터, 겹치면 하나만"""
        m = norm(message)
        names: list[tuple[str, str]] = [(norm(e["name"]), e["key"]) for e in self.entries]
        names += [(norm(k), v) for k, v in PLAIN.items()]
        names.sort(key=lambda x: -len(x[0]))
        found: list[str] = []
        taken: list[tuple[int, int]] = []
        for n, key in names:
            i = m.find(n)
            if i < 0 or not n:
                continue
            j = i + len(n)
            if any(not (j <= a or i >= b) for a, b in taken):
                continue
            taken.append((i, j))
            if key in self.by_key and key not in found:
                found.append(key)
        return [self.by_key[k] for k in found]

    @staticmethod
    def render(e: dict) -> str:
        """사전 그대로 — 이름 · 한 줄 · 설명 · 값(있으면)"""
        head = f"{e['name']} — {e['short']}" if e.get("short") else e["name"]
        lines = [head, "", e["description"]]
        for name, desc in e.get("values") or []:
            lines.append(f"· {name}: {desc}")
        return "\n".join(lines)

    def near(self, unknown: str) -> dict:
        key = NEAR.get(norm(unknown))
        return self.by_key.get(key) or self.by_key.get("midsole") or self.entries[0]
