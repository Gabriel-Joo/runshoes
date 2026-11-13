"""색인 살림 — 시작 때 전량 임베딩, 10분마다 해시가 바뀐 것만 다시(작업 5-2 사용자 6, 09 16절).

- 준비 전(ready=False)에는 경험 · 후기만 "잠시 뒤" 답한다. 다른 갈래는 색인을 쓰지 않는다
- 읽는 곳은 같은 Pod 의 Spring(`/api/shoes` · `/api/reviews`) — 첫 동기화 전에 Spring 준비(readiness)를 3분까지 기다리고,
  그 뒤 실패하면 15초마다 다시
- 파일 캐시는 `CHATBOT_INDEX_CACHE`(파일 경로)가 있을 때만. 지금 운영은 쓰지 않는다(볼륨 없음 — 09 16절 PVC 판단).
  열쇠는 임베딩 모델 이름 @ revision + 문서 해시 — 모델이 바뀌면 통째로 버린다
"""

from __future__ import annotations

import os
import threading
import time

import numpy as np

from .. import http
from . import corpus
from .embed import Embedder
from .memory import MemoryIndex

REFRESH_SEC = int(os.environ.get("CHATBOT_INDEX_REFRESH_SEC", "600"))
RETRY_SEC = 15
CACHE = os.environ.get("CHATBOT_INDEX_CACHE", "")
# 첫 동기화 전에 같은 Pod 백엔드 준비를 기다린다(5-2 운영 뒤, 사용자 승인 2026-11-13) — Spring + Flyway 가 25~30초 걸려
# 배포마다 Pod 마다 "동기화 실패: ConnectionError" 한 줄이 남았다(로그에 늘 남으면 진짜 에러를 못 찾는다).
# 경로는 쿠버네티스 readinessProbe 와 같다(infra apps/runshoes/app/deployment.yaml · backend application.yml management)
READY_PATH = "/actuator/health/readiness"
READY_EVERY_SEC = 2
READY_WAIT_SEC = 180      # 백엔드 startupProbe(2초 × 60 = 2분)보다 넉넉히. 넘으면 기다림을 그만두고 그대로 동기화(실패는 실패 줄로)


def fetch_api() -> tuple[list[dict], list[dict]]:
    return http.get_json("/api/shoes"), http.get_json("/api/reviews")


def backend_ready() -> bool:
    return http.status(READY_PATH) == 200


class Searcher:
    def __init__(self, index: MemoryIndex | None = None, embedder: Embedder | None = None, fetch=fetch_api,
                 cache_path: str = CACHE, refresh_sec: int = REFRESH_SEC, ready_check=backend_ready,
                 now=time.monotonic, sleep=time.sleep):
        self.index = index or MemoryIndex()
        self.embedder = embedder or Embedder()
        self.fetch = fetch
        self.cache_path = cache_path
        self.refresh_sec = refresh_sec
        self.ready = False
        self.last: dict = {}          # 마지막 동기화 기록(로그 · 평가)
        self._model_key: str | None = None
        self._ready_check, self._now, self._sleep = ready_check, now, sleep

    # ------------------------------------------------------------------ 살림
    def start(self) -> threading.Thread:
        t = threading.Thread(target=self._loop, daemon=True, name="search-index")
        t.start()
        return t

    def wait_backend(self) -> bool:
        """첫 동기화 전에만 — 같은 Pod 백엔드가 준비될 때까지 READY_EVERY_SEC 마다 확인, READY_WAIT_SEC 까지.
        준비되면 정상 로그 한 줄. 기다리는 동안 확인 실패는 찍지 않는다(그게 이 기다림의 목적). 못 기다리면 False"""
        t0 = self._now()
        while True:
            if self._ready_check():
                print(f"[search] 백엔드 준비 확인 — {round(self._now() - t0)}초 기다림")
                return True
            if self._now() - t0 >= READY_WAIT_SEC:
                print(f"[search] 백엔드 준비를 {READY_WAIT_SEC}초 기다리지 못했다 — 그대로 동기화를 시작한다")
                return False
            self._sleep(READY_EVERY_SEC)

    def _loop(self) -> None:
        self.wait_backend()   # 그 뒤(10분 갱신 포함)의 실패는 지금처럼 모두 실패 줄
        while True:
            try:
                self.sync()
                self._sleep(self.refresh_sec)
            except Exception as e:   # noqa: BLE001 — 실패해도 이전 색인으로 계속 답한다
                print(f"[search] 동기화 실패: {e!r}")
                self._sleep(RETRY_SEC if not self.ready else self.refresh_sec)

    def sync(self) -> dict:
        t0 = time.time()
        shoes, reviews = self.fetch()
        docs = corpus.build(shoes, reviews)
        del shoes, reviews
        key = self.embedder.model_key()
        if self._model_key is not None and key != self._model_key:
            # 임베딩 모델이 바뀌었다 — 옛 벡터와 새 질의 벡터는 같은 공간이 아니다. 통째로 다시
            print(f"[search] 임베딩 모델이 바뀌었다: {self._model_key} → {key}")
            self.index.delete(list(self.index.ids_with_hash()))
            self.ready = False
        self._model_key = key
        have = self.index.ids_with_hash()
        cached = self._load_cache(key) if not have else {}
        todo, reuse = [], []
        for d in docs:
            if have.get(d.doc_id) == d.hash:
                continue
            v = cached.get(d.hash)
            if v is not None:
                d.vec = v
                reuse.append(d)
            else:
                todo.append(d)
        if todo:
            vecs = self.embedder.embed([d.embed_text for d in todo])
            for d, v in zip(todo, vecs):
                d.vec = v
            del vecs
        changed = reuse + todo
        self.index.upsert(changed)
        gone = sorted(set(have) - {d.doc_id for d in docs})
        self.index.delete(gone)
        if self.cache_path and (changed or gone):
            self._save_cache(key)
        self.ready = True
        self.last = {"docs": len(docs), "embedded": len(todo), "from_cache": len(reuse), "deleted": len(gone),
                     "sec": round(time.time() - t0, 2), "at": time.strftime("%H:%M:%S")}
        if changed or gone or not have:
            print(f"[search] 색인 {self.last}")
        return self.last

    # ------------------------------------------------------------------ 파일 캐시(선택)
    def _load_cache(self, key: str) -> dict:
        if not self.cache_path or not os.path.exists(self.cache_path):
            return {}
        try:
            with np.load(self.cache_path, allow_pickle=False) as z:
                if str(z["model_key"]) != key:
                    print("[search] 캐시의 임베딩 모델이 다르다 — 버린다")
                    return {}
                return dict(zip(z["hashes"].tolist(), z["vecs"]))
        except Exception as e:   # noqa: BLE001 — 깨진 캐시는 없는 것과 같다
            print(f"[search] 캐시 읽기 실패: {e!r}")
            return {}

    def _save_cache(self, key: str) -> None:
        ids = list(self.index.ids_with_hash().items())
        have, mat = self.index.vectors([d for d, _ in ids])
        hashes = dict(ids)
        tmp = f"{self.cache_path}.{os.getpid()}.tmp.npz"
        try:
            np.savez(tmp, model_key=np.array(key), hashes=np.array([hashes[d] for d in have]), vecs=mat)
            os.replace(tmp, self.cache_path)   # 두 Pod 가 같은 파일을 써도 반쯤 쓴 파일을 읽지 않게
        except Exception as e:   # noqa: BLE001
            print(f"[search] 캐시 쓰기 실패: {e!r}")
            try:
                os.remove(tmp)
            except OSError:
                pass

    # ------------------------------------------------------------------ 찾기
    def query_vec(self, text: str):
        return self.embedder.embed_one(text)

    def search(self, text: str, k: int = 20, filter: dict | None = None, qvec=None):
        q = self.query_vec(text) if qvec is None else qvec
        return self.index.search(q, text, k, filter)
