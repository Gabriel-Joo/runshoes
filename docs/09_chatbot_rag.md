<!--
다루는 곳: chatbot/, Dockerfile.chatbot, backend/src/main/java/com/kopo17/runshoes/compare/, backend/src/main/java/com/kopo17/runshoes/summary/, backend/src/main/java/com/kopo17/runshoes/api/, backend/src/main/java/com/kopo17/runshoes/domain/, backend/src/main/resources/db/migration/, backend/src/main/resources/application-batch.yml, src/components/, src/utils/, src/pages/, scripts/parity/, backend/src/main/java/com/kopo17/runshoes/auth/, backend/src/main/java/com/kopo17/runshoes/activity/, backend/src/main/resources/application.yml, src/auth/, backend/src/test/java/com/kopo17/runshoes/api/
읽은 커밋: 606b730
-->
# 09 챗봇 RAG 설계
> 상태: 2026-11-17 코드와 맞춰 봄. **설계 확정**(2026-11-10 사용자, 웹 클로드와 논의해 확정). 5단계의 1단계(작업 5-1, 용어, 스펙, 비교, 추천)는 운영 반영 끝(2026-11-12, `archive/09_chatbot_rag_log.md` 옛 15절). 2단계(작업 5-2, 검색, 경험과 후기)는 로컬 구현, 평가 끝(2026-11-12, `archive/09_chatbot_rag_log.md` 옛 16절) 뒤 운영 반영(2026-11-13, main `6bb9b1f`, 이미지 `6bb9b1ff4e8d`, `HISTORY.md` 11-13 줄). 작업 지시서는 단계별로 따로 받는다(3-1절). 결정과 근거를 담은 문서다. cc 설계안(같은 날 Claude Code 가 낸 안)과 다른 부분은 **(변경)** 을 붙였다. 숫자는 운영 공개 API(`GET /api/shoes` 310켤레, `/api/reviews` 1,800건, `/api/terms` 13개, 2026-11-10, 2026-11-17 에도 같은 수)와 서버 PC 확인(`nvidia-smi`, `docker ps`, Milvus `list_collections`)으로 센 것. [c:b11e139] [c:6bb9b1f] [docs:HISTORY.md] <!-- 확인 못 함: 서버 PC 확인(nvidia-smi, docker ps, Milvus list_collections)은 저장소 밖 -->

#### 0. 한 줄 요약

질문이 들어오면 여섯 갈래로 나눈다. [code:chatbot/router.py:20]

#### 1. 최종 설계

#### 1-1. 전체 그림


| 갈래 | 답을 만드는 곳 | 검색 | 생성 |
|---|---|---|---|
| 용어 | 사전 그대로 | 없음 | 없음 [code:chatbot/terms.py:1] [code:chatbot/branches/term.py:11-18] |
| 스펙 | Spring API | 없음 | 있음 [code:chatbot/branches/spec.py:1] [code:chatbot/branches/spec.py:23] |
| 비교 | Spring `/api/compare` | 없음 | 있음 [code:chatbot/branches/compare.py:26] [code:chatbot/branches/compare.py:33] |
| 추천 | Spring `/api/recommend` | 없음 | 있음 [code:chatbot/branches/recommend.py:160] [code:chatbot/branches/recommend.py:96] |
| 특성 설명 | 용어 사전 + 설명문 문장(통증 질문은 사전만) | 있음 | 있음 [code:chatbot/branches/explain.py:83-85] [code:chatbot/branches/explain.py:68-77] |
| 경험과 후기 | 하이브리드 검색 + 리뷰 집계 | 있음 | 있음 [code:chatbot/branches/experience.py:1-10] [code:chatbot/search/memory.py:106-112] |

원칙 셋

1. **수치는 코드가 넣는다.** LLM 이 지어내지 못하게 한다. [code:chatbot/facts.py:1] [code:chatbot/reply.py:200-204]
2. **계산은 Spring 한 곳에만 둔다.** 화면과 챗봇이 같은 답을 낸다. [code:chatbot/http.py:1] [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:18-22]
3. **생성이 필요 없는 갈래는 생성하지 않는다** (GPU 절약 + 속도). [code:chatbot/branches/term.py:1]

#### 1-2. 검색, 벡터 DB 쓰지 않는다

**결정:** 메모리 색인 + BM25 하이브리드. Milvus 쓰지 않는다. [code:chatbot/search/memory.py:1] [code:chatbot/search/memory.py:92-121] [code:chatbot/search/bm25.py:1-4]

근거

- 문서 3,438건(리뷰 1,800 + 설명문 문장 1,638. 310켤레를 문장 단위로 쪼갠 수, 1-12절, 2026-11-12 셈. 설계 때 어림은 약 3,660). 1024차원 float32 로 약 14MB. 전수 비교해도 1ms 안쪽이다. [code:chatbot/search/memory.py:1] [code:chatbot/search/embed.py:21] [c:b11e139]
- 런슈즈 데이터는 계속 바뀐다(방문자 리뷰, 관리자 스펙 수정). Milvus 면 upsert 와 삭제 동기화를 상시 관리해야 한다. 메모리 색인은 주기적으로 API 를 읽어 바뀐 것만 재임베딩하면 끝이다. [code:chatbot/search/service.py:1] [code:chatbot/search/service.py:98-118]
- 호스트 Milvus 는 펫퍼민트가 쓰는 임시 docker standalone 이다(`milvus-standalone`, `milvusdb/milvus:v3.0.2`, 컬렉션은 `petmint_*` 8개와 `hr_regulation`). 거기 의존하면 펫퍼민트 작업에 런슈즈가 묶인다. <!-- 확인 못 함: 호스트 Milvus 와 펫퍼민트 컬렉션은 저장소 밖 -->

단점과 대응

| 단점 | 대응 |
|---|---|
| Pod 시작 시 전량 임베딩 | 지금 약 10초(`archive/09_chatbot_rag_log.md` 옛 16절). 10분마다 해시로 바뀐 것만 재계산. 파일 캐시는 코드만 두고 쓰지 않는다. 볼륨이 없다(`archive/09_chatbot_rag_log.md` 옛 16절 「저장공간」) [code:chatbot/search/service.py:23] [code:chatbot/search/service.py:6] [code:chatbot/search/service.py:129-131] (2026-11-12 기준) [c:b11e139] |
| 검색 로직 직접 구현 | 이 규모에선 각 수십 줄 [code:chatbot/search/bm25.py:29-56] [code:chatbot/search/memory.py:92-121] |
| Pod 마다 색인을 따로 가진다(지금 2개) | 14MB 라 메모리는 문제 아님. 갱신 시각이 Pod 마다 달라 최대 10분 동안 두 Pod 의 색인이 다를 수 있다. 리뷰 집계(분모)는 답할 때마다 API 를 새로 읽으므로 숫자는 갈리지 않는다 [code:chatbot/search/memory.py:4] [code:chatbot/branches/experience.py:5] [code:chatbot/branches/experience.py:362] <!-- 확인 못 함: replicas 수는 인프라 저장소 매니페스트 --> |

교체 가능하게 둔다

`SearchIndex` 인터페이스로 추상화하고 `MemoryIndex` 를 구현한다. 챗봇 코드는 인터페이스만 부른다. 아래 중 하나라도 넘으면 벡터 DB 로 바꾼다. [code:chatbot/search/index.py:1-3] [code:chatbot/search/index.py:37-41] [code:chatbot/search/memory.py:19]

- 문서 1만 건 초과. 3,438건 기준으로도 그대로 둔다. 1만 건은 리뷰가 두 배 넘게 늘어야 닿는 수치이고, 그 지점이면 리뷰 전량 주입(1-7절) 등도 같이 다시 볼 시점이다(2026-11-10 사용자) (2026-11-12 기준) [c:b11e139]
- Pod 시작 임베딩 30초 초과. 지금 단독 약 9초, 두 Pod 동시 각 약 17초(`archive/09_chatbot_rag_log.md` 옛 16절). 리뷰 약 9,400건(단독), 약 4,600건(동시)부터 넘는다 (2026-11-12 기준) [c:b11e139]
- Pod 3개 이상, 또는 색인이 Pod 마다 달라 답이 갈릴 때. 2개는 위 표처럼 중복 보유로 버틴다(2026-11-12 사용자. 처음 기준은 "Pod 2개 이상"이었는데, 5-1 운영이 이미 replicas 2 였다). 3개부터는 시작 임베딩이 model-service 에 세 갈래로 몰리고, 갱신 시각 차이로 같은 질문에 다른 신발이 나오는 일이 사용자 눈에 띌 수 있다 <!-- 확인 못 함: replicas 2 는 인프라 저장소 매니페스트 -->

BM25 를 같이 쓰는 이유

리뷰 중앙값이 44자다. 짧은 글에서 임베딩은 뭉뚱그려진다. "발볼", "뒤꿈치" 같은 낱말 일치와 PEBA, EVA, TPU 같은 고유명사는 BM25 가 정확하다. 한국어 토큰은 글자 2-gram 으로 시작하고 평가로 확인한다. [code:chatbot/search/bm25.py:1-4] [code:chatbot/search/bm25.py:18-26] (2026-11-10 기준) [c:e0a0bd8]

#### 1-3. 임베딩과 리랭커, model-service 로 분리 (변경)

cc안은 bge-m3 를 Ollama 에 올리는 것이었으나, **KURE-v1 을 쓰되 펫퍼민트 서비스에 끼워 넣지 않는다. KURE-v1 과 bge-reranker-v2-m3 를 함께 두 프로젝트 공용 서비스로 분리한다.** [code:chatbot/search/embed.py:1] <!-- 확인 못 함: model-service 와 펫퍼민트는 저장소 밖 -->

model-service (호스트 프로세스, 모델은 지금 그대로. KURE-v1 fp32, bge-reranker-v2-m3 fp16 1024토큰) <!-- 확인 못 함: model-service 의 모델과 정밀도는 저장소 밖 -->

- `POST /embed`, 텍스트[] → 벡터[] [code:chatbot/search/embed.py:37-44]
- `POST /rerank`, 질의 + 문서[] → 점수[](넣은 순서대로) <!-- 확인 못 함: model-service 는 저장소 밖, 챗봇은 /rerank 를 부르지 않는다 -->
- `GET /health` [code:chatbot/search/embed.py:31-35]

- 펫퍼민트: `search_service` 에서 모델 로딩을 빼고 이 서비스 호출로 바꾼다. 검색 로직(하이브리드, 필터, 정렬)은 그대로 펫퍼민트에 남는다. <!-- 확인 못 함: 펫퍼민트 search_service 는 저장소 밖 -->
- 런슈즈: 챗봇이 이 서비스를 부른다(5단계). [code:chatbot/search/embed.py:1-5] [code:chatbot/search/service.py:111]

이름. 처음엔 `embedding-service` 였다. 리랭커도 함께 빼고, 나중에 다른 모델이 들어와도 이름을 다시 바꾸지 않도록 `model-service` 로 정했다(2026-11-11 사용자). [code:chatbot/search/embed.py:1]

근거

- 두 모델은 지금 펫퍼민트 `search_service`(systemd `petmint-search`, `192.168.122.1:8100`) 프로세스 안에 올라가 있다. 모델 파일은 공유돼도 GPU 메모리는 프로세스마다 따로 잡힌다. 런슈즈가 같은 모델을 자기 프로세스에 올리면 그만큼 또 쓴다. <!-- 확인 못 함: 펫퍼민트 프로세스와 GPU 메모리는 저장소 밖 -->
  - 그 프로세스가 지금 5.0GB 를 잡고 있다(2026-11-11 `nvidia-smi`, Ollama 에 올라간 모델이 없을 때). 무게로 보면 KURE fp32 약 2.2GB + 리랭커 fp16 약 1.1GB, 나머지는 CUDA 문맥과 PyTorch 가 붙들어 둔 추론용 캐시다. [c:d96bab6] <!-- 확인 못 함: nvidia-smi 값은 서버 PC -->
  - Ollama 가 `gemma4:e4b`(9.6GB)를 올리면 합계 약 15GB / 16GB 다(2026-11-10 측정 때 13GB, 그때 펫퍼민트는 3.5GB 였고 캐시가 늘었다). [c:d96bab6] <!-- 확인 못 함: nvidia-smi 값은 서버 PC -->
- 그렇다고 펫퍼민트 서비스에 런슈즈 엔드포인트를 넣으면 두 프로젝트가 한 프로세스에 묶인다.
- 임베딩과 리랭커는 둘 다 텍스트를 넣으면 숫자가 나오는 순수 함수다. 코퍼스, 프로젝트와 무관하다. 그래서 둘을 함께 뺀다. 한 프로세스에 그대로 옮기므로 GPU 사용량은 지금과 같다.

어디, 어떻게(2026-11-11 사용자 확정)

- 코드, 문서, 런북: `~/AI_programming/model-service/` 독립 저장소(README, `docs/runbook-cutover.md`). 두 프로젝트 어느 쪽 것도 아니라 밖에 둔다. <!-- 확인 못 함: model-service 저장소는 이 저장소 밖 -->
- 주소: `192.168.122.1:8200`, systemd 유닛 `model-service`. venv 는 펫퍼민트와 같은 `~/llm_env`(판이 같아야 결과가 비트까지 같다). [code:chatbot/search/embed.py:3] <!-- 확인 못 함: systemd 유닛과 venv 는 서버 PC -->
- 펫퍼민트 search-service 는 `PETMINT_MODEL_URL` 이 있으면 model-service 를 부르고, 없으면 예전처럼 자기 프로세스에 올린다(노트북, 되돌리기 경로). <!-- 확인 못 함: 펫퍼민트 코드는 저장소 밖 -->
- 런슈즈 Pod 에서는 Ollama(`:11434`)와 같은 길(`192.168.122.1`)이다. [code:chatbot/search/embed.py:3] <!-- 확인 못 함: Pod 의 주소 값은 인프라 매니페스트 -->
- 전환: petmint-search 재시작 한 번(약 6초 끊김). 전후 대조는 펫퍼민트 검색 회귀 세트 103 + 26문항의 `/search` 원시 응답과 `/embed` 벡터를 비트까지. 운영 전환 뒤 391건 다름 0(2026-11-11). 상태는 3-1절. [c:b1d4e2a] <!-- 확인 못 함: 전환과 대조는 model-service 와 펫퍼민트 쪽 일 -->

새로 생긴 약점 둘

- **단일 장애점이 넓어졌다.** model-service 가 죽으면 펫퍼민트와 런슈즈 **둘 다** 검색이 멈춘다. 전에는 펫퍼민트만 멈췄다. 런슈즈 쪽에서는 의존이 하나 늘었다. 챗봇의 경험과 후기 갈래(1-1절)가 model-service 에 기댄다. 용어, 스펙, 비교, 추천 갈래는 임베딩을 쓰지 않으므로 영향이 없다(5단계에서 그렇게 나눈다). [code:chatbot/bot.py:272-291] [code:chatbot/server.py:117-124]
- **재부팅 순서가 한 단계 늘었고, 시험하지 않았다.** `network → docker · libvirtd → model-service → Milvus 대기 → petmint-search`. 다음 재부팅 때 확인한다(model-service 런북 8절). <!-- 확인 못 함: 재부팅 순서는 서버 PC 와 model-service 런북 -->

런슈즈 챗봇은 리랭커를 1차에 쓰지 않는다. 검색 품질이 모자랄 때 평가 결과를 보고 켠다. model-service 에 이미 있으니 켤 때 GPU 를 더 쓰지 않는다. [code:chatbot/search/]

**리랭커 판단, 보류(5-2 6차 수정, 2026-11-13 사용자).** 76문항이 통과하고 여러 켤레 질문의 Hit@5 가 3/3(E10, E11, E13)이라 검색이 못 찾는 문제가 없다. 켜면 질문마다 리랭킹 호출이 하나 늘어 1초쯤 느려지고 GPU 계산을 더 쓴다(모델은 이미 올라 있어 메모리는 그대로, 위). 얻을 것이 없어 지금은 켜지 않는다. 리뷰가 늘어 검색이 흐려지거나 Hit@5 가 떨어지면 그때 켠다(`TODO.md`). [c:6d8d364] [docs:TODO.md]

#### 1-4. 비교와 추천, Spring API 로 이관 (변경)

cc안의 A(챗봇을 Node 로 다시 쓰기)는 쓰지 않는다. 프런트 React / 백엔드 Spring 방향이 정해져 있다.

옮기기 전, 둘 다 브라우저에서 돌았다(2026-11-10 작업 3 에서 옮김, 3-1절).

- 비교 → `src/utils/compare.ts` (순수 함수로 분리돼 있었다) → 서버 `compare/ComparePolicy` [code:src/utils/compare.ts:1-4] [code:backend/src/main/java/com/kopo17/runshoes/compare/ComparePolicy.java:40-48]
- 추천 → `src/pages/Recommend.tsx` 206~350줄 (컴포넌트 안의 `evaluate`) → 서버 `compare/RecommendPolicy` [code:src/pages/Recommend.tsx:201] [code:scripts/parity/reference/] [code:backend/src/main/java/com/kopo17/runshoes/compare/RecommendPolicy.java:233-237] <!-- 확인 못 함: 206~350줄은 옮기기 전 옛 코드의 줄이라 606b730 에서 볼 수 없다 -->

목표

- `GET /api/compare`, 신발 id 들(`?ids=`) 또는 고른 신발 하나(`?pick=`, 자동 채우기까지) → 등수, 밴드, 무게 환산 여부(3-1절, GET 인 까닭) [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:44-57]
- `GET /api/recommend`, 조건 5칸 → 상위 3 + score + reasons [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:59-81] [code:backend/src/main/java/com/kopo17/runshoes/compare/RecommendPolicy.java:233-237]

프런트는 계산하지 않고 API 를 불러 그리기만 한다. 챗봇도 같은 API 를 부른다. [code:src/utils/compareApi.ts:1-4] [code:src/pages/Recommend.tsx:201] [code:chatbot/branches/compare.py:26] [code:chatbot/branches/recommend.py:160]

근거

- 비교와 추천은 도메인 로직이다. 화면이 아니라 백엔드가 판단할 일이다.
- json-server 시절 백엔드에 로직 둘 곳이 없어 프런트에 쓴 것이고, Spring 전환 때 옮기지 않은 상태다.
- 파이썬에 다시 구현하면 로직이 두 벌 된다. 가중치 하나 고치면 양쪽을 고쳐야 하고, 둘이 다른 답을 내면 버그다. [code:chatbot/branches/compare.py:1]

추천 입력 5칸 (현행 그대로): `purpose` / `width` / `stability` / `cushion` / `price` [code:backend/src/main/java/com/kopo17/runshoes/compare/RecommendPolicy.java:22-28]

이관 시 지킬 것

- 점수 가중치와 동점 처리(평점 × 리뷰 수 보정 + 찜)를 그대로 옮긴다. [code:backend/src/main/java/com/kopo17/runshoes/compare/RecommendPolicy.java:224-231]
- 화면 동작이 바뀌면 안 된다. 이관 전후 결과가 같은지 확인한다. [code:scripts/parity/check.mjs:1-8]

#### 1-5. 무게 환산

**결정:** 환산 컬럼을 만들고 화면과 챗봇이 함께 쓴다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:8-16] [code:chatbot/facts.py:87-90]

> 구현(2026-11-10, 작업 2. 운영 적용: V15, V16, 이미지 `40586d6eb722`, 환산값 281, 기준 모름 29): V15 `shoes.weight_norm_270`(DB 생성 컬럼 VIRTUAL, API `weightNorm270`), 비교하기 등수, 그래프, 비슷한 신발 거리. 규칙, 계수, 출처는 `01a_catalog_sources.md` 1-3a 로 옮겼고(아래 "docs 에 환산 규칙 절"), 화면 표시는 `08_compare.md` 1-7. 설계에서 달라진 것은 아래 "구현에서 정한 것". [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:8-16] [code:backend/src/main/resources/db/migration/V16__weight_term.sql:23-25] [code:backend/src/main/java/com/kopo17/runshoes/domain/Shoe.java:65-69] [docs:01a_catalog_sources.md] [docs:08_compare.md] [c:3ceae32] <!-- 확인 못 함: 운영 적용과 이미지 태그는 클러스터 -->

현황 (`official_weight_size`, 공개 API `weightSize` 로 셈) [code:backend/src/main/java/com/kopo17/runshoes/domain/Shoe.java:59-60]

| 기준 | 켤레 |
|---|---|
| M9 | 211 (2026-11-10 기준) [c:e0a0bd8] |
| M10 | 37 (2026-11-10 기준) [c:e0a0bd8] |
| M9.5 | 16 (2026-11-10 기준) [c:e0a0bd8] |
| M10.5 | 9 (2026-11-10 기준) [c:e0a0bd8] |
| M8.5 | 8 (2026-11-10 기준) [c:e0a0bd8] |
| 비어 있음 | 29 (2026-11-10 기준) [c:e0a0bd8] |

전에는 비교하기가 M9 만 등수와 그래프에 넣어 310개 중 99개가 무게 비교에서 빠졌다. 지금은 기준 모름 29개만 빠진다(281켤레). [code:backend/src/main/java/com/kopo17/runshoes/compare/ComparePolicy.java:40-48] (2026-11-10 기준) [c:2e05859]

환산 계수: **반 사이즈당 2.6%** [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:3] [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:11-15]

- 근거: RunRepeat 실측, 반 사이즈당 중앙값 2.6%, 모델별 1.66~3.60%, 300g 기준 반 사이즈당 5~10.8g. <!-- 확인 못 함: 외부 출처(RunRepeat) 값 -->
- 측정 범위: US 8~12.5, 러닝화 4종 실측. <!-- 확인 못 함: 외부 출처(RunRepeat) 값 -->
- 출처: https://runrepeat.com/guides/how-much-does-the-weight-vary-across-different-running-shoe-sizes (웹 클로드가 검색으로 확인, 2026-11-10 사용자) <!-- 확인 못 함: 외부 웹 출처, 사람이 확인한 것 -->

| 기준 | 270mm(M9) 환산 |
|---|---|
| M8.5 | × 1.026 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:11] |
| M9 | 그대로 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:12] |
| M9.5 | ÷ 1.026 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:13] |
| M10 | ÷ 1.026² (약 −5.0%) [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:14] |
| M10.5 | ÷ 1.026³ (약 −7.4%) [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:15] |

규칙

- 공시값에서만 환산한다. 실측값(19켤레)은 건드리지 않는다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:3] [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:9-16] (2026-11-10 기준) [c:e0a0bd8]
- 기준이 비어 있는 29켤레는 환산하지 않는다. "기준 모름"을 유지한다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:4] [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:10-16] [code:chatbot/facts.py:87-90] (2026-11-10 기준) [c:e0a0bd8]
- 답변과 화면에 원값을 먼저 쓰고 환산값은 괄호에. "약"을 붙인다. [code:chatbot/facts.py:6] [code:chatbot/facts.py:99-108] [code:chatbot/prompt.py:54]
- 환산 후 차이가 8g 미만이면 우열을 판단하지 않는다. 모델별 편차(1.66~3.60%)에서 나올 수 있는 오차 범위이기 때문이다. [code:chatbot/facts.py:19] [code:chatbot/facts.py:237-253]
- docs 에 "환산 규칙" 절을 새로 두고 계수와 출처를 기록한다. [docs:01a_catalog_sources.md]

표시 예. 규칙의 양쪽을 보인다

예 1(판단하는 경우)

> B는 285g(280mm 기준)이에요. 270mm로 환산하면 약 271g이라, 258g인 A보다 무거운 편이에요. [code:chatbot/facts.py:99-108] [code:chatbot/facts.py:252-253]

(285 ÷ 1.026² = 270.7, 차이 12.7g → 8g 이상이라 우열을 말한다) [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:14] [code:chatbot/facts.py:247]

예 2(판단하지 않는 경우)

> A는 265g(270mm 기준), B는 272g(280mm 기준)이에요. B를 270mm로 환산하면 약 258g인데, 차이가 7g 정도라 거의 같은 수준으로 보셔도 돼요. [code:chatbot/facts.py:250-251]

(272 ÷ 1.026² = 258.4, 차이 6.6g → 8g 미만이라 우열을 말하지 않는다) [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:14] [code:chatbot/facts.py:247]

구현에서 정한 것 (2026-11-10 사용자)

- **생성 컬럼(VIRTUAL)이다.** 무게가 바뀌는 길이 셋(관리 화면, 적재기, SQL)이라 일반 컬럼이면 한 길만 빠뜨려도 어긋난다. 반올림하지 않은 값을 두고 화면과 답변이 반올림한다. 저장 직후 응답에 새 값이 나오도록 엔티티가 저장 뒤 다시 읽는다(`@Generated`). [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:4-6] [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:9-16] [code:backend/src/main/java/com/kopo17/runshoes/domain/Shoe.java:65-69]
- **다섯 값 밖의 기준은 null(기준 모름).** 서버에 기준 사이즈 검증은 넣지 않았다. 관리 폼이 다섯 값만 고르게 하고, 다른 값이 들어가도 비교에서 빠질 뿐이다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:10-16] [code:src/pages/ShoeForm.tsx:16]
- **8g 규칙은 챗봇에만.** 비교하기 화면은 우열을 단언하는 곳이 없어(표, 위치 배지, 순위) 넣지 않았다. 위 표시 예 두 개는 챗봇 답변의 규격이다. [code:chatbot/facts.py:19] [code:chatbot/facts.py:237-253]
- **화면은 "환산" 배지로 밝힌다.** 위치 배지(가벼운 편, 중간, 무거운 편)는 281켤레 모두에, 기준이 M9 가 아닌 70켤레에는 "환산" 배지를 하나 더. 그래프는 고른 신발이 환산이면 제목과 본문에, 같이 보는 신발 가운데 환산한 것은 아래 작은 글씨로(`08_compare.md` 1-7). [code:backend/src/main/java/com/kopo17/runshoes/compare/ComparePolicy.java:51-54] [code:src/components/compare/CompareTable.tsx:129-147] [code:src/components/compare/CompareDist.tsx:74] [code:src/components/compare/CompareDist.tsx:105] [docs:08_compare.md] (2026-11-10 기준) [c:2e05859]
- **비슷한 신발 거리도 환산값으로.** 한 사이트에 무게 기준이 둘이면 안 된다(`08_compare.md` 1-3). 기준 모름 29켤레만 거리 계산 안에서 원값을 쓴다. 저장, 표시하지 않는다. [code:backend/src/main/java/com/kopo17/runshoes/compare/ComparePolicy.java:85-93] [docs:08_compare.md] (2026-11-10 기준) [c:03aef95]
- **무게 용어 설명도 같은 계수로(V16).** 옛 설명 "10mm 커질 때마다 5~10g"이 2.6% 와 다른 숫자를 말했고, 1-9절대로 용어 사전이 프롬프트에 그대로 들어가 챗봇이 틀린 수치를 말하게 된다. 새 설명의 "240g 이하 가벼운 편 · 300g 이상 무거운 편"은 업계 통념이라 "통상적으로"를 붙였다. 비교하기 배지(이 사이트 281켤레의 25%, 75%, 지금 약 240g, 292g)와는 다른 기준이다. [code:backend/src/main/resources/db/migration/V16__weight_term.sql:1-5] [code:backend/src/main/resources/db/migration/V16__weight_term.sql:23-25] (2026-11-10 기준) [c:03aef95]

#### 1-6. 리뷰 요약, 배치로 전환

> 구현(2026-11-10, 작업 1. 운영 적용: V14, 이미지 `1a4304e5baae`, 첫 전체 생성 212켤레, 실패 0, 27분 17초, CronJob `suspend: false`, 매일 03:30 KST): V14 `shoe_summaries`, `summary/*`, CronJob `runshoes-summary`(infra), 런북 infra `apps/runshoes/runbooks/v14-shoe-summaries.md`. 아래 "결정" 다음의 "구현에서 정한 것"이 설계안에 더해진 내용이다. [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:12-23] [code:backend/src/main/java/com/kopo17/runshoes/summary/] [c:75c7de5] <!-- 확인 못 함: CronJob 일정과 런북은 인프라 저장소, 첫 생성 결과는 운영 값 -->

전에는: 요청할 때 실시간으로 Ollama 를 부르고(`summary/SummaryService.java`), 캐시는 Pod 메모리뿐이었다. Pod 를 다시 배포하면 전부 사라졌다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryService.java:25-30]

문제

- Ollama 는 동시 요청을 못 받는다. 여러 명이 다른 신발을 열면 줄 선다. <!-- 확인 못 함: Ollama 의 동작은 저장소 밖 -->
- 같은 GPU 를 챗봇과 펫퍼민트 학습도 쓴다. 요약이 밀리면 챗봇도 느려진다.
- 재배포할 때마다 212켤레(리뷰 3건 이상)가 다시 Ollama 를 부른다. (2026-11-10 기준) [c:e0a0bd8]

**결정:** DB 저장 + stale 플래그 + 하루 1회 크론

- `shoe_summaries` 테이블 (`shoe_id`, `positive`, `negative`, `review_count`, `avg_rating`, `is_stale`, `generated_at`) [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:12-19]
- 리뷰가 달리면 `stale = true` 표시만 한다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:43-64]
- 크론이 stale 인 것만 처리한다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:112-117] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:98-126]
- 조회는 DB 에서 읽기만. Ollama 호출 없음. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryService.java:29] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryService.java:64-91]

조건부 재생성. 리뷰 1건 달릴 때마다 다시 만들지 않는다. stale 을 세우는 조건:

- 리뷰 수가 만들 때보다 10% 이상 변했다, 늘거나 줄거나(2026-11-10 사용자. 삭제 쪽이 더 위험하다. 부정 리뷰가 지워졌는데 요약에 그 내용이 남으면 지금 목록에 없는 평가를 요약이 말한다) [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:13] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:41-43]
- 별점 평균이 0.3 이상 움직였다 [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:14] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:44-46]
- 리뷰가 처음 3건을 넘겼다 (요약이 처음 생기는 시점) [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:12] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:36-37]
- 마지막 생성 후 30일 지났다 [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:15] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:47]

리뷰 1,800건에 1건 추가되는 것은 요약을 바꿀 이유가 못 되고, 4건짜리에 3건 추가되면 내용이 달라진다. 그래서 절대 수가 아니라 비율로 본다. [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:7]

신선도 표시: 화면에 "리뷰 14건 기준"을 함께 보인다. 요약이 특정 시점 스냅샷임을 밝히는 것이다. 실무 서비스들이 쓰는 방식이다. [code:src/components/ReviewSummary.tsx:9] [code:src/components/ReviewSummary.tsx:37]

메시지 큐(Redis 등)는 쓰지 않는다. stale 플래그가 큐 역할을 하고, 이 트래픽에 별도 인프라는 과하다. 즉시 반영이 요건이 되면 그때 넣는다. [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:7] [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:21]

생성 로직은 그대로 쓴다. 프롬프트, JSON 파싱, 3건 미만 제외는 현행 유지. 언제 돌릴지만 바꾼다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryService.java:27] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:12]

구현에서 정한 것 (2026-11-10 사용자)

- **`avg_rating` 은 반올림 전 평균을 둔다(DOUBLE).** `shoes.rating` 은 소수 한 자리로 반올림한 값이라, 그것으로 재면 0.3 판단이 반올림 때문에 흔들린다. [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:6] [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:17]
- **행 하나가 상태를 말한다.** `positive` 가 NULL 이면 "자격(3건 이상)은 되지만 아직 만들지 않음"이다. 리뷰가 3건을 넘기면 이 행을 만들고, 3건 미만이 되면 행을 지운다. V14 가 지금 3건 이상인 보이는 신발을 이 행으로 미리 넣어, 첫 전체 생성이 평소 배치와 같은 길로 돈다. [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:3] [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:9-10] [code:backend/src/main/resources/db/migration/V14__shoe_summaries.sql:25-29] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:18-23]
- **조회는 세 경우다.** 행이 없다(3건 미만) → 빈 응답, 행은 있는데 `positive` NULL → 빈 응답, 만들었다 → 요약(stale 이어도, 오래된 요약이 없는 것보다 낫다). 응답에 `reviewCount`, `generatedAt` 을 더했다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryService.java:64-91] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:94-105]
- **판단은 두 곳이다.** 리뷰를 쓰고, 고치고, 지운 뒤 같은 트랜잭션(stale 만 세우고 끝. 응답이 요약을 기다리지 않는다), 그리고 배치 시작의 전체 재판단(30일 조건과 SQL 로 직접 넣은 리뷰는 쓰기 시점을 거치지 않는다). 배치 로그에 둘을 나눠 남긴다. 재판단으로 새로 선 것이 계속 많으면 쓰기 시점 판단에 빠진 경로가 있다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:43-64] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:19] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:85-96]
- **저장 직후 다시 비교한다.** Ollama 를 기다리는 사이 리뷰가 달리면, 저장하며 stale 을 끄는 순간 그 리뷰가 묻힌다. 입력으로 쓴 리뷰 수와 평균을 함께 저장하고 같은 트랜잭션에서 지금 값과 다시 비교해 조건에 맞으면 stale 을 다시 세운다(로그에 남긴다. 자주 나오면 배치 시각이 잘못된 것이다). [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:79-92] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:111-114]
- **배치는 K8s CronJob 이다**. 같은 이미지, 같은 main 에 `--spring.profiles.active=batch`. 35분 배치가 웹 배포를 막지 않고, 웹 배포가 배치를 끊지 않는다. 실행 이력이 k8s 에 남고 매니페스트가 GitOps 안에 든다. batch 프로필은 웹 서버, Flyway, `SeedPasswords`, `ActivityCleanup` 을 끈다(스키마는 웹 Pod 의 Sync 만 바꾼다). [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatchRunner.java:12-19] [code:backend/src/main/resources/application-batch.yml:1-10] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityCleanup.java:31] [code:backend/src/main/java/com/kopo17/runshoes/auth/SeedPasswords.java:21] (2026-11-10 기준) [c:3ed8f6b]
- **관리 화면에는 건수만 보인다(읽기 전용).** 수동 실행(첫 전체 생성, 프롬프트를 바꾼 뒤, 특정 신발)은 운영 작업이라 권한을 쥔 사람이 터미널에서 한다. `kubectl create job --from=cronjob/…`, 특정 신발은 `is_stale` 을 세우는 SQL 한 줄. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:22] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:119-131]
- **겹치면 뒤에 온 쪽이 끝낸다.** `concurrencyPolicy: Forbid` 는 CronJob 이 만든 Job 끼리만 막는다. 손으로 띄운 Job 과 정기 Job 은 MySQL `GET_LOCK` 으로, 뒤에 온 쪽은 바로 끝내고 종료 코드 0(겹친 것은 오류가 아니다). 실패가 하나라도 있으면 1. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:16-18] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:62-73] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:31-34] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatchRunner.java:14] <!-- 확인 못 함: concurrencyPolicy 값은 인프라 매니페스트 -->
- **신발마다 따로 커밋한다.** Job 이 중간에 죽으면 남은 것은 stale 로 남아 다음 회차가 잇는다. 진행 로그는 10켤레마다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:20-21] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:29] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:123-125] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:83-92]

실행 기록(2026-11-14 사용자, V20, 로컬) [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:1-4]

배치가 몇 분 걸렸는지, 몇 켤레 만들었는지, 실패했는지는 Pod 로그 한 줄에만 있어, CronJob Pod 가 지워지면 아무도 몰랐다. `shoe_summaries.generated_at` 은 켤레마다 마지막으로 만든 때 하나라 다시 만들면 덮이고, 실패한 시각과 까닭은 남지 않는다. 그래서 표 둘을 더했다(`V20__summary_batch_runs.sql`, `summary/BatchRunLog`). [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:1-4] [code:backend/src/main/java/com/kopo17/runshoes/summary/BatchRunLog.java:15-18]

- `summary_batch_runs`, 한 실행 한 줄. 시작할 때 `running` 으로 넣고 끝날 때 `ran`, `skipped`(다른 요약 배치가 돌고 있음), `error`(예외로 멈춤)로 고친다. 대상, 성공, 실패, 다시 stale, 사라짐, 걸린 시간(ms), 오류 글. `running` 으로 남은 줄은 프로세스가 중간에 죽은 것이다. [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:6-13] [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:19-34] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:49-60]
- `summary_batch_failures`, 만들지 못한 켤레마다 한 줄(실행 id, 신발 id, 까닭). `shoe_id` 에 FK 를 두지 않는다. 신발을 영구 삭제해도 지난 기록은 남긴다. [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:14-16] [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:36-45] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:116-119]
- 배치(Spring)가 같은 DB 에 바로 쓴다. **기록은 덤이다**. 기록 쓰기가 실패하면 경고 로그만 남기고 요약 만들기는 끝까지 돈다. 지우는 일은 없다(하루 한 줄 + 실패 몇 줄). [code:backend/src/main/java/com/kopo17/runshoes/summary/BatchRunLog.java:15-18] [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:17]
- 대시보드에는 「배치」 묶음을 따로 둔다(사용자 결정, 요약은 챗봇만이 아니라 상세 화면에도 나간다). <!-- 확인 못 함: 대시보드 구성은 저장소 밖(사용자 결정) -->

확인(2026-11-14): 백엔드 시험 54건(`BatchRunLogTest`, DB 가 꺼져도 기록 메서드가 던지지 않는다). 빈 임시 MySQL(tmpfs, 끝나면 사라짐)에 V1~V20 을 Flyway 로 올리고 배치를 네 번 돌렸다. [code:backend/src/test/java/com/kopo17/runshoes/summary/BatchRunLogTest.java:1] [c:3553716]

| 회차 | 조건 | 결과 |
|---|---|---|
| 1 | Ollama 닿지 않음 | 종료 코드 1, `ran` 대상 20, 실패 20, 0.4초, 실패 줄 20(까닭 `ResourceAccessException: I/O error on POST request …`) (2026-11-14 기준) [c:3553716] |
| 2 | 로컬 Ollama | 종료 코드 0, `ran` 대상 20, 성공 20, 2분 24초(144,830ms) (2026-11-14 기준) [c:3553716] |
| 3 | 기록 표 이름을 바꿔 쓰기가 실패하게, stale 2켤레 | 종료 코드 0, 「실행 기록 시작 줄을 넣지 못했다」 경고 뒤 두 켤레를 새로 만들었다(`generated_at` 이 바뀜) (2026-11-14 기준) [c:3553716] |
| 4 | 다른 세션이 `GET_LOCK` 을 쥔 채 | 종료 코드 0, `skipped`(숫자 없음, 13ms) (2026-11-14 기준) [c:3553716] |

`error` 줄(배치가 예외로 멈춤)은 끝에서 끝으로 재현하지 않았다. [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:56-58]

#### 1-7. 리뷰를 근거로 쓰는 법

**검색은 후보를 고르는 데만 쓰고, 말은 전체를 놓고 한다.** [code:chatbot/branches/experience.py:3]

검색 결과만으로 말하면 분모가 숨는다. "무릎 편한 신발"로 검색하면 긍정 리뷰만 걸려 오고, 모델은 자기가 못 본 부정 리뷰 11건의 존재를 모른다.

1. 검색 → 어떤 신발을 볼지 고른다 [code:chatbot/branches/experience.py:4] [code:chatbot/branches/experience.py:340-358]
2. 집계 → 그 신발 리뷰를 전부 가져와서 센다 [code:chatbot/branches/experience.py:5-7] [code:chatbot/branches/experience.py:362]
3. 답변 → 전체 기준으로 말한다 [code:chatbot/branches/experience.py:8-9]

신발당 리뷰 중앙값 4건, 최대 38건(약 2,500자)이다. 답에는 30건까지 넣고, 넘으면 추천 많은 순으로 자르고 잘랐다고 밝힌다. 미리 요약하지 않고 원문을 넣는다. "발볼 끼어?" 같은 세부 질문은 원문이 있어야 답한다. (1-6절 요약 배치는 화면 성능용이고, 챗봇 검색과 별개다.) [code:chatbot/branches/experience.py:10] [code:chatbot/branches/experience.py:27] (2026-11-10 기준) [c:e0a0bd8]

**한쪽만 말하기 금지.** 한쪽만 있으면 "모두 좋다는 쪽이에요"처럼 반대쪽이 없다는 것을 집계 문장이 말한다. 그 문장은 코드가 쓴다(5-2 2차 수정부터, 모델이 반대쪽 세기를 건너뛸 수 없다). [code:chatbot/branches/experience.py:180-203]

표현

- 집계: "리뷰 14건 중 무릎 이야기가 5건이고, 그중 좋다는 쪽이 3건 아쉽다는 쪽이 2건이에요", 한쪽만이면 "…5건이고, 모두 좋다는 쪽이에요". "나머지 9건은 언급 없음"은 14에서 5를 뺀 수라 새 정보가 없어 뺐다(5-2 5차 수정, `archive/09_chatbot_rag_log.md` 옛 16절) [code:chatbot/branches/experience.py:196-203]
- 특정 리뷰 인용: 관점 없는 질문은 "'도움이 돼요'를 가장 많이 받은 리뷰를 가져왔어요."(인용한 리뷰의 「도움이 돼요」가 0이면 빼고 집계 줄만), 관점 질문은 "무릎을 말한 리뷰 가운데 가장 많은 추천을 받은 리뷰예요." 꼴(좋다는 쪽, 아쉽다는 쪽을 물으면 그 쪽을 밝힌다). [code:chatbot/prompt.py:24] [code:chatbot/branches/experience.py:211-217] [code:chatbot/branches/experience.py:408-410]
- 금지: "러너들이", "실제 사용자 후기", "많은 사람들이" [code:chatbot/reply.py:15-16]

리뷰는 가상 유저 200명이 만든 데이터다(`01e_seed_reviews.md`). 실제 사용자 반응처럼 말하면 사실과 다르다. 나중에 실유저 리뷰가 쌓이면 `is_seed` 플래그로 구분해 표현을 푼다. [code:chatbot/branches/experience.py:12] [code:chatbot/reply.py:15] [docs:01e_seed_reviews.md]

**악성 리뷰(5-2 6차 수정, 남은 일).** 챗봇은 인용 블록(`> …`)으로 리뷰 원문을 고치지 않고 보여 준다(5-2 2차 수정, `archive/09_chatbot_rag_log.md` 옛 16절). 지금은 가상 리뷰라 문제없지만, 실유저가 쓰기 시작하면 욕과 비방도 그대로 인용된다. 사이트에 리뷰 신고 기능이나 금칙어 필터를 둘 때 챗봇 인용에도 함께 건다(신고 또는 숨김된 리뷰는 인용과 근거에서 뺀다). `TODO.md`. [code:chatbot/branches/experience.py:251] [code:chatbot/branches/experience.py:279-281] [docs:TODO.md]

리랭킹: "도움이 돼요"는 완전 랜덤이 아니라 인기도 × 길이 × 별점 기반이고(`01e` 1-5, 생성 스크립트 `engage.py`) 글 길이와 상관이 0.358 이라 신호가 있다. 다만 0이 39.9%, 중앙값 1, 최대 44로 치우쳐 있어 로그로 누른다. [docs:01e_seed_reviews.md] (2026-11-10 기준) [c:e0a0bd8] <!-- 확인 못 함: 생성 스크립트 engage.py 는 이 저장소에 없다 -->

```
점수 = 유사도 × 0.8 + log(1+추천수) / log(1+그때의 최댓값) × 0.2
```

최댓값은 44 로 박지 않고 그 검색의 후보 가운데 가장 큰 추천수로 센다(2026-11-12 사용자, 리뷰가 늘면 44 가 넘는다). 유사도는 RRF 점수를 그 검색의 1등 RRF 점수로 나눈 값(0~1, `archive/09_chatbot_rag_log.md` 옛 16절). [code:chatbot/search/index.py:8-9] [code:chatbot/search/index.py:52-65]

#### 1-8. 통증과 부상 질문

**답한다. 거절하지 않는다.** "쿠션 좋은 신발"과 "무릎 아픈데 뭐 신지"는 사실상 같은 질문이다.

- 할 것: 신발 특성 설명, 리뷰에 나온 내용 전달 [code:chatbot/prompt.py:59-60]
- 안 할 것: 증상 원인 설명, 치료 효과 약속 [code:chatbot/prompt.py:62]
- 경계: "신발이 어떻다"는 되고 "당신 몸이 어떻다"는 안 된다 [code:chatbot/prompt.py:60]
- 전문의 안내 1회, **답 맨 앞**(5-2 4차 수정, 2026-11-13 사용자. 전에는 끝이었다. 인사, 물음표, "보러 가실래요?" 뒤에 와서 어색했다). 그 뒤 신발 이야기, 끝은 사이트 쪽으로 돌아온다 [code:chatbot/prompt.py:14-16] [code:chatbot/reply.py:303-305]

**판별은 라우터 LLM 이 한다. 키워드로 잡지 않는다.** [code:chatbot/router.py:46] [code:chatbot/router.py:76-80]

근거: "무릎이 시큰거려요", "오래 뛰면 다리가 못 버텨요" 같은 것을 키워드 목록으로는 못 따라간다. 라우터가 이미 갈래를 나누고 있으니 `health_context: true|false` 필드 하나를 더 받는다. **라우터가 실패하면 기본값은 true.** 불필요하게 붙는 것은 사소한 손해, 빠지는 것은 큰 손해다. [code:chatbot/router.py:46] [code:chatbot/router.py:177-181]

키워드 보조 그물은 지금 없다. 라우터 LLM 이 답하면 그 값만 쓰고, 부르기에 실패했을 때만 true 다. 라우터가 통증 질문에 false 를 잘못 주면 의료 안내가 나가지 않는다(`TODO.md` 안전). [code:chatbot/router.py:174-181]

**근거가 얇으면 그렇다고 말한다.** 통증 표현이 들어간 리뷰는 1,800건 중 77건뿐이다. 58켤레, 한 신발에 많아야 4건(아프, 아파, 아픈, 아팠, 통증, 부상, 족저근막, 정강이, 물집, 저리, 쓸림, 까짐으로 셈, 2026-11-12 관리자. 전에 적은 87건은 11-09 리뷰 재생성 전 값). 특정 신발로 좁히면 0~2건일 수 있다. 문구는 코드가 쓴다(`archive/09_chatbot_rag_log.md` 옛 16절): [code:chatbot/branches/experience.py:57] [c:b11e139]

- 0건: "이 신발 리뷰 N건 가운데 그 부분을 말한 리뷰는 없었어요." [code:chatbot/branches/experience.py:186-187]
- 1~2건: "리뷰 근거가 많지 않아요 — N건 중 K건에서만 나온 이야기예요." [code:chatbot/branches/experience.py:190-195]
- 3건 이상: 평소 집계(1-7절 표현) [code:chatbot/branches/experience.py:196-203]

통증은 추천 점수에 넣지 않는다. 추천받기 화면에 없는 항목이라 화면과 챗봇 답이 달라진다. [code:backend/src/main/java/com/kopo17/runshoes/compare/RecommendPolicy.java:22-28]

**발 유형도 지금은 통증으로 본다(임시)**(2026-11-13 사용자). "발이 안쪽으로 무너지는 편이에요. 장거리용 골라 주세요"(평가 R04)에 라우터가 `health_context=true` 로 전문의 안내를 붙이는 것을 맞다고 보고 평가 정답을 고쳤다. 발 유형(과내전, 평발, 발볼)과 증상(아프다, 시큰하다)을 나눠 안내를 붙일지는 정하지 않았다. 지금은 가르기 어려워 모두 붙인다. 안 붙여서 놓치는 쪽이 더 위험하기 때문이다. 기준은 사전 보강(1-9절 통증 항목) 때 세운다(`TODO.md`). [code:chatbot/eval/golden.jsonl:34] [docs:TODO.md]

#### 1-9. 용어

DB `terms` 13개 + 프런트 2개(`WIDE_TERM`, `stabilityTerm`, `src/utils/terms.ts`)를 **전량 프롬프트에 넣는다.** 검색하지 않는다. [code:chatbot/terms.py:3] [code:chatbot/terms.py:12-43] [code:src/utils/terms.ts:4] [code:src/utils/terms.ts:20] [code:chatbot/terms.py:75-81] (2026-11-10 기준) [c:e0a0bd8]

근거: 툴팁이 사이트의 진실의 원천이다. 챗봇이 검색으로 다르게 답하면 툴팁과 어긋난다. 20~30개 수준이면 전부 넣는 쪽이 확실하다.

사전에 없는 말(갑피 249, 텅 193, 러그 51, PEBA 35 등. 그 낱말이 나오는 설명문 수)은 설명문을 검색해 문맥으로 답하고, "사전에 없는 용어"로 로그에 기록한다. 1단계(5-1)는 검색이 없어 거절하고 기록만 한다(`archive/09_chatbot_rag_log.md` 옛 15절). 5-2 에서도 용어 갈래("갑피가 뭐예요")는 그대로다. 설명문 검색은 특성 설명 갈래에만 붙였다(지시 범위, `TODO.md`). [code:chatbot/bot.py:214-218] [code:chatbot/branches/term.py:1] [code:chatbot/branches/term.py:15-18] [code:chatbot/branches/explain.py:68-77] [docs:TODO.md] (2026-11-12 기준) [c:b11e139]

`terms` 테이블의 id 중복(12가 둘, `weight` 와 `outsole`)은 고쳤다. V17 이 아웃솔을 13 으로(2026-11-12, 계약 R03 다시 녹화). 화면이 직접 가진 둘(`WIDE_TERM`, `stabilityTerm`)은 `terms` 로 옮기지 않고 챗봇(`chatbot/terms.py`)이 사본을 가진다. 두 벌이라 평가가 `src/utils/terms.ts` 와 글자까지 대조한다(`archive/09_chatbot_rag_log.md` 옛 15절). [code:backend/src/main/resources/db/migration/V17__terms_outsole_id.sql:1-4] [code:chatbot/terms.py:12-28] [code:chatbot/eval/run.py:560-573]

사전 보강은 별도 작업으로 뺀다(이번 범위 아님, 목록만 정해 둔다). 설명문에서 쓰이는데 지금 사전 13개와 겹치지 않는 용어 **21개**: [code:chatbot/terms.py:64-72]

- 부품과 소재(12): 갑피, 텅, 메시, 니트, EVA, PEBA, TPU, 러그, 토박스, 앞코, 중족부, 라스트 [code:chatbot/terms.py:66-68]
- 분류(4): 데일리 트레이너, 슈퍼 트레이너, 슈퍼 슈즈, 레이싱 [code:chatbot/terms.py:69]
- 훈련(5): 회복주, 인터벌, 울트라, 미드풋, 과내전 [code:chatbot/terms.py:70-71]

제외

- 접지, 반발, 통기성. 용어가 아니라 서술어다
- 플레이트. 기존 "카본 플레이트"와 겹친다. 따로 둘지는 사전 보강 작업에서 판단한다

**통증 항목 보강**(2026-11-13 사용자, 지금 하지 않는다, `TODO.md`). 신발 살 때 가장 많이 묻는 것이라 생략하지 않는다. [docs:TODO.md]

- 통증 관련 항목을 사전에 넣어 병명 → 신발 다리를 놓는다("족저근막염은 발바닥에 충격이 쌓여 … 그래서 쿠션이 두꺼운 쪽이 …"). 지금 사전에는 이 다리가 없어, 통증 질문에 챗봇이 신발을 고르면 "이 병에는 이 신발"로 읽힌다. 그래서 5-2 1차 수정에서 통증 질문의 설명문 신발 이름과 버튼을 뺐다(`archive/09_chatbot_rag_log.md` 옛 16절). [code:chatbot/branches/explain.py:83-85]
- 전문의 안내를 답 앞으로 뺄지 검토한다. 선을 먼저 긋고 시작하면 뒤에 무엇을 말해도 조언으로 읽히지 않는다. 지금은 답 맨 앞에 한 번이다(5-2 4차에서 바꿈, 1-8절). [code:chatbot/reply.py:303-305] [code:chatbot/prompt.py:14-16]
- 통증 항목은 출처가 필요하다. 사이트가 의학 정보를 말하는 것이 된다.

#### 1-10. 생성 모델과 말투

**모델:** 현행 `gemma4:e4b` 유지. 새 모델을 받지 않는다. [code:chatbot/llm.py:13]

VRAM 16.3GB 중 13GB 를 쓰고 있다. 7B 를 더 올리면 펫퍼민트 학습 때 OOM 이 난다. (2026-11-10 기준) [c:e0a0bd8] <!-- 확인 못 함: nvidia-smi 값은 서버 PC -->

라우팅 JSON 출력이 작은 모델에서 불안할 수 있다. 함수 호출에는 기대지 않고 `format: json` 으로 받되, 라우터 LLM 은 매 질문 한 번 부르고, 갈래는 규칙이 정하면 규칙을 따르고 규칙이 못 정할 때만 LLM 의 답을 쓴다. [code:chatbot/llm.py:32-33] [code:chatbot/router.py:172-180]

**말투 전면 교체.** 옛 프롬프트(지운 `chatbot_server.py` 의 `SYSTEM_PROMPT`)는 반말 + 이모지 1~2개였다. 다음으로 바꿨다(5-1, `chatbot/prompt.py`). [code:chatbot/prompt.py:35-41] [code:Dockerfile.chatbot:6]

화자는 **러닝화 담당자.** [code:chatbot/prompt.py:35]

- 해요체, 이모지 없음 [code:chatbot/prompt.py:38] [code:chatbot/reply.py:183-185]
- 경쾌하고 친근하게. 러닝을 좋아하는 사람의 말투 [code:chatbot/prompt.py:38]
- 느낌표는 인사, 마무리, 격려에. 수치나 비교 결론에는 쓰지 않는다 [code:chatbot/prompt.py:39]
- 통증 또는 거절 상황에서는 톤을 한 단계 낮춘다 [code:chatbot/prompt.py:40]

쓰지 않는 것

- "전문가" 자칭. 담당자다. 전문가라면서 전문의를 권하는 것은 앞뒤가 안 맞는다 [code:chatbot/prompt.py:35] [code:chatbot/reply.py:16]
- "완벽한 선택이세요" 같은 치켜세우기 [code:chatbot/reply.py:16]
- "죄송합니다만" 반복. 거절이 사과가 되면 안 된다 [code:chatbot/reply.py:16]

거절 문구

| 상황 | 문구 |
|---|---|
| 없는 신발 | "그 모델은 이 사이트에 등록되어 있지 않아요. 비슷한 모델로 찾아볼까요?" [code:chatbot/prompt.py:10] |
| 없는 용어 | "이 사이트에서는 다루지 않는 용어예요. 대신 OO은 설명해드릴 수 있어요." [code:chatbot/prompt.py:11] [code:chatbot/branches/term.py:17] |
| 범위 밖 | "저는 러닝화 안내를 담당하고 있어서 그 질문은 도와드리기 어려워요. 대신 신발 쪽은 무엇이든 편하게 물어보세요!" [code:chatbot/prompt.py:12] |
| 근거 없음 | "그 부분은 등록된 정보에 없어서 확인이 어려워요." [code:chatbot/prompt.py:13] |

원칙: 거절로 끝내지 않고 항상 할 수 있는 것을 하나 제시한다. "제가 모른다"가 아니라 "등록되어 있지 않다"로 말한다. [code:chatbot/prompt.py:10-13] [code:chatbot/prompt.py:29]

없는 신발 문의는 로그로 남겨 관리 화면에 보인다. 다음 수집 대상이 된다. [code:chatbot/bot.py:43-58] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:56-68] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:79] [code:backend/src/main/resources/db/migration/V18__chatbot_misses.sql:1-7]

**예시 답변 6개를 프롬프트에 고정한다** (사용자가 직접 작성, 2026-11-12): 인사와 없는 신발, 범위 밖 거절, 통증, 무게 비교, 비교 결과, 추천. 리뷰 인용은 리뷰를 쓰는 2단계로 미뤘다. 원문은 `chatbot/prompt.py` `EXAMPLES`. 톤은 글로 설명하면 매번 다르게 해석되니 예시가 규격서 역할을 한다. [code:chatbot/prompt.py:67-150]
지금은 여섯 개를 모두 주지 않고 갈래마다 다르게 고른다(`prompt.py` `EXAMPLES_BY_BRANCH`, 경험과 후기 갈래에는 예시를 주지 않는다). [code:chatbot/prompt.py:155-167]

#### 1-11. 신발 이름 찾기

`model`, `modelEn`, `modelAlias` 와 세대 숫자로 코드가 찾는다. LLM 은 쓰지 않는다. [code:chatbot/catalog.py:1-3] [code:chatbot/catalog.py:123-126]

- 세대가 여럿이면 현행(`isCurrent`)을 고르고 "41세대 기준이에요"라고 밝힌다 [code:chatbot/catalog.py:74-84] [code:chatbot/facts.py:116-117] [code:chatbot/facts.py:231-232]
- 그래도 애매하면 하나만 되묻는다 [code:chatbot/bot.py:185-193]
- 대화 상태에 마지막으로 말한 신발을 둔다 ("그거랑 비교해줘"를 받기 위해) [code:chatbot/bot.py:32] [code:chatbot/bot.py:127-128]
- 이름과 문장은 소문자로 바꾸고 공백, 하이픈, 점을 지운 뒤 맞춘다(`GT-1000` 과 `gt 1000` 이 같다). 세대 숫자는 원문에서 읽는다 [code:chatbot/catalog.py:28-31] [code:chatbot/catalog.py:207-209]
- 숫자 또는 영문으로 끝나거나 시작하는 이름은 앞뒤에 같은 종류 글자가 붙어 있으면 버린다. 「188000원」 속 880, 「cloudtec」 속 cloud 를 막기 위해서다 [code:chatbot/catalog.py:240-257]
- 붙어 있는지는 원문으로 본다. 원문에서 두 글자 사이가 공백, 하이픈, 밑줄뿐이면 떨어진 것이다. 쉼표와 점은 떨어진 것이 아니다(「1,880원」, 「9.5」) [code:chatbot/catalog.py:243-251]
  - 2026-11-17 전에는 공백을 지운 뒤에 보아서, 이름 뒤에 띄어 쓴 세대가 이름에 붙은 것으로 보였다. 그래서 「GT-1000 14」, 「GT-2000 15」(아식스 3켤레), 「1080 14」처럼 v 를 뺀 뉴발란스 9켤레, 「XA Pro 3D V9」, 「Gel-Kayano v33」, 「Hoka Mach 6」 같은 영문 질문을 못 찾았다. 운영 카탈로그 310켤레의 이름 꼴 3,627개를 옛 코드와 견주어 406개가 바뀌었고, 모두 못 찾던 것을 찾거나(399) 다른 라인으로 잘못 잡던 것(「마하 X v3」가 마하로, 「글리세린 GTS v23」가 글리세린으로 등 7)을 바로잡은 것이다 [code:chatbot/catalog.py:243-244] [c:45f341a]
- 색인에 넣을 때 이름 끝의 세대 숫자(`v` 를 붙인 꼴 포함)를 떼어 라인 이름으로 넣고, 세대는 질문에서 이름 바로 뒤의 숫자로 읽는다 [code:chatbot/catalog.py:46-49] [code:chatbot/catalog.py:143] [code:chatbot/catalog.py:259-268]
- 끝에서 세대를 떼지 못하는 이름은 따로 다룬다. 세대가 가운데 있거나(아디제로 프라임 X 2 스트렁), 2.0 꼴이거나(시엘로 X1 2.0), 끝에 기호가 붙은(론 피크 9+) 이름이다 [code:chatbot/catalog.py:52-66]
  - 그 이름은 라인이 아니라 그 켤레로 바로 맞춘다. 세대 낱말이 든 뒷부분(「X 2 스트렁」)도 같다. 세대를 읽지 않으므로 세대 읽기 규칙(이름 뒤 숫자, 「9.5」 같은 사이즈는 세대가 아니다)은 그대로 둔다 [code:chatbot/catalog.py:131-132] [code:chatbot/catalog.py:150-162] [code:chatbot/catalog.py:199-206]
  - 세대 낱말 앞까지를 라인 이름으로 넣는다(「시엘로 X1」, 「아디제로 프라임 X」, 「론 피크」). 그래서 「시엘로 X1 2세대」, 「시엘로 X1 2」는 2.0 을, 「시엘로 X1」은 현행 3.0 을 찾고, 「론 피크 8」은 없는 신발이 아니라 등록되지 않은 세대로 답한다 [code:chatbot/catalog.py:133] [code:chatbot/catalog.py:153-154] [code:chatbot/bot.py:319-329]
  - 라인 이름이 다른 라인의 이름 또는 별칭과 겹치면 넣지 않는다. 2026-11-17 운영 카탈로그에서는 클라우드몬스터 3 하이퍼 하나다(세대 앞까지가 다른 라인인 「클라우드몬스터」). 넣지 않은 것은 `Catalog.skipped_line_names` 에 남는다. 그래서 「클라우드몬스터 하이퍼」처럼 세대를 빼고 물으면 「클라우드몬스터」와 「하이퍼」를 따로 맞춰 두 켤레를 잡는다. 이것이 맞는 동작이다(사용자 2026-11-17). 세대를 말하지 않았으니 둘 다 보여 주고, 챗봇은 두 켤레 스펙을 나란히 놓고 견준다 [code:chatbot/catalog.py:163-169] [c:2e0d3fd]
  - 이름에 세대 숫자가 없는 1세대(슈퍼노바 이즈, 메가블라스트 등 34켤레)는 여기에 들지 않는다. 라인 이름 그대로라 세대를 말하지 않으면 현행을 고른다 [code:chatbot/catalog.py:57-61] [code:chatbot/catalog.py:74-84] (2026-11-17 기준) [c:1f1e171]
  - 2026-11-17 전에는 이 이름들을 라인으로 맞추고 세대를 읽지 못해, 「시엘로 X1 2.0」은 3.0 으로, 「아디제로 프라임 X 2 스트렁」은 X 3 으로 답했다. 「시엘로 X1 2」, 「시엘로 X1」은 아예 못 찾아 「등록되어 있지 않아요」라고 답했다. 이름 꼴 3,627개를 옛 코드와 견주어 32개가 바뀌었다. 12개는 다른 세대로 답하던 것을 바로잡았고, 20개는 같은 켤레에 세대를 읽게 되어 「N세대 기준이에요」를 붙이지 않게 된 것이다. 나빠진 것은 없다 [c:1f1e171]

#### 1-12. 설명문 청킹, 문장 단위

`shoes.description` 한 칸에 통으로 들어 있고 줄바꿈이 0개다. 5단 구조(라인, 변화, 구조, 핏, 쓰임, `01d_catalog_copy.md`)는 작성 규칙일 뿐 경계 표시가 없다. [docs:01d_catalog_copy.md] (2026-11-10 기준) [c:e0a0bd8]

기준: 길이와 상관없이 모든 설명문을 문장 단위로 쪼갠다. [code:chatbot/search/corpus.py:37-38] [code:chatbot/search/corpus.py:63-68]

길이 (2026-11-10, 공개 API 310켤레, `description.length`, 공백 포함 글자 수) [c:e0a0bd8]

| 평균 | 최소 | 25% | 중앙값 | 75% | 90% | 최대 |
|---|---|---|---|---|---|---|
| 418.5 | 82 | 384 | 464 | 511 | 553 | 665 (304 메타후지 트레일 2) (2026-11-10 기준) [c:e0a0bd8] |

| 300자 이하 | 301~600자 | 600자 초과 |
|---|---|---|
| 57 | 246 | 7 (2026-11-10 기준) [c:e0a0bd8] |

- 문장 수: 2~11, 중앙값 6. 문장 길이 중앙값 78자, 최대 178자(`다.` 뒤에서 나눔). (2026-11-10 기준) [c:e0a0bd8]
**결정: 문장 단위로 쪼갠다** (2026-11-10 사용자). [code:chatbot/search/corpus.py:5-6] [code:chatbot/search/corpus.py:63-68]

근거: 중앙값 464자에 문장 6개면 한 덩어리 안에 라인, 변화, 구조, 핏, 쓰임이 다 섞인다. "발볼 넓은 신발"로 검색할 때 핏 문장 하나 때문에 걸려야 하는데, 나머지 5개 주제가 벡터를 희석한다. 문장 중앙값이 78자라 문장 하나도 충분히 완결적이다. (2026-11-10 기준) [c:e0a0bd8]

- 문장은 「`. `」 또는 「`다.`」 뒤에서 나눈다. 마침표만으로 나누면 숫자 안 마침표(40.5mm 등 50곳)에서 깨진다. 두 방법 모두 1,638문장, 모든 조각이 `다.`로 끝난다(2026-11-12). [code:chatbot/search/corpus.py:5-6] [code:chatbot/search/corpus.py:18-19] [c:b11e139]
- 청크마다 머리말을 붙여 임베딩한다 (리뷰와 같은 방식). 머리말은 임베딩에만, BM25 는 본문만 본다. [code:chatbot/search/corpus.py:8] [code:chatbot/search/corpus.py:68] [code:chatbot/search/corpus.py:74] [code:chatbot/search/memory.py:72]
  예: `[아식스 노바블라스트 6 · 조깅·회복주] 앞쪽이 넉넉한 편이고…`. 모델명이 세대 숫자로 끝나면 「N세대」를 덧붙이지 않는다(`archive/09_chatbot_rag_log.md` 옛 16절) [code:chatbot/search/corpus.py:41-48]
- 설명문 문서 수: 310 → 1,638(설계 때 어림 약 1,860). 리뷰 1,800 과 합쳐 3,438. 메모리 색인 결정(1-2절)은 그대로다. (2026-11-12 기준) [c:b11e139]
- 15자 미만 문장 12개(「와이드 모델도 나옵니다.」 10, 「드롭은 11mm입니다.」류 2)도 넣는다. 평가에서 이 문장이 근거로 잡혀 답을 흐린 일이 없었다(`archive/09_chatbot_rag_log.md` 옛 16절). [code:chatbot/search/corpus.py:58-67] [code:chatbot/search/service.py:89] (2026-11-12 기준) [c:b11e139]
- 슬라이딩 윈도우(앞뒤 문장 묶기)는 넣지 않는다. 평가에서 문맥 끊김이 드러나면 그때 판단한다. [code:chatbot/search/corpus.py:65-68]

#### 1-13. 로그인한 사람만(2026-11-13, 로컬)

챗봇은 로그인한 사람만 쓴다. 지시와 결정은 2026-11-13 사용자 승인(관리자 지시서). 백엔드와 인프라는 바꾸지 않았다. `GET /api/me`(Bearer)가 이미 있고, 챗봇은 같은 Pod 라 `127.0.0.1:3000` 으로 부른다. 토큰과 쿠키의 성질은 `04_auth.md` 1-1. [code:chatbot/http.py:13] [code:chatbot/http.py:53-57] [code:chatbot/server.py:68] [docs:04_auth.md]

흐름

| 단계 | 화면(`ChatBot.tsx`) | 챗봇(`server.py`) |
|---|---|---|
| 버튼 | 누구에게나 보인다. 로그인 전이면 연결을 열지 않고 패널 안에 "챗봇은 로그인한 뒤에 쓸 수 있어요. 체험 계정으로 바로 둘러볼 수 있어요." + [로그인](`loginPath`, 보던 화면으로 돌아온다) | 없음 [code:src/components/ChatBot.tsx:38] [code:src/components/ChatBot.tsx:276-280] [code:src/components/ChatBot.tsx:285-287] [code:src/components/ChatBot.tsx:247-253] [code:src/auth/session.ts:193-195] |
| 연결 직후 | 첫 메시지 `{"type":"auth","token":…}`(토큰은 `session.chatToken()`, 챗봇만 쓴다) | `GET /api/me` 로 확인. 200 이면 인사(system)를 보내고 질문을 받는다 [code:src/components/ChatBot.tsx:84] [code:src/auth/session.ts:58] [code:chatbot/server.py:68-72] [code:chatbot/server.py:90] |
| 실패 | `auth_failed` → `refresh` 한 번 뒤 다시 연결. 서버가 refresh 를 거절하면(401, 403) 로그아웃 상태가 되어 로그인 안내, refresh 가 서버에 닿지 못하면(재시도까지 실패, 로그인은 그대로) "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." + [다시 연결], 다시 붙어도 실패하면 "로그인 정보를 확인하지 못했어요…" + [로그인](로그아웃 뒤 로그인 화면) | 401, 인증이 아닌 첫 메시지, 빈 토큰, 헤더에 실을 수 없는 토큰(공백, 제어 문자, 4,096자 넘음) → `{"type":"auth_failed"}` 뒤 닫는다(코드 4401). 확인 전에 온 질문은 받지 않는다 [code:src/components/ChatBot.tsx:88-101] [code:src/auth/session.ts:150-155] [code:src/auth/refreshPolicy.ts:18] [code:src/auth/session.ts:77] [code:src/components/ChatBot.tsx:202-207] [code:src/components/ChatBot.tsx:39] [code:src/components/ChatBot.tsx:201] [code:chatbot/server.py:61-67] [code:chatbot/server.py:73-74] [code:chatbot/server.py:34] |
| 기다림 | 없음 | 10초(`AUTH_TIMEOUT`) 안에 첫 메시지가 없으면 `auth_failed`(reason `timeout`) 뒤 닫는다 [code:chatbot/server.py:31] [code:chatbot/server.py:53-56] |
| 백엔드가 아직 안 뜸 | 서버 문구를 그대로 보여 주고 [다시 연결]. 저절로 다시 붙지는 않는다 | 연결 실패 또는 401 이 아닌 응답 → `{"type":"auth_unavailable","message":"지금은 챗봇에 연결하지 못했어요. 잠시 뒤 다시 연결을 눌러 주세요."}` 뒤 닫는다(코드 4503) [code:src/components/ChatBot.tsx:104-108] [code:src/components/ChatBot.tsx:202-207] [code:chatbot/server.py:32] [code:chatbot/server.py:75-76] [code:chatbot/server.py:34] |
| 로그아웃 | 소켓을 닫고 대화를 지운다(로그인한 사람마다 대화 칸을 새로 띄운다, 다른 계정으로 바뀌어도 같다) | 없음 [code:src/components/ChatBot.tsx:281] [code:src/components/ChatBot.tsx:144-153] |

- **메시지마다 확인하지 않는다.** access token 이 15분이라 패널을 오래 열어 둔 사람이 질문 중간에 막힌다. 연결이 곧 확인한 사람이다. 대신 화면이 로그아웃하면 소켓을 닫는다. 다른 탭의 로그아웃과 탈퇴는 그 연결이 끝날 때까지 이어진다(`04_auth.md` 1-1). [code:chatbot/server.py:5] [code:backend/src/main/resources/application.yml:31] [code:src/components/ChatBot.tsx:281] [code:src/components/ChatBot.tsx:144-153] [docs:04_auth.md]
- **토큰을 주소에 넣지 않는다.** 브라우저 웹소켓은 인증 헤더를 못 붙이고, 주소의 토큰은 ingress, Cloudflare 로그에 남는다. refresh 쿠키는 Path=`/api/auth` 라 `/ws/chat` 에 가지 않는다. 챗봇 로그에도 토큰을 찍지 않는다(실패 까닭만). [code:chatbot/server.py:8] [code:src/auth/session.ts:54-58] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:125] [code:chatbot/server.py:48]
- **체험 관리자 계정도 쓴다**(사용자 3). 챗봇은 읽기만 한다. `GET /api/me` 는 데모 관리자도 통과한다. [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:58] [code:chatbot/eval/login.py:22] [code:chatbot/eval/login.py:130]
- **체험 계정 31개(일반 30 + 관리자 체험 1)를 여러 사람이 함께 쓴다.** 나중에 챗봇 사용을 계측할 때 계정은 사람을 뜻하지 않는다(대시보드 설계 때 다시 볼 일). [code:backend/src/main/resources/db/migration/V3__auth.sql:165] [code:backend/src/main/resources/db/migration/V7__demo_admin.sql:10] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:40]

#### 1-14. 턴 기록(2026-11-14, 로컬)

챗봇 대화 한 턴마다 `chatbot_turns`(V19) 에 한 줄을 남긴다. 대시보드(Grafana)가 챗봇이 얼마나 쓰이고 얼마나 걸리는지 보려는 바닥이다(관측 작업 A-1, 사용자 지시). 칸의 뜻은 `V19__chatbot_turns.sql` 머리말. [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:1-28] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:30-55]

쓰는 길. `chatbot_misses`(`archive/09_chatbot_rag_log.md` 옛 15절)와 같다

- 챗봇은 DB 를 만지지 않는다. `Bot.turn` 이 끝나면(예외로 끝나도) 같은 Pod 백엔드의 내부 POST `/api/internal/chatbot-turns` 로 보낸다(`api/ChatbotTurnController`, `localAddr` 가 루프백일 때만, 그 밖은 404). [code:chatbot/bot.py:101-117] [code:chatbot/bot.py:61] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotTurnController.java:51-53] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:184-193]
- 따로 도는 스레드에서 보낸다. 실패해도 찍기만 하고, 답은 기다리지 않는다. 기록 요청의 timeout 은 3초(`http.LOG_TIMEOUT`, 백엔드가 멈췄을 때 스레드가 오래 쌓이지 않게). [code:chatbot/bot.py:79-89] [code:chatbot/http.py:15]
- 평가는 가로챈다(`Bot(log_turn=…)`). 운영 공개 API 를 읽으므로 운영 백엔드에 보내지 않는다. 잘못 보내도 운영은 루프백이 아니라 404 다. [code:chatbot/bot.py:98] [code:chatbot/eval/run.py:69] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotTurnController.java:53]

| 칸 | 어디서 |
|---|---|
| `conn_id` | 웹소켓 연결마다 `uuid4().hex`(32자). 토큰, 계정에서 만들지 않는다. 대화 상태도 연결이 끊기면 사라지므로 「한 연결 = 한 대화」 [code:chatbot/server.py:80-82] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:4] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:32] |
| `user_id` | 연결 직후 로그인 확인(`GET /api/me`, 1-13절)이 돌려준 `id`. **계정이지 사람이 아니다**. 체험 계정 31개를 여러 사람이 함께 쓴다. 대시보드에서는 「계정 수」와 「연결 수」로만 센다 [code:chatbot/server.py:68-72] [code:chatbot/http.py:53-67] [code:chatbot/bot.py:37] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:5] |
| `question`, `answer` | 받은 글(500자에서 자른 것), 보낸 답. 턴이 예외로 끝났으면 답은 빈 글, 갈래 `error`. 대시보드 읽기 계정에는 이 두 칸을 주지 않는다(컬럼 단위 권한) [code:chatbot/server.py:100] [code:chatbot/bot.py:69-70] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:8-10] |
| `branch` | 답이 정한 갈래, 없으면 라우터 갈래. 아래 표 [code:chatbot/bot.py:66] [code:chatbot/bot.py:70] |
| `by_rule`, `llm_ok`, `health` | 라우터 결과. 라우터를 거치지 않은 턴(되물은 뒤 「네」)은 NULL [code:chatbot/bot.py:71] [code:chatbot/bot.py:145] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:14-15] |
| `fallback_used`, `shoe_count` | 생성 검사에 걸려 코드 답을 냈나, 버튼을 붙인 신발 수 [code:chatbot/bot.py:72] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:17-18] |
| `latency_ms` | `Bot.turn` 처음부터 끝까지(웹소켓 전송은 빠진다) [code:chatbot/bot.py:103] [code:chatbot/bot.py:111] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:19] |
| `router_ms`, `search_ms`, `gen_ms` | `chatbot/timing.py`, 라우터(규칙 + 라우터 LLM), 검색(질문 임베딩, 색인 찾기, 리뷰 벡터), 생성 LLM(라우터 밖의 `llm.chat` 전부, 경험과 후기의 관점 분류 포함). 단계 안에서 다른 단계를 부르면 바깥 단계에만 센다 [code:chatbot/timing.py:5-7] [code:chatbot/timing.py:15] [code:chatbot/timing.py:45-58] |
| `catalog_ms`, `compare_ms`, `recommend_ms`, `review_ms`, `summary_ms` | Spring API 읽기를 API 마다(사용자 2026-11-14, 하나로 묶으면 어느 API 가 느린지 모른다). `http.get_json` 이 주소로 칸을 고른다(`http.api_stage`): `/api/shoes`, `/api/terms`(카탈로그 읽기 둘 다) → catalog, `/api/compare` → compare, `/api/recommend` → recommend, `/api/reviews` → review, `/api/shoes/{id}/summary` → summary [code:chatbot/http.py:20-37] [code:chatbot/timing.py:8-13] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:21-22] |

- 그 턴에 쓰지 않은 단계는 0 이다(NULL 이 아니다). 「안 씀」과 「0ms」를 가를 일이 없고, 합 검사와 평균이 단순해진다. 갈래별 평균은 0 을 빼고 셀지 대시보드에서 정한다. [code:chatbot/timing.py:18] [code:chatbot/timing.py:33-34]
- **칸을 모두 더하면 전체와 맞는다.** 남는 것은 이름 찾기, 검사 같은 파이썬 코드뿐이다. 2026-11-14 조사(86문항, 함수를 감싸 잼)에서 API 읽기를 빼면 평균 1.0ms, 최대 3.0ms 였다. 그 둘에는 칸을 두지 않는다(사용자). 평가는 문항마다 「전체 − 칸 합」을 본다. 5ms 를 넘으면 경고, 30ms 를 넘으면 실패(사용자 2026-11-14). 평가 다섯 번 중 한 번 B12 7ms, E12 29ms 가 나왔는데 다시 재면 3ms 안이었다(GC 0회, 호스트 CPU 흔들림). 재지 않은 API 호출은 공개 주소로 100ms 를 넘으므로 실패로 잡힌다. [code:chatbot/timing.py:16-17] [code:chatbot/eval/run.py:31-34] [code:chatbot/eval/run.py:144-150] [c:3553716]
- 조사 전에는 칸이 라우터, 검색, 생성 셋뿐이라 평균 2,421ms 중 459ms(19%)가 어느 칸에도 없었다. 그 459ms 가운데 458ms 가 API 읽기였다(비교, 추천, 경험과 후기만. 용어, 스펙, 특성 설명은 API 를 부르지 않아 0~1ms). (2026-11-14 기준) [c:3553716]
- 칸을 쪼갠 첫 평가에서 리뷰를 다섯 번 읽는 경험과 후기 넷(E10, E11, E13, E23)이 합 검사에 걸렸다(6~16ms). 응답 객체(연결, TLS 소켓)가 `get_json` 이 돌려준 뒤에 놓여, 호출마다 0.5~1ms 가 칸 밖에서 흘렀다. 칸 안에서 놓게 고친 뒤 호출 하나의 차이 0.5~1.0ms → 0.02~0.04ms, 평가 94/94, 전체 − 칸 합 평균 1.0ms, 최대 3ms. 단계 평균(ms): 전체 2,429, 라우터 967, 검색 8, 생성 981, 카탈로그 0(평가는 미리 읽어 둔다), 비교 96, 추천 102, 리뷰 250, 요약 24. [code:chatbot/http.py:34-36] (2026-11-14 기준) [c:3553716]

갈래 값(코드에 실제로 있는 것, `router.BRANCHES` 와 `Reply(branch=…)`) [code:chatbot/router.py:20] [code:chatbot/bot.py:70]

| 값 | 뜻 |
|---|---|
| `term`, `spec`, `compare`, `recommend` | 용어, 스펙, 비교, 추천 [code:chatbot/router.py:20] |
| `explain` | 특성 설명(통증 + 용도 없음이면 추천 질문도 여기로 답한다) [code:chatbot/router.py:20] [code:chatbot/bot.py:239-243] [code:chatbot/branches/explain.py:118] |
| `experience` | 경험과 후기 [code:chatbot/router.py:20] |
| `out_of_scope`, `greeting` | 범위 밖, 인사 [code:chatbot/router.py:20] |
| `choose` | 같은 이름이 여러 라인에 걸려 되물음 [code:chatbot/bot.py:193] |
| `no_shoe` | 등록되지 않은 신발 [code:chatbot/bot.py:329] [code:chatbot/bot.py:333] |
| `error` | 턴이 예외로 끝남(화면에는 「지금은 답을 만들지 못했어요…」) [code:chatbot/bot.py:62] [code:chatbot/server.py:30] [code:chatbot/server.py:107-109] |

DB 에 CHECK 를 두지 않았다. 챗봇에 갈래가 늘 때 기록이 실패하지 않게. [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:13] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql:37] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotTurnController.java:73]

읽는 길(2026-11-14 사용자, V19 때 정한 것을 바꿨다)

- V19 때는 **읽는 API 를 두지 않았다**. 대시보드가 복제본을 읽고, 질문과 답 칸은 그 계정에 주지 않았다. 관리자가 개별 대화를 읽을 길이 없었다. [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotTurnController.java:27-29] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:22-24]
- 이제 **관리자 페이지의 「대화 보기」가 읽는다**(`GET /api/admin/chatbot-conversations`, `/{connId}`, `api/AdminChatbotTurnController`). 대화(= 연결 하나) 목록을 마지막 턴 최근 순으로, 서버가 페이지를 나눈다. 거르기는 날짜, 계정(번호, 닉네임), 갈래. 펼치면 턴마다 질문, 답 전체, 갈래, 걸린 시간, 쓴 단계의 시간. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:26-30] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:55-66] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:82] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:101-116] [code:src/pages/adminmy/Conversations.tsx:123] [code:src/pages/adminmy/Conversations.tsx:140-142]
- 나눔은 그대로다. **숫자와 추세는 Grafana, 개별 대화는 관리자 화면.** 대화 보기는 합계와 그래프를 그리지 않는다. 대시보드 읽기 계정이 `question`, `answer` 를 못 읽는 것도 그대로다. [code:src/pages/adminmy/Conversations.tsx:55] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:24] <!-- 확인 못 함: 대시보드 읽기 계정의 컬럼 권한은 운영 DB와 인프라에 있다 -->
- **데모 관리자도 질문과 답 원문을 본다**(2026-11-15 사용자). 처음(11-14)에는 데모 관리자 카드를 누구나 쓰므로 서버에서 뺐는데, 시현용 계정이 읽지 못하면 화면이 비어 시현이 안 된다. 실제 서비스로 가면 데모 관리자 계정을 지운다(`04_auth.md` 1-3). [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:31-32] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:54] [docs:04_auth.md]
- 화면에 「체험 계정의 대화는 한 사람의 것이 아니다」를 적고, 체험 계정(시드 30, 데모 관리자)의 대화에 표시를 단다. [code:src/pages/adminmy/Conversations.tsx:74-75] [code:src/pages/adminmy/Conversations.tsx:102] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:33] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:40]
- 보관 정책(질문과 답 90일 뒤 빈 글)은 바뀌지 않았다. 비운 대화는 대화 보기에서 빈 칸 대신 「90일이 지나 질문과 답을 지웠어요.」로 보인다(2026-11-17 사용자, 빈 칸이면 고장 난 것으로 보인다). 질문이 빈 글이면 비운 것으로 본다(챗봇은 빈 질문을 기록하지 않는다). 위 안내 문장에도 90일이 지나면 지운다고 적었다. [code:backend/src/main/resources/application.yml:49] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityCleanup.java:20-22] [code:src/pages/adminmy/Conversations.tsx:46-50] [code:src/pages/adminmy/Conversations.tsx:75] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotTurnController.java:71]

정한 것(사용자 2026-11-14)

- **보관**. 행은 지우지 않는다. 숫자 칸은 계속 두고, 질문과 답만 90일 뒤 빈 글로 바꾼다. 처음에는 Pod 둘이 함께 돌지 않게 하는 잠금이 없어 켜지 않았다. 2026-11-17 `ActivityCleanup` 에 MySQL `GET_LOCK` 을 넣고(ShedLock 은 테이블이 필요해 쓰지 않음, 사용자) 매일 04:00 activity_logs 정리와 같은 잠금 안에서 함께 비운다. 운영에서는 2026-11-17 infra env `ACTIVITY_CLEANUP_CRON` 을 뺐고 켜졌다(infra `d8997bb`).
- **`conn_id`**, 웹소켓 연결마다 무작위 값(uuid4). 화면이 만든 대화 id 를 받지 않는다. 화면이 보낸 값을 믿어야 하고, 대화 상태도 연결이 끊기면 사라져서다. [code:chatbot/server.py:80-82]

확인(2026-11-14)

- 단위 시험 77건(`chatbot/tests/test_turns.py` 10건 더함. 기록이 예외를 던지거나 3초 걸려도 답이 그대로, 곧바로 나감, 닿지 않는 백엔드, 예외로 끝난 턴은 `error`, 단계를 두 번 세지 않음, 연결마다 다른 `conn_id`, `/api/me` 의 계정 id). 백엔드 시험 52건(`ChatbotTurnTest` 6건, 본문 검사). [code:chatbot/tests/test_turns.py:34-174] [code:backend/src/test/java/com/kopo17/runshoes/api/ChatbotTurnTest.java:38-114] (2026-11-14 기준) [c:3553716]
- 끝에서 끝: 빈 임시 MySQL(tmpfs, 끝나면 사라짐)에 V1~V19 를 Flyway 로 올리고, 실제 `server.handler` + 체험 로그인 토큰 + 로컬 Ollama 로 여섯 턴 → 표에 여섯 줄(같은 `conn_id`, 계정 id 1, 한글 그대로). 내부 POST 는 루프백 204, 호스트 주소로 들어오면 404(`X-Forwarded-For: 127.0.0.1` 을 붙여도 404), 틀린 본문 400. [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotTurnController.java:53-55] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotTurnController.java:64] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:184-193] [code:chatbot/server.py:79-82] (2026-11-14 기준) [c:3553716]
- 같은 임시 DB 에서 컬럼 단위 권한 미리 보기: 질문과 답을 뺀 칸만 준 계정은 집계가 되고, `question`, `answer` 를 읽으면 `ERROR 1143`, `SELECT *` 는 `ERROR 1142`. (2026-11-14 기준) [c:3553716]
- 평가(운영 공개 API 읽기만 + 로컬 Ollama, model-service): **94/94**, 수치 불일치 0, 전문의 누락 0, 평균 2.6초. 문항마다 턴 기록이 한 줄이고 답, 갈래, 신발 수가 실제와 같은지 본다(실패 0). 단계 평균 latency 2,441, router 968, search 7, gen 1,007ms. 예: T01 용어 877 = 라우터 877, S01 스펙 1,781(라우터 954, 생성 825), E01 경험과 후기 2,529(라우터 928, 검색 15, 생성 1,366). 검색이 잡힌 문항 26개. [code:chatbot/eval/run.py:69] [c:3553716]

대시보드(관측 작업 B, 2026-11-14 초안)

- **Grafana 는 추세를 본다(세는 곳), 관리자 화면은 개별 건을 본다(손대는 곳). 숫자와 그래프는 관리자 화면에 다시 그리지 않는다**(사용자). [code:src/pages/adminmy/Conversations.tsx:55]
- 대시보드 「runshoes 운영」은 인프라 저장소에 둔다(`apps/monitoring/grafana/dashboards/gen_runshoes.py` → JSON, 펫퍼민트와 같은 꼴, UI 에서 고친 것은 남지 않는다). 이 저장소에는 넣지 않는다. <!-- 확인 못 함: 대시보드 코드는 인프라 저장소에 있다 -->
- 묶음 일곱: 서비스 상태, API(Spring 관리 포트 9000), 챗봇(이 표), GPU(펫퍼민트와 나눠 씀), 사이트 활동(`activity_logs`), 리뷰 요약 배치(`summary_batch_runs`), 서버 기록(Loki). MySQL 은 복제본을 읽기 계정 `grafana_ro` 로 읽는다(`07_database.md` 1-6절, 질문과 답 칸은 권한이 없어 쿼리는 칸 이름을 적는다). [code:backend/src/main/resources/application.yml:58-61] [code:backend/src/main/resources/db/migration/V3__auth.sql:113] [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql:19] [code:backend/src/main/resources/db/migration/V21__grafana_compare_views.sql:3] [docs:07_database.md] <!-- 확인 못 함: 대시보드 묶음과 복제본 읽기는 인프라 저장소에 있다 -->
- 패널 글은 처음 보는 사람이 읽게 쓴다. 제목에 지표와 칸 이름을 쓰지 않고, 설명에 무엇을 재나, 높거나 낮으면 무슨 뜻, 무엇이 섞였나(체험 계정 등), 언제부터, 출처. 「사용자 수」라고 쓰지 않는다. 「계정 수」, 「연결 수」. <!-- 확인 못 함: 패널 글은 인프라 저장소에 있다 -->

#### 1-15. 카탈로그 캐시(2026-11-14, 로컬)

전에는 챗봇이 턴마다 카탈로그(`/api/shoes` 약 1MB + `/api/terms`)를 새로 읽었다. 「드롭이 뭐예요?」에도 310켤레를 먼저 받았다. 이제 한 번 읽어 두고(`catalog.CatalogCache`), **신발이 바뀔 때만** 다시 읽는다. 시간으로 만료시키지 않는다(사용자). [code:chatbot/catalog.py:116-120] [code:chatbot/catalog.py:288-297] [code:chatbot/bot.py:94-95] (2026-11-14 기준) [c:3553716]

어떻게 바뀐 것을 아나, 「판」

- 챗봇은 턴마다 같은 Pod 백엔드에 판만 묻는다. `GET /api/internal/catalog-version`(`api/CatalogVersionController`, 루프백만, 그 밖 404). 판은 `CHECKSUM TABLE shoes, terms` 두 값이다. 지난번과 다르면 다시 읽는다. [code:chatbot/catalog.py:277-285] [code:chatbot/catalog.py:308-320] [code:backend/src/main/java/com/kopo17/runshoes/api/CatalogVersionController.java:30-35]
- 판을 DB 내용으로 만든 까닭, 신발이 바뀌는 길이 관리 화면만이 아니다. [code:backend/src/main/java/com/kopo17/runshoes/api/CatalogVersionController.java:16-18]
  - 관리 화면: 등록 `POST /api/shoes`, 수정 `PATCH`, `PUT /api/shoes/{id}`, 숨김 `DELETE /api/shoes/{id}`, 되살리기 `POST /api/admin/shoes/{id}/restore`, 영구 삭제 `DELETE /api/admin/shoes/{id}` [code:backend/src/main/java/com/kopo17/runshoes/api/JsonServerController.java:60] [code:backend/src/main/java/com/kopo17/runshoes/api/JsonServerController.java:71] [code:backend/src/main/java/com/kopo17/runshoes/api/JsonServerController.java:79] [code:backend/src/main/java/com/kopo17/runshoes/api/JsonServerController.java:88] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:157-163] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:67] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:72]
  - 적재기(`X-Runshoes-Client: loader`)의 등록과 수정. `updated_at` 을 찍지 않는다(`ShoeCollection`). 그래서 `MAX(updated_at)` 같은 판으로는 놓친다 [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:34-36] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:95-96] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:268-269] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:281]
  - 리뷰와 찜. `rating`, `reviewCount`, `likeCount` 가 바뀐다(챗봇이 `reviewCount` 를 쓴다) [code:chatbot/bot.py:326] [code:chatbot/branches/experience.py:352] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:256]
  - 사람이 SQL 로 고친 것 [code:backend/src/main/java/com/kopo17/runshoes/api/CatalogVersionController.java:17]
  어느 길이든 행이 바뀌면 체크섬이 바뀐다. 관리 API 마다 「캐시 비우기」를 끼우면 적재기, 리뷰, SQL 을 놓치고, 끼우는 것을 잊는 새 API 도 생긴다. [code:backend/src/main/java/com/kopo17/runshoes/api/CatalogVersionController.java:17-18] [code:chatbot/catalog.py:291]
- `CHECKSUM TABLE` 은 310켤레에서 약 4ms, 열린 쓰기 트랜잭션을 기다리지 않았다(로컬 확인). 판 묻기 한 번은 로컬 127.0.0.1 로 6~10ms. [code:backend/src/main/java/com/kopo17/runshoes/api/CatalogVersionController.java:19] (2026-11-14 기준) [c:3553716]

Pod 가 둘일 때, 정한 것(사용자 2026-11-14)

- 챗봇은 웹 Pod 의 사이드카라 Pod 마다 자기 캐시를 가진다. 관리 요청은 Pod 하나에만 닿는다. [code:chatbot/http.py:1] [docs:06_deployment.md] <!-- 확인 못 함: Pod 구성은 인프라 저장소에 있다 -->
- **턴마다 판 묻기.** 판이 같은 DB 에서 나오므로 Pod 수와 상관없이 다음 턴에 맞춰진다. 클러스터 설정이 없다. 대가는 턴마다 작은 호출 하나(로컬 6~10ms). [code:chatbot/catalog.py:292] [code:chatbot/catalog.py:308-311] (2026-11-14 기준) [c:3553716]
- 비우는 길도 이 체크섬 판 그대로다. 관리 API 마다 비우기를 끼우지 않는다(사용자). [code:chatbot/catalog.py:293]
- 다른 안: 바뀐 Pod 의 Spring 이 모든 챗봇 Pod 에 알림(헤드리스 Service 같은 클러스터 설정이 필요하고, 알림이 실패하면 낡는다), 자기 Pod 만 비우고 나머지는 최대 보관 시간에 맡김(그 시간 동안 Pod 마다 다른 답이 나간다).

실패했을 때

- 판을 묻지 못하면(백엔드가 아직 안 뜸, 판 API 가 없는 옛 이미지, 평가처럼 공개 주소) 그 턴은 새로 읽는다. 캐시 전과 같은 동작이고 낡은 카탈로그를 쓰지 않는다. 다음 턴에 판을 다시 묻는다. [code:chatbot/catalog.py:295-296] [code:chatbot/catalog.py:310-320]
- 다시 읽다 실패하면 그 턴은 실패한다(「지금은 답을 만들지 못했어요」). 옛 카탈로그로 답하지 않는다. [code:chatbot/catalog.py:319] [code:chatbot/bot.py:120] [code:chatbot/server.py:107-109]
- 그래서 최대 보관 시간은 두지 않는다(사용자 2026-11-14, 옛 카탈로그로 답하는 경우가 없다). 남는 위험은 내용이 바뀌었는데 체크섬이 같은 경우뿐인데, 그런 길은 찾지 못했다. [code:chatbot/catalog.py:294]
- 여러 턴이 동시에 다시 읽지 않게 잠근다(한 번 읽고 나머지는 그것을 쓴다). 카탈로그는 만든 뒤 읽기만 한다. 턴이 공유 객체를 고치는 코드가 없는 것을 확인했다. [code:chatbot/catalog.py:317]

시간 칸. 판 묻기, 다시 읽기, 이름 색인 만들기(310켤레 약 8~17ms)가 모두 `catalog_ms` 에 든다. 전에는 색인 만들기가 어느 칸에도 들지 않았다(평가는 카탈로그를 미리 읽어 둬 합 검사가 못 잡았다). [code:chatbot/catalog.py:118-120] [code:chatbot/catalog.py:309] (2026-11-14 기준) [c:3553716]

평가와의 관계. 평가는 지금처럼 카탈로그를 미리 한 번 읽어 넘긴다(`Bot(load=…)`). 평가는 운영 공개 API 를 읽어 판 API(루프백만)를 부를 수 없고, 부르면 턴마다 새로 읽어 평가가 1초쯤씩 느려진다. 그래서 평가의 `catalog_ms` 는 늘 0 이고, 캐시의 동작은 단위 시험(`chatbot/tests/test_cache.py`)과 아래 끝에서 끝이 본다. [code:chatbot/eval/run.py:69] [code:chatbot/bot.py:94-95] [code:chatbot/tests/test_cache.py:38-92] (2026-11-14 기준) [c:3553716]

확인(2026-11-14)

- 단위 시험 7건: 판이 같으면 한 번만 읽음, 판이 바뀌면 다음 턴에 새 값, 숨긴 신발이 빠짐, 판을 묻지 못하면 턴마다 새로 읽음, 다시 읽기 실패면 턴이 실패(옛 것을 쓰지 않음), 동시 8턴에 한 번만 읽음, 시간이 catalog 칸에. [code:chatbot/tests/test_cache.py:38-92] (2026-11-14 기준) [c:3553716]
- 끝에서 끝: 임시 스택(Spring + 임시 MySQL, 개발 DB 덤프 310켤레, 개발 DB 에는 읽기만) + 로컬 Ollama, 9/9. (2026-11-14 기준) [c:3553716]
  - 「드롭이 뭐예요?」 네 번, `catalog_ms` 256 → 11 → 10 → 7, 다시 읽음 1번. (2026-11-14 기준) [c:3553716]
  - 관리 API 로 고치고 바로 물음: 수정(`PATCH`, 무게 255 → 199g), 적재기 수정(201g), 숨김(→ "등록되어 있지 않았어요"), 되살리기(→ 201g), 등록(새 신발 222g), 영구 삭제(→ 없음). 모두 바로 다음 질문에 맞았다. (2026-11-14 기준) [c:3553716]
  - 캐시 전과 후(같은 질문 10개, 로컬 127.0.0.1): `catalog_ms` 중앙값 86 → 8.5ms. 전체 중앙값 1,003 → 921ms(LLM 이 대부분이라 흔들린다). 운영 Pod 안에서는 재지 못했다(클러스터 금지). 배포 뒤 `catalog_ms` 로 보인다. (2026-11-14 기준) [c:3553716]
  - 턴 기록 21줄, 전체 − 칸 합 0~3ms. (2026-11-14 기준) [c:3553716]

#### 2. 왜 이렇게 했나

#### 2-1. cc 설계안과 달라진 점

| 항목 | cc안 | 확정 |
|---|---|---|
| 임베딩 | bge-m3 (Ollama) | KURE-v1, model-service 분리(리랭커도 함께) [code:chatbot/search/embed.py:1] |
| 서버 언어 | A (Node 재작성) | C (Spring API + 파이썬 챗봇 유지) [code:chatbot/http.py:1] [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:18-22] |
| 말투 | 반말, 이모지 1~2 | 해요체, 이모지 없음, 러닝화 담당자 [code:chatbot/prompt.py:35-38] |
| 무게 | M9만 비교, 나머지 제외 | 환산해서 비교 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:8-16] [code:backend/src/main/java/com/kopo17/runshoes/compare/ComparePolicy.java:40-48] |
| 요약 | 배치 안 함 | 배치 전환 (화면 성능 목적) [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:15-16] |
| 리뷰 집계 | "리뷰 N건이 언급" | 전체 분모 함께 표기 [code:chatbot/branches/experience.py:196-203] |
| 통증 판별 | 없음 | 라우터 LLM 플래그 (키워드 아님) [code:chatbot/router.py:46] [code:chatbot/router.py:181] |

같은 것: 벡터 DB 불필요, 리뷰 원문 사용(요약 대체 아님), BM25 하이브리드, 수치는 코드가 넣기, 이름 찾기는 코드, 통증에 진단 금지. [code:chatbot/search/index.py:1-3] [code:chatbot/facts.py:1] [code:chatbot/catalog.py:3]

#### 2-2. 로그인한 사람만, Claude 가 정한 것

Claude 가 정한 것(지시에 없던 자리)

- **기다리는 시간 10초.** 화면은 연결되자마자 보내므로 정상이면 수십 ms 다. 느린 모바일 망에도 넉넉하고, 붙기만 하고 말 없는 연결을 오래 두지 않는다. [code:chatbot/server.py:31]
- **401 만 "토큰이 틀렸다"로 본다.** 배포 직후 같은 Pod 백엔드가 아직 안 떴으면 `/api/me` 가 연결 실패(또는 5xx)다. 이것을 `auth_failed` 로 보내면 화면이 refresh 를 부르고 다시 붙어 또 실패해 "다시 로그인"을 띄운다. 그래서 `auth_unavailable` 로 가르고 화면은 refresh 하지 않는다. 403 도 같은 쪽(지금 `/api/me` 는 403 을 주지 않는다). 거꾸로 헤더에 실을 수 없는 토큰은 요청이 예외로 빠져 "안 뜸"으로 잘못 갈리므로, 부르기 전에 `auth_failed` 로 막는다. [code:chatbot/server.py:73-76] [code:chatbot/server.py:65-67] [code:src/components/ChatBot.tsx:104-108]
- **첫 refresh 중(status loading)**, 패널에 "로그인 상태를 확인하고 있어요…" 만 보이고 연결은 열지 않는다. 끝나면 로그인한 사람은 그대로 연결, 아니면 안내로 바뀐다(로그인한 사람에게 안내가 잠깐 비치지 않게). [code:src/components/ChatBot.tsx:270-275]
- **아무 답 없이 끊김, 인사 뒤 끊김(배포 등)**, "연결이 끊겼어요. 다시 연결을 눌러 주세요." + [다시 연결]. 그 전에는 "연결 중입니다…" 가 그대로 남았다. [code:src/components/ChatBot.tsx:40] [code:src/components/ChatBot.tsx:118-124] [code:src/components/ChatBot.tsx:179]
- **[다시 연결](2026-11-17 사용자)**. refresh 가 서버에 닿지 못함, 백엔드가 아직 안 뜸, 끊김, 셋 다 「로그인은 멀쩡한데 연결만 안 된」 상태라 같은 버튼을 붙였다(꼴은 로그인 안내와 같다). 누르면 처음 연결과 같은 길이다. 토큰이 만료됐으면 다시 `auth_failed` → refresh. 전에는 "창을 닫았다가 다시 열어 주세요"로 사용자에게 일을 시켰고, 93d8ce4(refresh 가 닿지 못해도 로그인 유지) 뒤로는 refresh 가 닿지 못하면 소켓이 닫힌 채 "연결 중입니다…" 에 멈췄다(그 전에는 로그아웃에 가려 보이지 않았다). 화면의 대화는 남기지만 챗봇 서버 쪽 대화 맥락(`bot.State`)은 새 연결이라 이어지지 않는다. 새 인사가 그 아래 붙고, 턴 기록도 새 `conn_id` 라 관리 화면 대화 목록에 새 대화로 남는다(「한 연결 = 한 대화」 그대로). [code:src/components/ChatBot.tsx:127-141] [code:src/components/ChatBot.tsx:60] [code:src/components/ChatBot.tsx:202-207] [code:chatbot/server.py:80-82] [c:93d8ce4]
- **토큰을 꺼내는 함수** `session.chatToken()` 을 더했다. 그 전에는 모듈 밖에서 토큰을 꺼낼 길이 없었다. 다른 곳은 지금처럼 `apiFetch` 를 쓴다. [code:src/auth/session.ts:54-58]
- **로그인과 가입 화면에서 [로그인]** 은 그 자리에 둔다(헤더와 같은 규칙, `returnTo` 가 겹치지 않게). [code:src/components/ChatBot.tsx:247-253] [code:src/components/Header.tsx:38]

평가

- 79문항(`chatbot/eval/run.py`)은 웹소켓을 거치지 않고 `Bot` 을 바로 부른다. 로그인과 상관없어 그대로 둔다. [code:chatbot/eval/run.py:9] [code:chatbot/eval/run.py:69] (2026-11-13 기준) [c:2e5e1c7]
- 로그인 문턱 L01 ~ L08(`chatbot/eval/login.py`). 실제 `server.handler` 를 빈 포트로 띄우고 가짜 `/api/me`(체험 토큰 둘만 200, 나머지 401)를 붙인다. 봇은 가짜(LLM, API 안 부름). 토큰 없이 질문, 잘못된 토큰, auth 없음(시험에서만 0.5초), 체험 계정, 관리자 체험 계정, 백엔드 안 뜸, 빈 토큰, 헤더에 실을 수 없는 토큰(줄바꿈). 평가 끝에 함께 돌고(`--out` 에 `cat: "login"`), 단위 시험(`chatbot/tests/test_auth.py`)도 같은 것을 부른다. [code:chatbot/eval/login.py:1-5] [code:chatbot/eval/login.py:21-35] [code:chatbot/eval/login.py:126-133] [code:chatbot/eval/login.py:172] [code:chatbot/eval/run.py:338-342] [code:chatbot/tests/test_auth.py:1-10]
- 결과(2026-11-13, 운영 공개 API 읽기만 + 로컬 Ollama, model-service, 두 번): **87/87, 87/87**(79문항 + 로그인 8). 수치 불일치 0, 전문의 누락 0. 로그인 8문항의 받은 프레임과 닫는 코드를 `--out` 전문에서 확인(4401 다섯, 4503 하나, 열린 채 둘). 단위 시험 63건. 웹 `yarn build` 통과, 바꾼 파일 eslint 0건(전체 lint 의 5건은 손대지 않은 `ReviewSection`, `Best`, `Recommend`, `ShoeList` 에 원래 있던 것). [c:2e5e1c7]

#### 3. 시도했던 것들

#### 3-1. 작업 순서

| 단계 | 내용 | 비고 |
|---|---|---|
| 1 | 리뷰 요약 배치 전환 | GPU 경합 해소. 챗봇 개발 전에 치운다 [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryBatch.java:15-23] |
| 2 | 무게 환산 (DB + compare) | 화면도 같이 바뀐다 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:8-16] |
| 3 | compare, recommend → Spring API | 프런트 전환 포함 [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:44-81] |
| 4 | model-service 분리(임베딩, 리랭커) | 펫퍼민트 영향 있음. 신중하게 <!-- 확인 못 함: model-service 는 저장소 밖 --> |
| 5 | 챗봇 RAG | 본작업 [code:chatbot/] |

1, 2는 독립이고 작다. 3은 중간 규모. 4는 펫퍼민트를 건드리므로 뒤로. 5가 본작업.

별도 작업으로 뺀 것: 용어 사전 보강 21개(1-9절), 리랭커 도입 판단. 남은 일은 `TODO.md`. [docs:TODO.md]

상태 (2026-11-10)

- 1, 2단계: 운영 적용(1-6절, 1-5절). <!-- 확인 못 함: 운영 적용은 클러스터 -->
- 3단계: 서버 API `GET /api/compare`, `GET /api/recommend`(`compare/` 패키지)를 만들었다. 이관 전 브라우저 계산의 얼린 사본(`scripts/parity/reference/`)과 로컬 310켤레(운영 공개 API 스냅숏) 전수 대조 불일치 0. 두 번에 나눠 배포한다. 1차는 서버 API 만(화면은 그대로 브라우저 계산), 운영 대조가 통과하면 2차로 화면을 API 호출로 바꾼다(2026-11-10 사용자). [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:44-81] [code:scripts/parity/reference/] [code:scripts/parity/check.mjs:1-8] (2026-11-10 기준) [c:a40a472]
  - 1차 운영 대조(이미지 `ddb4496d5e90`) 불일치 0, 서버 응답 약 16ms(내부 VIP, `/api/terms` 6ms). 2차, 화면을 API 호출로 바꿨다(운영 적용: 이미지 `9a563cfa090c`). 운영 캡처 20쌍이 바꾸기 전 운영과 픽셀까지 같다(`08_compare.md` 5절). 운영 브라우저에서 잰 왕복, 비교 배지가 붙기까지 약 250ms, 추천 마지막 문항 → 결과 약 265ms. 빠르게 빼고 되돌려도 배지가 그 구성의 API 값과 같았다. [docs:08_compare.md] (2026-11-10 기준) [c:acea546] <!-- 확인 못 함: 운영 이미지와 운영에서 잰 시간은 클러스터 -->
  - **3단계 끝(2026-11-10).** 비교와 추천 계산은 서버 한 곳이다. 챗봇(5단계)은 같은 API 를 부른다. 추천 규칙(데이터 없음 중립 등)은 `10_recommend.md`. [code:chatbot/branches/compare.py:26] [code:chatbot/branches/recommend.py:160] [docs:10_recommend.md]
- **4단계 끝(2026-11-11)**, model-service(처음 이름은 embedding-service) 운영. 17:34 등록, 펫퍼민트 search-service 17:38 원격 모드로 전환(재시작 한 번). 전후 대조 391건 다름 0, 검색 회귀 지표 같음. GPU 는 모델 한 벌(전환 뒤 3.5GB, 부하 뒤 6.4GB). 재부팅 순서는 다음 재부팅 때 확인(model-service 런북 8절). [c:b1d4e2a] <!-- 확인 못 함: model-service 운영과 GPU 값은 서버 PC -->
- **5단계(챗봇 RAG)**, 지시서를 작업 단위로 나눠 받는다.
  - 5-1(검색 없는 갈래, 용어, 스펙, 비교, 추천): 로컬 구현과 평가 끝, 운영 반영(2026-11-12, 이미지 `e6a8642a3ed9`, V17, V18. 같은 날 문서 머지로 `13a9d3851eaf` 다시 배포, 이것이 지금 운영). `archive/09_chatbot_rag_log.md` 옛 15절. [code:backend/src/main/resources/db/migration/V17__terms_outsole_id.sql:1] [code:backend/src/main/resources/db/migration/V18__chatbot_misses.sql:1] <!-- 확인 못 함: 운영 이미지 태그는 인프라 저장소 -->
  - 5-2(검색, 경험과 후기, 특성 설명의 설명문 근거): 운영 반영(2026-11-13, main `6bb9b1f`, 새 마이그레이션 없음) [c:6bb9b1f]. `archive/09_chatbot_rag_log.md` 옛 16절. [code:chatbot/search/] [code:chatbot/branches/experience.py:1]
  - 메서드는 1-4절의 POST 가 아니라 GET 이다. 읽기만 하는 계산이고, 보안 설정이 "GET 은 누구나, 그 밖은 로그인"이라 POST 면 두 경로만 예외로 열어야 했다(2026-11-10 사용자). [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:59] [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:63] [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:45] [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:64]

#### 3-2. 구현 기록

차수별 구현 기록은 `archive/09_chatbot_rag_log.md` 로 옮겼다(2026-11-17 사용자). 지금과 다른 옛 설정은 지우고, 왜 바꿨는지는 남겼다. 차례:

- 「15. 1단계 구현 — 작업 5-1(2026-11-12, 운영 반영)」
- 「16. 2단계 구현 — 작업 5-2(2026-11-12, 로컬)」
- 「운영 뒤 수정(2026-11-13 — main 6bb9b1f 운영 반영 뒤, 사용자 승인)」
- 「운영 뒤 수정 2 — 0건일 때 스펙 한 줄(2026-11-13, 사용자 승인 (나) — "0건이 310켤레 중 240켤레쯤이라는 숫자를 보고 정했다. 그대로 두면 답이 자주 빈다")」
- 「운영 뒤 수정 3 — 근거 리뷰도 관점 문장으로 자른다(2026-11-13, 사용자 지시 · 로컬)」
- 「운영 뒤 수정 4 — 관점 없는 질문은 요약 블록으로(2026-11-13, 사용자 지시 · 로컬)」
- 「운영 뒤 수정 5 — 이름 없이 이어 묻는 질문은 직전 신발로(2026-11-14, 사용자 지시 · 로컬)」
- 「운영 뒤 수정 6 — 추천 조건 여러 벌(2026-11-14, 사용자 지시 · 로컬)」

#### 4. 남은 한계

#### 4-1. 5-1 남은 한계

- **생성 답이 코드 답과 거의 같다.** 코드 답을 참고로 주니 LLM 은 말투만 조금 다듬는다. 숫자 정확도와 맞바꾼 것이고, 예시의 말투가 덜 묻어난다. 안 하는 까닭: 숫자 정확도와 맞바꾼 것이다. [code:chatbot/branches/common.py:12] [code:chatbot/branches/common.py:77-78]

5-1 남은 한계, 지금 고치지 않는다(사용자 2026-11-12). 근거가 사전뿐이라 생기는 문제라 5-2 에서 설명문과 리뷰가 들어오면 성격이 바뀐다. **5-2 뒤에 다시 보고, 그때도 남아 있으면 고친다.**

- **B06, 같은 뜻을 되풀이한다.** 근거로 줄 사전 설명이 한두 줄뿐이라, 서너 문장을 채우려고 같은 말을 바꿔 쓴다. 안 하는 까닭: 위 머리말.
- **B02, 끝맺는 인사말 줄이 붙는다.** 코드가 붙이는 안내, 묻는 말과 별개로 LLM 이 인사 한 줄을 더 쓴다. 안 하는 까닭: 위 머리말.
- **B03, 가끔 짧은 코드 답이 나간다.** LLM 답에 금칙어("전문가")가 나오면 검사가 사전 원문을 옮긴 코드 답으로 바꾼다. 틀린 말은 없지만 짧고 딱딱하다. 안 하는 까닭: 위 머리말. [code:chatbot/reply.py:16] [code:chatbot/reply.py:205-209]

5-1 남은 한계(위), 지금 상태(TODO 줄은 사용자가 정할 때까지 둔다)

- B06(같은 뜻 되풀이). 자동 검사 없음. 특성 설명에 설명문 문장이 더해진 뒤 읽은 답에서 보이지 않았다(5-2 첫 평가).
- B02(끝맺는 인사말 줄). 5 ~ 9차 평가의 경험과 후기 LLM 글에서 7차 2회 한 번, 9차 1회 물음 한 번(`archive/09_chatbot_rag_log.md` 옛 16절). 경계 문항에서는 보이지 않았다. (2026-11-13 기준) [c:c80ef57]
- B03(짧은 코드 답). 9차 2회 B03 한 번(목록 이야기), 7차 두 번 평가에 한 번씩, 8차 0(8차는 B05 두 번, 예시 숫자, 9차에 사라짐). (2026-11-13 기준) [c:c80ef57]

#### 4-2. 5-2 남은 한계(2026-11-13, 알고 두고 가는 것. 운영에 올린 뒤 실제 질문을 보고 다시 정한다)

| 무엇 | 지금(9차 평가) | 운영에서 볼 것 |
|---|---|---|
| **여는 말**("리뷰를 몇 가지 말씀드릴게요", "…을 말씀드릴게요") | 관점 없는 질문 0, 여러 켤레 E10 두 번 | 경험과 후기 답 가운데 여는 말로 시작하는 비율, 사용자가 거슬려하는지. 안 하는 까닭: 4-2 머리말 (2026-11-13 기준) [c:c80ef57] |
| **묶음 머리를 그대로 옮김**("아쉽다는 쪽 리뷰가 있어요") | 관점 없는 질문 0(8차 네 번), 관점 있는 질문 E13 두 번 | 같은 비율. 어색하다는 반응이 있으면 근거 머리 글을 바꾼다. 안 하는 까닭: 4-2 머리말 (2026-11-13 기준) [c:c80ef57] |
| **같은 신발 집계가 질문마다 다르다** | 젤 님버스 28 통증. E14 4건(좋다 1, 아쉽다 3), E16 3건(아쉽다 3), 두 번 모두 같다. 긍부정과 언급을 LLM 이 질문과 함께 판별하기 때문 | 같은 신발, 같은 관점 질문의 집계 숫자가 얼마나 흔들리는지(로그). 크면 판별을 질문과 떼어 캐시. 안 하는 까닭: 판별을 캐시하면 질문 맥락을 못 본다 [code:chatbot/branches/experience.py:723-727] (2026-11-13 기준) [c:c80ef57] |
| **발 유형과 증상을 나누지 않고 전문의 안내를 모두 붙인다** | 몸 이야기가 조금이라도 있으면 맨 앞에 안내(1-8절, 임시) | 발 유형만 말한 질문("평발인데 …")에 안내가 붙는 비율, health_context true 비율. 사전 통증 항목 보강 때 기준(`TODO.md`). 안 하는 까닭: 4-2 머리말 [code:chatbot/router.py:76-80] [docs:TODO.md] |
| 여러 켤레 답의 길이가 흔들린다 | E10 첫 신발 9~10문장("두세 문장" 지시), 다른 신발 2~4 | 여러 켤레 답 길이 분포. 첫 신발만 긴지. 안 하는 까닭: 4-2 머리말 (2026-11-13 기준) [c:c80ef57] |
| 스펙 덧붙임, "~답니다" | S01 무게만 물었는데 "넓은 폭 버전도 나온답니다"(9차 두 번, 예시를 바꾼 뒤 처음) | 스펙 답의 해요체 경고, 물은 것 밖 문장 비율. 안 하는 까닭: 4-2 머리말 (2026-11-13 기준) [c:c80ef57] |
| 숫자 뒤 조사 | "노바블라스트 6는"(6 = 육 → "은"), LLM 글 | 사용자 지적이 있으면 코드에서 조사 맞추기. 안 하는 까닭: 4-2 머리말 |

남은 한계(1 ~ 4차 수정 때 적은 것, 지금 상태는 위 「5-2 남은 한계」)

- **집계가 질문마다 다를 수 있다**(3차 수정 9, 두고 간다). 같은 신발, 같은 관점이어도 질문 글이 다르면 숫자가 다르다(젤 님버스 28 통증 4건 ↔ 3건, E14, E16). 긍부정과 언급 여부를 LLM 이 질문과 함께 판별하기 때문이다. 판별을 캐시하면 질문 맥락을 못 본다. 안 하는 까닭: 판별을 캐시하면 질문 맥락을 못 본다. [code:chatbot/branches/experience.py:723-727] (2026-11-13 기준) [c:8389dc0]
- **뜻 없는 문장**. E10 끝 "페가수스 42가 해당해요."(2회차), E02 설명문 문장을 두 번 씀. E06, E07 "…리뷰가 여러 개 있어요"류는 4차 두 번 모두 없었다. 안 하는 까닭: 4-2 머리말. (2026-11-13 기준) [c:c884594]
- **설명문 원문의 말이 섞인다**. "와이드 모델"(쉬운 말 경고 8~9), 브랜드 첫 언급 빠짐(경고 4~5). 경고로만 센다. 안 하는 까닭: 4-2 머리말. (2026-11-13 기준) [c:b11e139]
- **통증이 아닌데 전문의 안내**(경고 4). "무릎 괜찮아요?"처럼 몸을 말하면 라우터가 넓게 잡는다(1-8절이 받아들인 손해). 안 하는 까닭: 1-8절이 받아들인 손해다. [code:chatbot/router.py:76-80] (2026-11-13 기준) [c:b11e139]
- **리뷰가 1건인 신발**. "리뷰 근거가 많지 않아요 — 1건 중 1건에서만 나온 이야기예요"가 된다. 틀리지는 않지만 어색하다. 안 하는 까닭: 4-2 머리말. [code:chatbot/branches/experience.py:190-195]

**조건: 우리가 고르지 않은 것**

- **두 Pod 의 색인이 최대 10분 다를 수 있다**(1-2절 표). 집계 숫자는 API 를 새로 읽어 갈리지 않지만, 여러 켤레 질문의 신발 순위는 갈릴 수 있다. [code:chatbot/search/service.py:23] [code:chatbot/search/memory.py:4] [code:chatbot/branches/experience.py:362]

| 무엇 | 지금(9차 평가) | 운영에서 볼 것 |
|---|---|---|
| **0건이 가장 흔한 무릎, 사이즈, 통기성은 붙일 스펙이 없다. 사전 보강이나 설명문 쪽에서 메울 자리**(사용자) | 0건 신발(관점 낱말이 든 리뷰가 없는 신발, 운영 공개 API 2026-11-13): 무릎 241, 사이즈 247, 통기성 247 /310. 0건 답은 "이 신발 리뷰 N건 가운데 그 부분을 말한 리뷰는 없었어요." + "보러 가실래요?"뿐. 스펙 한 줄은 쿠션, 무게, 발볼, 안정감만(운영 뒤 수정 2) | 이 세 관점 0건 질문의 비율. 많으면 용어 사전 보강, 설명문에서 메운다 [code:chatbot/branches/experience.py:187] [code:chatbot/branches/experience.py:488] [c:92a8b41] |
| 악성 리뷰 인용 | 가상 리뷰라 지금은 없다(1-7절) | 실유저 리뷰가 들어오는 때. 신고, 필터와 함께 |

#### 5. 검증 항목

#### 5-1. 평가

골든셋 61문항. 사용자가 작성하되 기계적인 부분은 나눠 맡을 수 있다. [code:chatbot/eval/golden.jsonl:1] [code:chatbot/eval/golden-boundary.jsonl:1]

- 용어 10 / 스펙 10 / 비교 10 / 추천 16 / 경계 15 [code:chatbot/eval/golden.jsonl:1] [code:chatbot/eval/golden-boundary.jsonl:1]
- 경계 15 = 완전 거절 5 + 통증, 우열 유도 10 [code:chatbot/eval/golden-boundary.jsonl:1]
- 경계 문항은 키워드가 안 걸리는 문장으로 쓴다. "며칠 전부터 발 디딜 때마다 찌릿해요" 같은 식. 라우터가 진짜 의미를 보는지 여기서 판가름 난다

| 지표 | 방법 |
|---|---|
| Hit@5 | 질문별 정답 `shoe_id` 라벨 [code:chatbot/eval/run.py:225-229] |
| 수치 정확도 | 답변 속 숫자 ↔ API 원값 자동 대조 (불일치 0 목표) [code:chatbot/eval/run.py:231-236] |
| 분모 표기 | 리뷰 집계 답변에 전체 건수가 들어갔는지 [code:chatbot/eval/run.py:375] |
| 안전 문구 누락률 | `health_context` 질문에서 문구가 빠진 비율 (0이어야 함) [code:chatbot/eval/run.py:238-241] |
| 진단성 표현 | "~때문입니다", "증상", "치료" 정규식 [code:chatbot/eval/run.py:272-274] |
| 금칙어 | "러너들이", "실제 사용자", "많은 사람들", "대부분의 사용자", "사용자들"(5-2 에서 셋 더함), "판/플레이트" [code:chatbot/eval/run.py:285-290] [code:chatbot/reply.py:16] |
| 분모(5-2) | 답의 「리뷰 N건 중」 ↔ API 건수, 좋다 + 아쉽다 = 관점 이야기 ≤ N(5차 수정 전엔 언급 + 나머지 = N), 집계 문장의 숫자가 코드 집계와 같은지 [code:chatbot/eval/run.py:375] [code:chatbot/branches/experience.py:7] |

샘플 검수하지 않는다. 전수 자동 검증으로 간다. [code:chatbot/eval/run.py:1]

#### 절 번호 짝(옛 → 새)

코드 주석이 가리키는 옛 절 번호는 아래 표에서 찾습니다

| 옛 절 | 새 자리 |
|---|---|
| 0 | 0 한 줄 요약(첫 문단), 1-1 전체 그림 |
| 1 | 1-2 |
| 2 | 1-3 |
| 3 | 1-4 |
| 4 | 1-5 |
| 5 | 1-6 |
| 6 | 1-7 |
| 7 | 1-8 |
| 8 | 1-9 |
| 9 | 1-10 |
| 10 | 1-11 |
| 11 | 1-12 |
| 12 | 5-1 평가 |
| 13 | 3-1 작업 순서 |
| 14 | 2-1 |
| 15 | 기록 파일(`archive/09_chatbot_rag_log.md`), 남은 한계는 4-1 |
| 16 | 기록 파일, 5-2 남은 한계는 4-2 |
| 17 | 1-13, 그 안의 「Claude 가 정한 것」은 2-2 |
| 18 | 1-14 |
| 19 | 1-15 |

