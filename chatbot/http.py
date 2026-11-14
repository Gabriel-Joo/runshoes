"""런슈즈 Spring API — 같은 Pod 의 127.0.0.1:3000(사이드카). 계산은 Spring 한 곳에만 둔다(09 0절 원칙 2)"""

from __future__ import annotations

import os

import re

import requests

from . import timing

API = os.environ.get("RUNSHOES_API", "http://127.0.0.1:3000").rstrip("/")
TIMEOUT = 10
LOG_TIMEOUT = 3   # 턴 기록(V19) — 따로 도는 스레드라 답을 막지 않지만, 백엔드가 멈췄을 때 스레드가 오래 쌓이지 않게 짧게

_SUMMARY = re.compile(r"^/api/shoes/\d+/summary$")


def api_stage(path: str) -> str | None:
    """턴 기록의 어느 시간 칸에 셀지 — 주소로 고른다(chatbot/timing.py). 칸이 없는 주소는 None(재지 않는다)"""
    if _SUMMARY.match(path):
        return "summary"
    if path in ("/api/shoes", "/api/terms", "/api/internal/catalog-version"):
        return "catalog"
    return {"/api/compare": "compare", "/api/recommend": "recommend", "/api/reviews": "review"}.get(path)


def get_json(path: str, params: dict | None = None):
    with timing.stage(api_stage(path)):
        r = requests.get(f"{API}{path}", params=params, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
        # 응답 객체(연결 · TLS 소켓)를 칸 안에서 놓는다 — 함수가 돌려준 뒤에 놓이면 호출마다 0.5~1ms 가 어느 칸에도 들지 않았다
        # (2026-11-14 평가 — 리뷰를 다섯 번 읽는 문항에서 칸 합이 전체와 6~16ms 어긋남)
        del r
    return data


def status(path: str, timeout: float = 2) -> int | None:
    """GET 상태 코드만 — 닿지 않으면 None(예외 · 로그 없이). 같은 Pod 백엔드 준비 확인용(search.service)"""
    try:
        return requests.get(f"{API}{path}", timeout=timeout).status_code
    except requests.RequestException:
        return None


def post_json(path: str, body: dict, timeout: float = TIMEOUT) -> int:
    r = requests.post(f"{API}{path}", json=body, timeout=timeout)
    return r.status_code


def me_user_id(token: str, timeout: float = 3) -> tuple[int | None, int | None]:
    """챗봇 로그인 확인 — (GET /api/me 상태 코드, 계정 id). 닿지 않으면 (None, None).
    턴 기록(V19)이 계정 id 를 쓴다. 토큰은 헤더로만 보내고 어디에도 찍지 않는다"""
    try:
        r = requests.get(f"{API}/api/me", headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
    except requests.RequestException:
        return None, None
    uid = None
    if r.status_code == 200:
        try:
            v = r.json().get("id")
            uid = v if isinstance(v, int) and not isinstance(v, bool) else None
        except (ValueError, AttributeError):
            uid = None
    return r.status_code, uid
