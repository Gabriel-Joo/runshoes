"""런슈즈 Spring API — 같은 Pod 의 127.0.0.1:3000(사이드카). 계산은 Spring 한 곳에만 둔다(09 0절 원칙 2)"""

from __future__ import annotations

import os

import requests

API = os.environ.get("RUNSHOES_API", "http://127.0.0.1:3000").rstrip("/")
TIMEOUT = 10


def get_json(path: str, params: dict | None = None):
    r = requests.get(f"{API}{path}", params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def post_json(path: str, body: dict) -> int:
    r = requests.post(f"{API}{path}", json=body, timeout=TIMEOUT)
    return r.status_code
