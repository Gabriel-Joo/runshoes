"""신발 · 용어 읽기와 신발 이름 찾기(작업 5-1, docs/09_chatbot_rag.md 10절).

이름은 코드가 찾는다 — LLM 을 쓰지 않는다. model · modelEn · modelAlias 와 세대 숫자로.
- 세대를 말하지 않았으면 현행(isCurrent), 현행이 없는 라인은 가장 높은 세대 — 그 라인에 세대가 여럿이면 "N세대 기준이에요"를 밝힌다
- 같은 말이 여러 라인에 걸리면 되묻는다(하나만)
"""

from __future__ import annotations

import re
import threading
import unicodedata
from dataclasses import dataclass, field

from . import http, timing

# 공시 무게의 기준 사이즈 → mm(01a_catalog_sources.md 1-3a). 다섯 값 밖은 기준 모름
SIZE_MM = {"M8.5": 265, "M9": 270, "M9.5": 275, "M10": 280, "M10.5": 285}

# 앞 낱말을 뗀 별칭으로 쓰지 않는 말 — 흔한 말이라 다른 문장에 섞여 걸린다
_STOP = {
    "트레일", "trail", "플러스", "plus", "프로", "pro", "맥스", "max", "엘리트", "elite", "울트라", "ultra",
    "레이서", "racer", "gtx", "고어텍스", "런", "run", "에어", "air", "줌", "zoom", "x", "넥스트", "next", "next%",
    "넥스트%", "v", "se", "와이드", "wide", "로드", "road", "스피드", "speed", "레이스", "race", "투어", "tour",
}


def norm(s: str) -> str:
    """비교용 — NFC · 소문자 · 글자 숫자 % 만(공백 · 하이픈 · 점을 뺀다)"""
    s = unicodedata.normalize("NFC", s or "").lower()
    return "".join(ch for ch in s if ch.isalnum() or ch == "%")


def _norm_with_index(s: str) -> tuple[str, list[int]]:
    """norm 과 같은 글자 + 각 글자의 원문 자리"""
    s = unicodedata.normalize("NFC", s or "")
    out, where = [], []
    for i, ch in enumerate(s):
        c = ch.lower()
        if c.isalnum() or c == "%":
            out.append(c)
            where.append(i)
    return "".join(out), where


def _strip_generation(name: str, gen: int | None) -> str:
    if gen is None:
        return name.strip()
    return re.sub(rf"[\s\-]*v?\s*{gen}\s*$", "", name.strip(), flags=re.IGNORECASE).strip()


@dataclass
class Line:
    key: str
    shoes: list[dict] = field(default_factory=list)

    def pick(self, gen: int | None) -> dict | None:
        """세대를 말했으면 그 세대(없으면 None), 아니면 현행 → 가장 높은 세대"""
        if gen is not None:
            for s in self.shoes:
                if s.get("generation") == gen:
                    return s
            return None
        cur = [s for s in self.shoes if s.get("isCurrent")]
        if cur:
            return cur[0]
        return max(self.shoes, key=lambda s: (s.get("generation") or 0, -s["id"]))

    @property
    def multi_generation(self) -> bool:
        return len({s.get("generation") for s in self.shoes}) > 1


@dataclass
class Mention:
    """문장에서 찾은 신발 하나 — shoe 가 없으면 등록되지 않은 세대(line 은 있다)이거나 되물을 후보(candidates)"""
    text: str                      # 문장에 나온 그대로(대략) — 기록 · 되묻기에 쓴다
    line: Line | None
    gen: int | None
    shoe: dict | None
    candidates: list[Line] = field(default_factory=list)
    generation_note: bool = False  # "N세대 기준이에요"를 붙일지


class Catalog:
    """GET /api/shoes · /api/terms 를 읽어 이름 색인을 만든다. 챗봇은 CatalogCache 로 한 번 읽어 두고 신발이 바뀌면 다시 읽는다.
    만든 뒤에는 읽기만 한다 — 여러 연결 · 스레드가 한 객체를 함께 쓴다"""

    def __init__(self, shoes: list[dict], terms: list[dict]):
        self.shoes = shoes
        self.by_id = {s["id"]: s for s in shoes}
        self.terms = terms
        self.lines: dict[str, Line] = {}
        for s in shoes:
            key = s.get("lineKey") or f"id:{s['id']}"
            self.lines.setdefault(key, Line(key)).shoes.append(s)
        self._index = self._build_index()

    @classmethod
    def load(cls) -> "Catalog":
        # 이름 색인을 만드는 시간(310켤레 약 8~17ms)까지 catalog 칸에 — 안의 get_json 두 번은 바깥 칸에 든다(timing)
        with timing.stage("catalog"):
            return cls(http.get_json("/api/shoes"), http.get_json("/api/terms"))

    # ---------------------------------------------------------------- 색인
    def _names(self, s: dict) -> list[str]:
        names = [s.get("model") or "", s.get("modelEn") or ""]
        names += [a for a in (s.get("modelAlias") or "").split(",")]
        return [n.strip() for n in names if n and n.strip()]

    def _build_index(self) -> dict[str, tuple[bool, set[str]]]:
        """정규화한 이름 → (라인 전체 이름인가, 라인 키들). 전체 이름이 있으면 앞 낱말을 뗀 별칭보다 앞선다"""
        full: dict[str, set[str]] = {}
        part: dict[str, set[str]] = {}
        self._tokens: dict[str, set[str]] = {}   # 라인마다 이름 낱말 — 떼어 낸 별칭 앞에 다른 라인의 낱말이 붙었는지 본다
        for key, line in self.lines.items():
            for s in line.shoes:
                for name in self._names(s):
                    base = _strip_generation(name, s.get("generation"))
                    n = norm(base)
                    if not n:
                        continue
                    full.setdefault(n, set()).add(key)
                    tokens = [t for t in re.split(r"[\s\-]+", base) if t]
                    self._tokens.setdefault(key, set()).update(norm(t) for t in tokens if len(norm(t)) >= 2)
                    for i in range(1, len(tokens)):
                        tail = tokens[i:]
                        v = norm("".join(tail))
                        if len(v) < 3 or (len(tail) == 1 and tail[0].lower() in _STOP):
                            continue
                        part.setdefault(v, set()).add(key)
        index = {n: (True, keys) for n, keys in full.items()}
        for n, keys in part.items():
            if n not in index:
                index[n] = (False, keys)
        return index

    # ---------------------------------------------------------------- 찾기
    def find(self, message: str) -> list[Mention]:
        """문장 속 신발 — 앞에서부터, 겹치면 긴 이름이 이긴다"""
        m, where = _norm_with_index(message)
        hits: list[tuple[int, int, str]] = []
        for name in self._index:
            start = 0
            while (i := m.find(name, start)) >= 0:
                j = i + len(name)
                if self._bounded(m, i, j, name) and not self._foreign_prefix(m, i, name):
                    hits.append((i, j, name))
                start = i + 1
        hits.sort(key=lambda h: (-(h[1] - h[0]), h[0]))
        taken: list[tuple[int, int, str]] = []
        for h in hits:
            if all(h[1] <= t[0] or h[0] >= t[1] for t in taken):
                taken.append(h)
        taken.sort()
        out: list[Mention] = []
        seen: set[tuple[str, int | None]] = set()
        for i, j, name in taken:
            # 세대는 원문에서 읽는다 — 공백을 지운 뒤에 읽으면 "클리프톤 9 10"이 910, "고스트 17 GTX"가 17g 로 붙는다
            end = where[j - 1] + 1
            gen, used = self._generation_after(message, end)
            _, keys = self._index[name]
            text = m[i:j] + (str(gen) if gen is not None else "")
            if len(keys) > 1:
                cands = [self.lines[k] for k in sorted(keys)]
                out.append(Mention(text, None, gen, None, cands))
                continue
            line = self.lines[next(iter(keys))]
            if (line.key, gen) in seen:
                continue
            seen.add((line.key, gen))
            shoe = line.pick(gen)
            out.append(Mention(text, line, gen, shoe, generation_note=gen is None and line.multi_generation))
        return out

    def _foreign_prefix(self, m: str, i: int, name: str) -> bool:
        """떼어 낸 별칭("스카이") 바로 앞에 다른 라인의 이름 낱말("메타스피드")이 붙어 있으면 그 신발이 아니다"""
        is_full, keys = self._index[name]
        if is_full:
            return False
        mine = set().union(*(self._tokens.get(k, set()) for k in keys))
        before = m[:i]
        for key, toks in self._tokens.items():
            if key in keys:
                continue
            for t in toks:
                if t not in mine and before.endswith(t):
                    return True
        return False

    @staticmethod
    def _bounded(m: str, i: int, j: int, name: str) -> bool:
        """숫자 · 영문 이름은 앞뒤가 같은 종류 글자에 붙어 있으면 안 된다(188000원 속 880, cloud 속 on)"""
        def kind(ch: str) -> str:
            return "d" if ch.isdigit() else "l" if "a" <= ch <= "z" else "o"
        if i > 0 and kind(name[0]) != "o" and kind(m[i - 1]) == kind(name[0]):
            return False
        if j < len(m) and kind(name[-1]) == "l" and kind(m[j]) == "l":
            return False
        if j < len(m) and kind(name[-1]) == "d" and kind(m[j]) == "d":
            return False
        return True

    @staticmethod
    def _generation_after(text: str, j: int) -> tuple[int | None, int]:
        """이름 바로 뒤(공백 · 하이픈 · v 를 건너)의 숫자 하나 — 단위가 붙은 숫자(270mm · 15만원 · 3켤레)는 세대가 아니다"""
        g = re.match(r"[\s\-]*[vV]?\s*(\d{1,3})(?![\d.,]\d|\d|\s*(?:mm|㎜|g\b|그램|km|만|천|원|켤레|분|초|살|개|번|위|%|cm))", text[j:])
        if not g:
            return None, j
        # "270 사이즈"는 발 크기지만 "젤 카야노 32 사이즈 어때요"의 32 는 세대다 — 사이즈 앞 숫자는 신발 크기(200 이상)만 뺀다(5-2 평가에서 찾음)
        if int(g.group(1)) >= 200 and re.match(r"\s*사이즈", text[j + g.end():]):
            return None, j
        return int(g.group(1)), j + g.end()

    # ---------------------------------------------------------------- 이름 말하기
    @staticmethod
    def display(s: dict, first: bool = True) -> str:
        """처음 말할 때는 브랜드를 붙인다 — "아식스의 노바블라스트 5" """
        return f"{s['brand']}의 {s['model']}" if first else s["model"]


VERSION_PATH = "/api/internal/catalog-version"


def fetch_version() -> str:
    """같은 Pod 백엔드가 주는 카탈로그 판(shoes · terms 체크섬) — api/CatalogVersionController"""
    v = http.get_json(VERSION_PATH).get("version")
    if not isinstance(v, str) or not v:
        raise ValueError("판이 비었다")
    return v


class CatalogCache:
    """카탈로그를 한 번 읽어 두고, 턴마다 판(작은 GET 하나)만 물어 다르면 다시 읽는다(docs/09_chatbot_rag.md 19절).

    시간으로 만료시키지 않는다 — 신발이 바뀌면(관리 화면 · 적재기 · 리뷰 · 찜 · 손 SQL 어느 길이든) DB 체크섬이 바뀌어 판이 바뀐다.
    Pod 가 여럿이어도 판은 같은 DB 에서 나오므로 각 Pod 의 캐시가 따로 맞춰진다.
    정한 것(사용자 2026-11-14): 비우는 길은 이 체크섬 판(관리 API 마다 비우기를 끼우지 않는다), Pod 사이는 턴마다 판 묻기,
    최대 보관 시간은 두지 않는다(아래 실패 처리 때문에 옛 카탈로그로 답하는 경우가 없다).
    판을 묻다 실패하면(백엔드가 아직 안 뜸 · 옛 이미지 · 평가처럼 공개 주소) 이번 턴은 새로 읽는다 — 캐시 전과 같은 동작이고,
    낡은 카탈로그를 쓰지 않는다. 그다음 턴도 판을 다시 묻는다.
    """

    def __init__(self, fetch=Catalog.load, version=fetch_version):
        self.fetch = fetch
        self.version = version
        self._cat: Catalog | None = None
        self._ver: str | None = None
        self._lock = threading.Lock()
        self._warned = False
        self.reloads = 0   # 다시 읽은 횟수(시험 · 로그)

    def get(self) -> Catalog:
        with timing.stage("catalog"):   # 판 묻기 · 다시 읽기 모두 catalog 칸
            try:
                v = self.version()
            except Exception as e:   # noqa: BLE001
                v = None
                if not self._warned:
                    print(f"[catalog] 판을 묻지 못했다 — 판을 알 때까지 턴마다 새로 읽는다: {e!r}")
                    self._warned = True
            with self._lock:   # 여러 턴이 함께 다시 읽지 않게(한 번 읽고 나머지는 그것을 쓴다)
                if v is None or self._cat is None or v != self._ver:
                    self._cat = self.fetch()
                    self._ver = v   # None 이면 다음 턴에 다시 읽는다
                    self.reloads += 1
                    if v is not None:
                        self._warned = False
                return self._cat
