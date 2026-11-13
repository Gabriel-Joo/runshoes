"""MemoryIndex — 벡터는 float32 행렬 하나, BM25 는 본문으로(09 1절: 3,438문서 × 1024차원 ≈ 14MB, 전수 비교).

벡터는 정규화돼 온다(model-service normalize 기본 true) — 내적이 곧 코사인이다.
Pod 마다 따로 가진다. 두 Pod 의 색인은 갱신 시각이 달라 잠깐 다를 수 있다(10분 안).
"""

from __future__ import annotations

import threading

import numpy as np

from .bm25 import BM25
from .index import Filter, Hit, rrf

CANDIDATES = 200   # 섞기 전에 갈래마다 볼 후보 수


class MemoryIndex:
    def __init__(self, dim: int = 1024):
        self.dim = dim
        self._lock = threading.Lock()
        self._ids: list[str] = []
        self._docs: dict[str, object] = {}       # doc_id → corpus.Doc(vec 은 떼어 둔다 — 행렬에만)
        self._mat = np.zeros((0, dim), dtype=np.float32)
        self._bm25 = BM25([])
        self._kinds = np.zeros(0, dtype=np.int8)
        self._shoes = np.zeros(0, dtype=np.int32)

    def __len__(self) -> int:
        return len(self._ids)

    # ------------------------------------------------------------------ 바꾸기 — 행렬을 새로 만들어 한 번에 갈아 끼운다(읽는 쪽은 락 안에서 참조만 잡는다)
    def upsert(self, docs: list) -> None:
        if not docs:
            return
        with self._lock:
            pos = {d: i for i, d in enumerate(self._ids)}
            ids, mat = list(self._ids), self._mat
            new_rows, new_ids = [], []
            replace = {}
            for d in docs:
                v = np.asarray(d.vec, dtype=np.float32).reshape(self.dim)
                if d.doc_id in pos:
                    replace[pos[d.doc_id]] = v
                else:
                    new_rows.append(v)
                    new_ids.append(d.doc_id)
                    pos[d.doc_id] = len(ids) + len(new_ids) - 1
                d.vec = None
                self._docs[d.doc_id] = d
            if replace:
                mat = mat.copy()
                for i, v in replace.items():
                    mat[i] = v
            if new_rows:
                mat = np.vstack([mat, np.stack(new_rows)]) if len(mat) else np.stack(new_rows)
            self._swap(ids + new_ids, mat)

    def delete(self, doc_ids: list[str]) -> None:
        gone = set(doc_ids)
        if not gone:
            return
        with self._lock:
            keep = [i for i, d in enumerate(self._ids) if d not in gone]
            for d in gone:
                self._docs.pop(d, None)
            self._swap([self._ids[i] for i in keep], self._mat[keep] if keep else np.zeros((0, self.dim), dtype=np.float32))

    def _swap(self, ids: list[str], mat) -> None:
        docs = [self._docs[d] for d in ids]
        self._bm25 = BM25([d.text for d in docs])
        self._kinds = np.array([0 if d.kind == "review" else 1 for d in docs], dtype=np.int8)
        self._shoes = np.array([d.shoe_id for d in docs], dtype=np.int32)
        self._ids, self._mat = ids, mat

    def ids_with_hash(self) -> dict[str, str]:
        with self._lock:
            return {d: self._docs[d].hash for d in self._ids}

    def get(self, doc_id: str):
        return self._docs.get(doc_id)

    def vectors(self, doc_ids: list[str]):
        """문서 벡터(없는 것은 빼고) — (ids, 행렬)"""
        with self._lock:
            pos = {d: i for i, d in enumerate(self._ids)}
            have = [d for d in doc_ids if d in pos]
            return have, self._mat[[pos[d] for d in have]] if have else np.zeros((0, self.dim), dtype=np.float32)

    # ------------------------------------------------------------------ 찾기
    def search(self, query_vec, query_text: str, k: int, filter: dict | None = None) -> list[Hit]:
        with self._lock:
            ids, mat, bm, kinds, shoes = self._ids, self._mat, self._bm25, self._kinds, self._shoes
        if not ids:
            return []
        f = Filter.of(filter)
        mask = np.ones(len(ids), dtype=bool)
        if f.kind is not None:
            mask &= kinds == (0 if f.kind == "review" else 1)
        if f.shoe_ids:
            mask &= np.isin(shoes, list(f.shoe_ids))
        allowed = np.nonzero(mask)[0]
        if not len(allowed):
            return []
        cos = mat[allowed] @ np.asarray(query_vec, dtype=np.float32)
        top = allowed[np.argsort(-cos)[:CANDIDATES]]
        cos_of = dict(zip(allowed.tolist(), cos.tolist()))
        bm_all = bm.scores(query_text)
        bm_rank = sorted((i for i in bm_all if mask[i]), key=lambda i: -bm_all[i])[:CANDIDATES]
        vec_rank = top.tolist()
        fused = rrf([vec_rank, bm_rank])
        vpos = {i: r for r, i in enumerate(vec_rank)}
        bpos = {i: r for r, i in enumerate(bm_rank)}
        out = []
        for i, s in sorted(fused.items(), key=lambda kv: -kv[1])[:k]:
            d = self._docs.get(ids[i])
            if d is None:   # 찾는 사이 갱신이 지웠다
                continue
            out.append(Hit(d.doc_id, d.kind, d.shoe_id, d.text, d.meta, s, cos_of.get(i), bpos.get(i), vpos.get(i), s))
        return out
