"""색인 살림 — 시작 때 전량 임베딩, 10분마다 해시가 바뀐 것만 다시(작업 5-2 사용자 6, 09 16절).

- 준비 전(ready=False)에는 경험 · 후기만 "잠시 뒤" 답한다. 다른 갈래는 색인을 쓰지 않는다
- 읽는 곳은 같은 Pod 의 Spring(`/api/shoes` · `/api/reviews`) — 뜰 때 Spring 이 아직이면 15초마다 다시
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


def fetch_api() -> tuple[list[dict], list[dict]]:
    return http.get_json("/api/shoes"), http.get_json("/api/reviews")


class Searcher:
    def __init__(self, index: MemoryIndex | None = None, embedder: Embedder | None = None, fetch=fetch_api,
                 cache_path: str = CACHE, refresh_sec: int = REFRESH_SEC):
        self.index = index or MemoryIndex()
        self.embedder = embedder or Embedder()
        self.fetch = fetch
        self.cache_path = cache_path
        self.refresh_sec = refresh_sec
        self.ready = False
        self.last: dict = {}          # 마지막 동기화 기록(로그 · 평가)
        self._model_key: str | None = None

    # ------------------------------------------------------------------ 살림
    def start(self) -> threading.Thread:
        t = threading.Thread(target=self._loop, daemon=True, name="search-index")
        t.start()
        return t

    def _loop(self) -> None:
        while True:
            try:
                self.sync()
                time.sleep(self.refresh_sec)
            except Exception as e:   # noqa: BLE001 — 실패해도 이전 색인으로 계속 답한다
                print(f"[search] 동기화 실패: {e!r}")
                time.sleep(RETRY_SEC if not self.ready else self.refresh_sec)

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
