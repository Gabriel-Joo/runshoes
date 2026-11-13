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
# 컨텍스트 — 주지 않으면 Ollama(0.34) 기본 4,096 으로 뜬다(모델 자체는 131,072). 5-2 의 리뷰 30건 + 설명문 + 통증 시스템 + 대화 4줄이
# 최대 약 4,460토큰 + 답 1,500 이라 8,192(사용자 2026-11-12). 8,192 로 띄워도 VRAM 3.23GB 로 4,096 과 같았다
NUM_CTX = int(os.environ.get("CHATBOT_NUM_CTX", "8192"))


def chat(system: str, messages: list[dict], *, json_mode: bool = False, temperature: float = 0.3, num_predict: int = 1500) -> str:
    body = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": False,
        "think": False,   # gemma4 는 생각 모드가 있다 — 켜 두면 num_predict 를 생각에 다 써서 본문이 비어 온다(2026-11-12 확인)
        "options": {"temperature": temperature, "top_p": 0.9, "num_predict": num_predict, "num_ctx": NUM_CTX},
    }
    if json_mode:
        body["format"] = "json"
    r = requests.post(f"{OLLAMA_URL}/api/chat", json=body, headers=CF_HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if data.get("done_reason") == "length":   # 잘린 답은 내보내지 않는다 — 부른 쪽이 코드 답을 쓴다
        raise ValueError("num_predict 에서 잘렸다")
    return data["message"]["content"].strip()


def chat_json(system: str, user: str, num_predict: int = 300) -> dict:
    """JSON 하나 — 깨지면 예외(부른 쪽이 기본값을 쓴다)"""
    out = chat(system, [{"role": "user", "content": user}], json_mode=True, temperature=0, num_predict=num_predict)
    data = json.loads(out)
    if not isinstance(data, dict):
        raise ValueError("JSON 객체가 아니다")
    return data
