"""Embedder — model-service `/embed`(KURE-v1, 09 2절). 색인 밖에 둔다(색인은 벡터를 받기만 한다).

- 주소 `MODEL_SERVICE_URL`(운영 http://192.168.122.1:8200 — 인프라 매니페스트가 넣는다, OLLAMA_URL 과 같은 자리).
  코드에 기본값을 두지 않는다(사용자 2026-11-13). 없으면 server 가 색인을 만들지 않는다 — 경험·후기는 "잠시 뒤", 특성 설명은 사전만,
  다른 갈래와 서버 시작은 그대로
- 한 번에 256건까지(서비스 상한). 받은 배치는 바로 float32 로 바꾼다 — 파이썬 float 목록으로 쌓으면 3,438건에
  최대 메모리가 207MB 였다(컨테이너 상한 256Mi, 2026-11-12 측정)
- model_key() — 모델 이름 @ revision. 파일 캐시의 열쇠라 모델이 바뀌면 저장된 벡터를 버린다
"""

from __future__ import annotations

import os

import numpy as np
import requests

URL = os.environ.get("MODEL_SERVICE_URL", "").strip().rstrip("/")
BATCH = 256
TIMEOUT = 60
DIM = 1024


class Embedder:
    def __init__(self, url: str | None = None, batch: int = BATCH):
        self.url = (url if url is not None else URL).rstrip("/")
        if not self.url:
            raise ValueError("MODEL_SERVICE_URL 이 없다")
        self.batch = batch

    def model_key(self) -> str:
        r = requests.get(f"{self.url}/health", timeout=10)
        r.raise_for_status()
        m = r.json()["models"]["embedding"]
        return f"{m['name']}@{m['revision']}"

    def embed(self, texts: list[str]) -> np.ndarray:
        out = np.zeros((len(texts), DIM), dtype=np.float32)
        for i in range(0, len(texts), self.batch):
            r = requests.post(f"{self.url}/embed", json={"texts": texts[i:i + self.batch], "normalize": True}, timeout=TIMEOUT)
            r.raise_for_status()
            out[i:i + self.batch] = np.asarray(r.json()["vectors"], dtype=np.float32)
            del r
        return out

    def embed_one(self, text: str) -> np.ndarray:
        return self.embed([text])[0]
