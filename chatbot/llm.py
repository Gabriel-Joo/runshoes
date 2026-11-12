"""Ollama — gemma4:e4b(09 9절, 바꾸지 않는다). 함수 호출에 기대지 않고 JSON 은 format: json 으로 받는다"""

from __future__ import annotations

import json
import os

import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "https://ollama.ronanlab.dev").rstrip("/")
MODEL = os.environ.get("CHATBOT_MODEL", "gemma4:e4b")
CF_HEADERS = {
    "CF-Access-Client-Id": os.environ.get("CF_ACCESS_CLIENT_ID", ""),
    "CF-Access-Client-Secret": os.environ.get("CF_ACCESS_CLIENT_SECRET", ""),
}
TIMEOUT = 60


def chat(system: str, messages: list[dict], *, json_mode: bool = False, temperature: float = 0.3, num_predict: int = 1500) -> str:
    body = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": False,
        "think": False,   # gemma4 는 생각 모드가 있다 — 켜 두면 num_predict 를 생각에 다 써서 본문이 비어 온다(2026-11-12 확인)
        "options": {"temperature": temperature, "top_p": 0.9, "num_predict": num_predict},
    }
    if json_mode:
        body["format"] = "json"
    r = requests.post(f"{OLLAMA_URL}/api/chat", json=body, headers=CF_HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if data.get("done_reason") == "length":   # 잘린 답은 내보내지 않는다 — 부른 쪽이 코드 답을 쓴다
        raise ValueError("num_predict 에서 잘렸다")
    return data["message"]["content"].strip()


def chat_json(system: str, user: str) -> dict:
    """JSON 하나 — 깨지면 예외(부른 쪽이 기본값을 쓴다)"""
    out = chat(system, [{"role": "user", "content": user}], json_mode=True, temperature=0, num_predict=300)
    data = json.loads(out)
    if not isinstance(data, dict):
        raise ValueError("JSON 객체가 아니다")
    return data
