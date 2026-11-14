"""한 턴의 단계별 시간 — 턴 기록(V19 chatbot_turns)의 *_ms 칸.

한 턴은 한 스레드에서 돈다(server 가 run_in_executor 로 bot.turn 을 부른다). 그래서 스레드마다 따로 잰다.

- router     라우터(규칙 + 라우터 LLM 한 번)
- search     검색 — 질문 임베딩(model-service) · 색인 찾기 · 리뷰 벡터 읽기
- gen        생성 LLM — 라우터 밖의 llm.chat 전부(경험·후기의 관점 분류 LLM 도 여기에 든다)
- catalog    Spring 카탈로그 읽기 — GET /api/shoes · /api/terms(Catalog.load)와 카탈로그 판 확인
- compare    GET /api/compare(비교, 경험·후기의 스펙 낱말)
- recommend  GET /api/recommend
- review     GET /api/reviews(경험·후기 — 신발마다)
- summary    GET /api/shoes/{id}/summary(경험·후기 요약 블록)
  Spring API 읽기는 http.get_json 이 주소로 칸을 고른다(http.api_stage).

단계 안에서 다른 단계를 부르면 바깥 단계에만 센다(라우터 안의 llm.chat 은 router 이지 gen 이 아니다).
칸을 모두 더하면 전체(latency_ms)와 몇 ms 안에서 맞는다 — 남는 것은 이름 찾기 · 검사 같은 파이썬 코드뿐이다
(2026-11-14 조사 — 평균 1ms, 최대 3ms. 사용자 결정으로 그 둘에는 칸을 두지 않는다).
그 턴에 쓰지 않은 단계는 0 이다(NULL 이 아니다 — 「안 씀」과 「0ms」를 가를 일이 없고, 합 검사 · 평균이 단순해진다).
begin() 을 부르지 않은 스레드(평가의 몸풀기, 색인 갱신 스레드, 경험·후기가 신발마다 띄우는 생성 스레드)에서는 재지 않는다 —
그 병렬 생성은 부른 쪽이 통째로 gen 으로 잰다(branches/experience.py).
"""

from __future__ import annotations

import threading
import time
from contextlib import contextmanager

STAGES = ("router", "search", "gen", "catalog", "compare", "recommend", "review", "summary")
_local = threading.local()


def begin() -> None:
    _local.ms = {k: 0.0 for k in STAGES}
    _local.depth = 0


def take() -> dict[str, int]:
    """재던 것을 ms(정수)로 돌려주고 멈춘다"""
    ms = getattr(_local, "ms", None) or {k: 0.0 for k in STAGES}
    _local.ms = None
    return {f"{k}_ms": int(round(v)) for k, v in ms.items()}


@contextmanager
def stage(name: str | None):
    """name 이 None 이면 재지 않는다(어느 칸에도 들지 않는 API 주소)"""
    ms = getattr(_local, "ms", None)
    if name is None or ms is None or _local.depth > 0:
        yield
        return
    _local.depth += 1
    t0 = time.perf_counter()
    try:
        yield
    finally:
        ms[name] += (time.perf_counter() - t0) * 1000
        _local.depth -= 1
