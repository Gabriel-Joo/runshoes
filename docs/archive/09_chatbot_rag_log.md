> 보관: 이 문서는 더 이상 유효하지 않다. 지금 규칙은 [09_chatbot_rag.md](../09_chatbot_rag.md)

# 챗봇 RAG 구현 기록(옛 15절, 16절)

2026-11-17 `09_chatbot_rag.md` 를 공통 뼈대로 옮기며 차수별 기록을 여기로 뺐다. 절 번호(15절, 16절 등)는 옛 09편 번호다.

#### 15. 1단계 구현 — 작업 5-1(2026-11-12, 운영 반영)

검색을 쓰지 않는 갈래부터 — 용어 · 스펙 · 비교 · 추천. 경험 · 후기 질문은 아직 받지 않는다(2단계에서 검색 · 리뷰 근거와 함께). model-service 도 2단계부터 부른다.

구조 — 파이썬 유지, `chatbot/` 패키지(`Dockerfile.chatbot` 이 `python -m chatbot.server`) [code:Dockerfile.chatbot:6-8] [code:Dockerfile.chatbot:11]

| 파일 | 하는 일 |
|---|---|
| `server.py` | 웹소켓(:8766). 보내는 것 `{type, message, links:[{label, href}], time}`. 연결 직후 로그인 확인(17절) [code:chatbot/server.py:41-42] [code:chatbot/server.py:45-76] [code:chatbot/server.py:126] |
| `bot.py` | 한 턴 — 이름 찾기 → 라우터 → 갈래 → 버튼. 대화 상태(마지막 신발 · 되묻는 중 · 최근 6줄)는 연결마다 메모리, 연결이 끊기면(창을 닫거나 배포) 사라진다 [code:chatbot/bot.py:1-5] [code:chatbot/bot.py:30-37] [code:chatbot/bot.py:125-126] [code:chatbot/bot.py:3-4] [code:chatbot/server.py:80-82] |
| `bot.py` 직전 신발 잇기 | 이름 없이 이어 묻는 질문("후기는 어때요?")은 직전 신발로 답한다 — 가리키는 말 17개가 있거나 라우터 JSON 의 `same_shoe_as_before` 가 참일 때. 대화 첫 질문에 신발이 없으면 되묻는다(운영 뒤 수정 5) [code:chatbot/router.py:29] [code:chatbot/router.py:48] [code:chatbot/router.py:189] [code:chatbot/bot.py:167-169] [code:chatbot/bot.py:273-277] |
| `catalog.py` | `/api/shoes` · `/api/terms` 읽기(캐시 — 신발이 바뀔 때만 다시 읽는다, 19절), 이름 찾기 [code:chatbot/catalog.py:116-120] [code:chatbot/catalog.py:288-324] |
| `router.py` | 규칙 → 라우터 LLM(JSON) [code:chatbot/router.py:172-191] |
| `facts.py` | API 값 → 사실 문장 · 결론 문장(8g 규칙 · 조사). 숫자는 여기서만 [code:chatbot/facts.py:1-9] |
| `reply.py` | 검사 · 버튼 · 전문의 안내 [code:chatbot/reply.py:180-221] [code:chatbot/reply.py:35-41] [code:chatbot/reply.py:303-305] |
| `branches/` | 용어 · 스펙 · 비교(`GET /api/compare`) · 추천(`GET /api/recommend`) [code:chatbot/branches/] [code:chatbot/branches/compare.py:26] [code:chatbot/branches/recommend.py:160] |
| `prompt.py` · `llm.py` · `http.py` | 말투 · 예시 · 고정 문구, Ollama(gemma4:e4b), Spring(`RUNSHOES_API`, 기본 `127.0.0.1:3000` — 같은 Pod) [code:chatbot/prompt.py:1] [code:chatbot/llm.py:13] [code:chatbot/http.py:13] |
| `timing.py` | 한 턴의 단계별 시간(라우터 · 검색 · 생성) — 턴 기록(18절)이 쓴다 [code:chatbot/timing.py:1-9] [code:chatbot/timing.py:29] |
| `eval/` · `tests/` | 평가 · 단위 시험(이미지에는 넣지 않는다) [code:Dockerfile.chatbot:8] |

정한 것(사용자 2026-11-12)

| 항목 | 규칙 |
|---|---|
| 라우터 | 매 질문 LLM 을 한 번 부른다 — `health_context` 는 키워드로 잡지 않고, 등록되지 않은 신발 이름도 문장에서 뽑아야 해서. 같은 JSON 에 추천 조건도 받는다. 규칙이 갈래를 정하면 LLM 의 branch 는 무시, 실패하면 `health_context=true`. gemma4 의 생각 모드는 끈다(`think: false` — 켜 두면 `num_predict` 를 생각에 써서 본문이 비어 온다) [code:chatbot/router.py:8-9] [code:chatbot/router.py:172-191] [code:chatbot/llm.py:29] |
| 규칙 | 이름 2개 이상 · "비교 · vs · 차이" → 비교, "추천 · 골라 · 뭐가 좋" → 추천, 이름 1개 + 스펙 낱말 → 스펙, 사전 낱말 + 뜻을 묻는 말 → 용어. 직전 신발은 "그거 · 둘 다" 같은 가리키는 말이 있을 때만 쓴다("쿠션 좋은 신발 신으면 나을까요"가 직전 신발의 스펙 질문이 되지 않게) [code:chatbot/router.py:22-35] [code:chatbot/router.py:149-163] [code:chatbot/bot.py:167-169] |
| 숫자 | 코드(`facts.py`)가 쓴 답을 LLM 에 참고로 주고 말투만 다듬게 한다. LLM 답의 숫자가 사실 문장 · 질문에 없으면, 금칙어가 나오면, `num_predict` 에서 잘리면 코드 답을 그대로 낸다. 이모지는 지운다 [code:chatbot/branches/common.py:77-78] [code:chatbot/reply.py:180-209] [code:chatbot/llm.py:38-39] |
| 전문의 안내 | 통증이면 코드가 한 번 붙인다 — "지속되는 통증은 전문 의료기관에서 정확한 진단을 받아보시는 게 좋아요." 자리는 답 맨 앞(5-2 4차 수정, 16절). LLM 이 쓴 의료 문장은 지운다(누락 · 중복 0) [code:chatbot/prompt.py:16] [code:chatbot/reply.py:303-305] [code:chatbot/reply.py:73-81] [code:chatbot/eval/run.py:238-241] |
| 이름 | `model` · `modelEn` · `modelAlias` 에서 세대를 떼고 앞 낱말을 뗀 별칭까지("카야노"). 긴 이름이 이긴다. 세대를 말하지 않으면 현행, 현행이 없는 라인(34개)은 가장 높은 세대 — 세대가 여럿이면 "N세대 기준이에요". 등록되지 않은 세대("마하 8")는 같은 라인의 등록된 세대를 권한다(예시 ①). 여러 라인에 걸리면 하나만 되묻고, 문장의 브랜드로 좁힌다. 떼어 낸 별칭 바로 앞에 다른 라인의 낱말이 붙어 있으면 받지 않는다("메타스피드 스카이"가 웨이브 스카이로 새지 않게) [code:chatbot/catalog.py:128-175] [code:chatbot/catalog.py:74-84] [code:chatbot/catalog.py:224-237] [code:chatbot/bot.py:185-193] [code:chatbot/bot.py:319-329] [code:chatbot/bot.py:358-373] (2026-11-12 기준) [c:ffab18d] |
| 버튼 | 신발을 말하면 "보러 가기" 하나 — 1켤레는 상세 모달(`/?shoe=`), 2켤레 이상은 비교하기(`/compare?ids=`). 범위 밖 답에는 없다. 코드가 `links` 로 보내고 `ChatBot.tsx` 가 그린다(사이트 안 주소만). 문장으로는 "보러 가실래요?" [code:chatbot/reply.py:35-41] [code:chatbot/bot.py:211] [code:src/components/ChatBot.tsx:33-35] [code:src/components/ChatBot.tsx:189-192] |
| 쉬운 말 | 스택하이트 → 쿠션 높이, 드롭 → 앞뒤 높이 차이, 미드솔 → 쿠션 소재, 와이드 모델 → 넓은 폭(2E·4E) 버전, 과내전 · 안정화 설명 → 발이 안쪽으로 무너지는 것을 잡아 주는 신발. 중립화 · 안정화 · 템포런 · LSD 는 화면에 보이는 이름 그대로. 사용자가 용어를 물으면 사전 원문 [code:chatbot/reply.py:224-235] [code:chatbot/prompt.py:53] [code:chatbot/facts.py:23] [code:chatbot/branches/term.py:13-14] |
| 발매가 · 브랜드 | 가격을 말한 단락 끝에 "가격은 발매가 기준이라 지금은 더 저렴할 수 있어요." 한 번. 신발은 처음 말할 때만 "아식스의 노바블라스트 5" [code:chatbot/facts.py:17-18] [code:chatbot/catalog.py:271-274] [code:chatbot/prompt.py:52] |
| 없는 신발 · 용어 | `chatbot_misses`(V18) — 챗봇만 쓰는 내부 POST `/api/internal/chatbot-misses`(같은 Pod 안에서 127.0.0.1 로 들어온 연결만 — `localAddr` 를 본다. `remoteAddr` 는 쿠버네티스에서 `X-Forwarded-For` 로 바뀌어 믿지 않는다) · 관리자 페이지 「챗봇 문의」(`03_admin.md` 1-6 — 2026-11-14 처리 상태 V23 · 사전 추가가 생겼다). 같은 연결에서 같은 말은 한 번만 [code:backend/src/main/resources/db/migration/V18__chatbot_misses.sql:1-7] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:28-35] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:56-58] [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:62] [code:chatbot/bot.py:43-48] [code:backend/src/main/resources/db/migration/V23__chatbot_miss_status.sql:1-4] [docs:03_admin.md] |
| 예산 | 말한 금액 그대로 `GET /api/recommend?…&budget=150000`(사용자 2026-11-12 — 칸 셋은 화면의 드롭다운 때문이다, `10_recommend.md` 1-1). 금액이 없는 말("저렴한 걸로" → 20만원까지, "비싸도 괜찮아요" → 보지 않음)만 칸으로 맞추고 그렇게 밝힌다. 가격 조건은 문장에 가격 이야기가 있을 때만 받는다(LLM 이 말하지 않은 "가격 상관없음"을 붙인 일이 있었다) [code:chatbot/branches/recommend.py:27-47] [code:chatbot/branches/recommend.py:18] [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:59-73] [code:chatbot/router.py:194-200] [docs:10_recommend.md] |
| 거절 | 9절 문구 그대로. 사전에 없는 용어의 "대신 OO은"은 8절 보강 목록에서 가까운 사전 용어(갑피 → 발볼, PEBA → 미드솔 …) [code:chatbot/prompt.py:10-13] [code:chatbot/terms.py:64-72] [code:chatbot/terms.py:112-114] |

Claude 가 정한 것 — 지시에 없던 자리(2026-11-12 보고)

- **비교의 "거의 같다 / 갈린다"** — 무게는 8g 규칙, 쿠션 높이 · 앞뒤 높이 차이 · 발매가는 비교하기 API 의 위치 말(word)이 같으면 "거의 같다". mm 차이 같은 새 기준을 만들지 않으려고. [code:chatbot/facts.py:299-315]
- **추천의 용도** — API 가 늘 요구한다. 없으면 용도만 되묻는다(통증이면 차분한 문장 — 답을 받은 턴에도 통증으로 본다). "비슷한 모델로 찾아볼까요?"에 "네"면 처음 질문의 조건(발볼 · 예산 …)을 그대로 이어 추천한다. [code:chatbot/bot.py:234-250] [code:chatbot/bot.py:141-150] [code:chatbot/bot.py:173-183]
- **8g 규칙의 표시** — 판단은 반올림 전 차이(8g 미만이면 우열 없음), "차이가 N g 정도"는 내림해 7을 넘지 않는다(7.6g 을 "8g 정도라 거의 같다"로 말하지 않게). [code:chatbot/facts.py:247-251]
- **등록되지 않은 신발이 섞인 비교 · 스펙** — 남은 신발이나 직전 신발로 바꿔 답하지 않고 없다고 먼저 말한다. 되물어 고른 신발은 처음 질문의 다른 신발에 더한다. [code:chatbot/bot.py:195-199] [code:chatbot/bot.py:157-158]
- **스펙 답은 물은 칸만** — 질문 낱말로 칸을 고르고, 물은 칸이 없으면 무게 · 쿠션 높이 · 앞뒤 높이 차이 · 발매가. [code:chatbot/facts.py:147-189]
- **추천의 셋 중 비교** — 코드가 정한 것만: 가장 가벼움(270mm 환산, 다음과 8g 이상) · 발매가 가장 낮음 · 쿠션 높이 가장 높음. [code:chatbot/branches/recommend.py:220-236]

프롬프트 구성(2026-11-12 정리 — 지시를 하나씩 더하다 서로 부딪쳐 한 번 걷어냈다)

- 라우터 시스템과 생성 시스템 둘. 통증이면 생성 시스템 끝에 통증 단락. 갈래마다 다른 것은 사용자 메시지의 `[할 일]`(각 `branches/*.TASK`)에만 둔다. [code:chatbot/tests/prompt_snapshot.txt:263] [code:chatbot/prompt.py:155-182] [code:chatbot/branches/spec.py:9-12] (2026-11-12 기준) [c:43d9953]
- 공통 규칙에는 모든 갈래에 같은 것만. "보러 가실래요?"는 신발을 말하는 갈래(스펙 · 비교 · 추천)의 `[할 일]`에만 있고, 특성 설명에는 언급하지 않는다(코드가 혹시 나오면 지운다). [code:chatbot/branches/spec.py:9-12] [code:chatbot/branches/compare.py:11-15] [code:chatbot/branches/recommend.py:20-24] [code:chatbot/branches/explain.py:111-114]
- 코드가 막는 것(이모지 · 마크다운 · 금칙어 · 의료 문장)은 프롬프트에 두지 않는다 — 뺀 전후 60문항 두 번씩, 이모지 · 마크다운 · 금칙어 0회로 같았다(의료 문장 지움은 2~3회 → 0회). [code:chatbot/prompt.py:32-34] [code:chatbot/tests/test_prompt.py:45] (2026-11-12 기준) [c:43d9953]
- 근거 규칙: 정보에서 자연스럽게 따라 나오는 말은 써도 된다(쿠션이 두껍고 푹신하다 → 착지할 때 충격이 덜 전해진다). 새 사실 — 숫자 · 몸에 일어나는 효과 · 정보에 없는 다른 특성 — 은 만들지 않는다. 출처를 밝히는 말("등록된 정보에 따르면")은 붙이지 않는다. [code:chatbot/prompt.py:43-48]
- 설명문의 효과 문장 12개 → `01d_catalog_copy.md` 4절
- 예시의 숫자 · 위치 말은 운영 값이다. 평가가 매번 API 로 다시 계산해 예시에 그대로 있는지 본다(`chatbot/eval/examples.py`) — 가격 · 세대가 바뀌면 평가가 실패하고 예시를 고친다. [code:chatbot/eval/examples.py:1-11] [code:chatbot/prompt.py:67-68]
- 반영 확인: `python -m chatbot.prompt` 가 지금 보내는 프롬프트 전부와 크기를 찍는다. `chatbot/tests/test_prompt.py` 가 그 출력을 스냅숏(`prompt_snapshot.txt`)과 대조하고 규칙의 자리(보러 가기 · 도움 · 코드가 막는 것)를 본다 — 프롬프트를 고치면 스냅숏을 다시 찍어 함께 커밋한다. [code:chatbot/prompt.py:185-220] [code:chatbot/tests/test_prompt.py:1-21]
- 생성 검사가 한 일(지운 것 · 코드 답으로 바꾼 까닭)은 턴마다 trace 의 `guard` 에 남고 평가 요약에 센다. [code:chatbot/bot.py:124] [code:chatbot/reply.py:84-96] [code:chatbot/eval/run.py:587-596]

평가 — `python -m chatbot.eval.run`(운영 공개 API 를 읽기만 하고, 없는 신발 기록은 보내지 않고 가로챈다) [code:chatbot/eval/run.py:1-10] [code:chatbot/eval/run.py:67-69]

- 골든셋 `chatbot/eval/golden.jsonl` 용어 10 · 스펙 10 · 비교 10 · 추천 16(Claude 초안). 경계 15 는 사용자가 `golden-boundary.jsonl` 에 쓴다. [code:chatbot/eval/golden.jsonl:1] [code:chatbot/eval/golden-boundary.jsonl:1]
- 자동 검사: 갈래 · 이름 찾기 · 용어 원문 · 추천 조건 추출 · 추천 결과 = `GET /api/recommend` · 답 속 숫자 ↔ API 원값(챗봇의 사실 문장을 믿지 않고 다시 계산) · 8g 규칙 · 전문의 안내 · 진단성 표현 · 금칙어 · 이모지 · 해요체 · 쉬운 말 · 브랜드 첫 언급 · 발매가 문장 · 버튼 규칙 · 용어 사본 대조(`terms.ts`). [code:chatbot/eval/run.py:12-16]
- 평가는 5-1 이 운영에 오르기 전까지 `--api` 로 로컬 Spring 을 주었다 — 운영 API 가 `budget` 을 몰랐다(400). 운영 반영(2026-11-12) 뒤로는 운영 공개 API 로 돌릴 수 있다. [code:chatbot/eval/run.py:4] [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:59-73] <!-- 헷갈림: 로컬 Spring 을 쓴 옛 방식이지만 까닭(운영 API 가 budget 을 몰랐다)이 붙어 남김 -->
- 응답 시간(문항마다 `seconds`, 요약의 평균)은 묻는 질문 하나만 잰다(2026-11-14 사용자). [code:chatbot/eval/run.py:92-95] [code:chatbot/eval/run.py:329] [code:chatbot/eval/run.py:585-586]
  - **몸풀기**: 한동안 질문이 없으면 Ollama 가 모델을 내려서(약 5분) 첫 질문이 모델을 올리느라 몇 초 더 걸린다(운영 확인 10.9초 · 평가 4.3 ~ 4.7초). 문항 전에 챗봇과 같은 모델 · 옵션(`llm.chat`)으로 한 번 말을 걸어 올려 두고(「몸풀기 N초」), 문항 시간에는 넣지 않는다. 첫 문항을 통계에서 빼지 않은 까닭 — `--only` 로 한 문항만 잴 때 잴 것이 없어진다. [code:chatbot/eval/run.py:70-79] (2026-11-14 기준) [c:ccb74d0]
  - **앞 턴**: 앞 대화(setup)가 있는 문항은 마지막 질문만 잰다 — 합쳐 재면 「두 번 묻는 데 걸린 시간」이 된다. [code:chatbot/eval/run.py:88-93]
  - 바꾼 뒤 첫 평가(모델이 내려가 있던 상태): 몸풀기 4.1초, T01 6.9초 → 1.3초, 전체 평균 2.6초, 94/94. 문항 시간에는 기록 스레드를 기다리는 0.3초가 늘 들어 있다. [code:chatbot/eval/run.py:94] (2026-11-14 기준) [c:ccb74d0]
- 2026-11-12(운영 공개 API + 로컬 Ollama): **45/45**, 수치 불일치 0, 전문의 누락 0, 용어 사본 같음, 평균 2.4초. 경고 1 — R04("발이 안쪽으로 무너지는 편")에 통증이 아닌데 전문의 안내가 붙었다(라우터가 넓게 잡는 쪽 — 7절이 받아들인 손해). [c:ffab18d]
- 단위 시험 `python -m unittest discover -s chatbot/tests -t .` 21건(네트워크 없이 — 이름 찾기 · 8g 규칙 · 라우터 규칙 · 검사 · 버튼). [code:chatbot/tests/] (2026-11-12 기준) [c:ffab18d]
- 끝에서 끝: 로컬 Spring(V17 · V18) + 챗봇 서버 + 웹소켓 — 기록이 표에 쌓이고 관리 API 가 묶어 센다. 화면 1440 · 390px(챗봇 버튼 → 상세 모달, 관리 화면 탭) 넘침 없음. 버튼을 누르면 챗 창은 접힌다(대화는 남는다 — 열린 채면 모달이 창 뒤에 가린다). [code:src/components/ChatBot.tsx:255-259] (2026-11-12 기준) [c:ffab18d]
- 코드 리뷰(2026-11-12, 서브에이전트) 13건을 고쳤다 — 내부 POST 의 `X-Forwarded-For` 우회(쿠버네티스 env 를 켠 로컬에서 재현 204 → 404), 세대 숫자를 공백 지운 문자열에서 읽던 것("클리프톤 9 10" → 910), 없는 신발을 직전 신발로 바꿔 끼운 비교, 되묻기 뒤 다른 신발이 빠짐, 용도 되묻기 · "네"의 조건 · 통증이 이어지지 않음, "네" 판정의 낱말 경계, 추천 문장의 "말씀하지 않은 조건", 8g 표시, "mm" 조사, 객체가 아닌 JSON 에 연결이 끊김. 고친 뒤 45/45 · 단위 시험 21건. [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:31-34] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:58] [code:chatbot/catalog.py:207-209] [code:chatbot/server.py:98] [c:ffab18d]
- 예산 금액(`budget`)을 더한 뒤(로컬 Spring, 운영 스냅숏 310켤레 + 로컬 Ollama): 45/45, 단위 시험 22건. R01 "15만원 안쪽"의 상위 3 발매가 149,000 · 109,000 · 126,300원. [code:chatbot/branches/recommend.py:38-39] (2026-11-12 기준) [c:f52d0b1]

- **"신발 특성"을 묻는 질문에 답할 갈래가 없다**(경계 15문항, 2026-11-12). 판정 · 안전은 15/15(`health_context` · 전문의 안내 · 진단 · 효과 약속 · 몸 판단 0)이지만, 답이 질문을 비켜 간다: [c:230ecab]
  - 통증 문항 10개 중 6개(1 · 3 · 5 · 7 · 9 · 10)가 추천으로 가서 용도만 되묻는다 — "쿠션이 두터운 쪽이 충격이 덜 전해진다" 같은 특성 설명(예시 ③)이 없다. 2개(6 · 8)는 고정 문구다. (2026-11-12 기준) [c:230ecab]
  - "카본화는 입문자에게 안 좋은가"(13) · "기록이 줄어드나"(12) · "무릎이 뻐근한데 신발을 바꾸면"(2)은 라우터가 용도를 짐작해 추천 목록을 낸다 — 단정은 하지 않지만 물음에 답하지 않는다. "비싼 게 좋은가"(14)는 용도를 되묻는다.
  - → 특성 설명 갈래(explain)를 더해 풀었다(사전 용어를 근거로, 통증 + 용도 없음이면 특성 먼저). [code:chatbot/bot.py:212-213] [code:chatbot/bot.py:238-248] [code:chatbot/branches/explain.py:1-6]

5-1 끝(2026-11-12 사용자) — 경계 15문항 두 번 모두 15/15, 기존 45문항 45/45. B05 · B09 의 목록 이야기(근거에 신발이 없는데 "등록된 신발 중에는…")는 사라졌다. [c:401f36f]

#### 16. 2단계 구현 — 작업 5-2(2026-11-12, 로컬)

경험 · 후기 갈래와 검색. 특성 설명 갈래도 설명문 검색 결과를 근거로 받는다. 지시와 결정은 2026-11-12 사용자 승인 13항목(관리자 지시서) — 아래 "정한 것"이 그 내용이고, "Claude 가 정한 것"은 지시에 없던 자리다. 새 마이그레이션은 없다. [code:chatbot/branches/explain.py:68-77] <!-- 확인 못 함: 지시와 13항목은 사람 결정 -->

구조 — `chatbot/search/`(색인) · `chatbot/branches/experience.py`(갈래) [code:chatbot/search/] [code:chatbot/branches/experience.py]

| 파일 | 하는 일 |
|---|---|
| `search/corpus.py` | API → 문서. 리뷰 1건 = `rev:<id>`, 설명문 문장 = `desc:<신발>:<순번>`(11절). 머리말 `[브랜드 모델 · 용도]` 은 임베딩 글에만. 메타데이터 `doc_id` · `kind` · `shoe_id` · `brand` · `model` · `generation` · `is_current` · `purpose` · `stability`, 리뷰 `rating` · `like_count` · `created_at`, 설명문 `sentence`. 해시는 임베딩 글로 [code:chatbot/search/corpus.py:41-48] [code:chatbot/search/corpus.py:51-55] [code:chatbot/search/corpus.py:58-78] [code:chatbot/search/corpus.py:32-34] |
| `search/index.py` | `SearchIndex` 인터페이스(`upsert(docs)` · `delete(doc_ids)` · `search(query_vec, query_text, k, filter) → [Hit]` · `ids_with_hash()`), RRF · 추천수 리랭킹 · 신발 순위 [code:chatbot/search/index.py:37-41] [code:chatbot/search/index.py:44-75] |
| `search/memory.py` | `MemoryIndex` — float32 행렬 하나 + BM25. 바꿀 때는 새 행렬을 만들어 한 번에 갈아 끼운다 [code:chatbot/search/memory.py:19-28] [code:chatbot/search/memory.py:33-75] |
| `search/bm25.py` | 한국어 글자 2-gram(낱말 안에서만) BM25, 본문만 [code:chatbot/search/bm25.py:18-26] [code:chatbot/search/memory.py:72] |
| `search/embed.py` | `Embedder` — model-service `/embed`(256건씩), 받은 배치는 바로 float32. `model_key()` = 이름 @ revision [code:chatbot/search/embed.py:19] [code:chatbot/search/embed.py:31-44] |
| `search/service.py` | `Searcher` — 시작 때 전량, 10분마다 해시가 바뀐 것만 다시 임베딩 · 지운 것은 빼기. 준비 전 `ready=False`. 파일 캐시는 `CHATBOT_INDEX_CACHE` 가 있을 때만 [code:chatbot/search/service.py:23] [code:chatbot/search/service.py:25] [code:chatbot/search/service.py:52] [code:chatbot/search/service.py:86-126] |
| `branches/experience.py` | 신발 고르기 → 집계(API 를 새로 읽음) → 관점 분류(LLM JSON 한 번) → 집계 문장은 코드, LLM 은 다듬기 [code:chatbot/branches/experience.py:337-482] |

정한 것(사용자 2026-11-12)

| 항목 | 규칙 |
|---|---|
| 컨텍스트 | `num_ctx` 8,192(`llm.py` options). Ollama 0.34 는 주지 않으면 4,096 으로 띄운다(모델은 131,072). 8,192 로 띄워도 VRAM 3.23GB 로 같다 [code:chatbot/llm.py:19-21] [code:chatbot/llm.py:30] (2026-11-12 기준) [c:b11e139] <!-- 확인 못 함: Ollama 0.34 기본값과 VRAM 3.23GB 는 저장소 밖(코드 주석에만 적힘) --> |
| 리뷰 상한 | 답에 넣는 리뷰 30건 — 30건 이하면 전부, 넘으면 추천 많은 순 30건. 잘랐으면 밝힌다 [code:chatbot/branches/experience.py:29] [code:chatbot/branches/experience.py:392-398] |
| 집계 | 답할 때마다 그 신발 리뷰를 `GET /api/reviews?shoeId=` 로 새로 읽는다(분모는 지금 값). 관점(무릎 · 발볼 …)을 물었으면 그 관점을 말한 리뷰만 골라 LLM 에 JSON 으로 한 번(temperature 0) 묻고 코드가 센다 — 좋다 + 아쉽다 = 관점 이야기 ≤ N 을 코드가 맞춰 본다. 별점으로 대신하지 않는다. 퍼센트는 쓰지 않는다 [code:chatbot/branches/experience.py:362] [code:chatbot/branches/experience.py:683-727] [code:chatbot/branches/experience.py:161-163] [code:chatbot/llm.py:43-45] |
| 표현 | 집계 "리뷰 14건 중 무릎 이야기가 5건이고, 그중 좋다는 쪽이 3건 아쉽다는 쪽이 2건이에요", 한쪽만이면 "…5건이고, 모두 좋다는 쪽이에요"(5차 수정). 근거가 얇을 때는 7절 문구. 금칙어(러너들이 · 실제 사용자 · 많은 사람들 · 대부분의 사용자 · 사용자들)는 생성 검사가 막는다 [code:chatbot/branches/experience.py:196-203] [code:chatbot/branches/experience.py:212-220] [code:chatbot/reply.py:16] [code:chatbot/reply.py:205-209] |
| 검색 | RRF(k=60)로 임베딩 순위와 BM25 순위를 섞는다. 리뷰 추천수 리랭킹(6절 — 최댓값은 그때 후보에서). 신발 순위는 신발마다 상위 문서 점수. `shoe_id` · `kind` 필터 [code:chatbot/search/index.py:19-20] [code:chatbot/search/index.py:52-75] [code:chatbot/search/index.py:78-92] |
| 시작 · 갱신 | 포트는 바로 열고 색인은 뒤에서. 준비 전에는 경험 · 후기만 "후기를 바탕으로 한 답은 잠시 뒤에 드릴 수 있어요…"(`prompt.EXPERIENCE_WAIT`), 다른 갈래는 그대로. model-service 에 닿지 않을 때도 같은 문구. 주소는 env `MODEL_SERVICE_URL` 로만 받는다(1차 수정 — 아래) [code:chatbot/server.py:116-124] [code:chatbot/bot.py:278-291] [code:chatbot/prompt.py:17-18] [code:chatbot/search/embed.py:18] |
| 특성 설명 | 사전 용어 + 설명문 검색 결과(유사도 0.55 이상, 셋까지 — 신발 이름과 함께)를 근거로. 사전에 없는 특성("힐컵" 등)도 설명문에 있으면 답한다. 답에 이름이 나온 신발에는 "보러 가기". **통증 질문에는 설명문을 쓰지 않는다**(1차 수정 — 아래) [code:chatbot/branches/explain.py:63-77] [code:chatbot/branches/explain.py:85-87] [code:chatbot/branches/explain.py:96-99] [code:chatbot/branches/explain.py:111-112] |
| 출처 | 리뷰에서 온 말은 "등록된 리뷰에서는"으로 밝힌다(공통 규칙). 스펙 · 설명에는 붙이지 않는다. 막지 않고 세기만 한다(trace `guard` 의 "출처 말하기 N") [code:chatbot/prompt.py:48-49] [code:chatbot/reply.py:218-220] |
| 이미지 | numpy 를 더했다 — 94.9MB → 195MB, 받을 때(gzip) 23MB → 45MB [code:Dockerfile.chatbot:4-5] (2026-11-12 기준) [c:b11e139] |

Claude 가 정한 것 — 지시에 없던 자리(2026-11-12 보고)

- **머리말의 세대** — 모델명이 세대 숫자로 끝나면 「N세대」를 덧붙이지 않는다(`[아식스 노바블라스트 6 · 조깅·회복주]`). 같은 숫자를 두 번 쓰지 않게. **사용자 확인(2026-11-13) — 그대로.** [code:chatbot/search/corpus.py:41-48]
- **신발을 말하지 않은 질문** — 리뷰 검색으로 신발 순위를 매겨 상위 3켤레, 리뷰 상한 30을 켤레당 10건으로 나눈다. **사용자 확인(2026-11-13) — 그대로: 30건은 한 신발 기준이라 3켤레면 나누는 것이 맞다.** 순위 · 거르기는 1차 수정에서 바뀌었다(아래). 관점을 물었으면 검색 결과 가운데 그 관점 낱말이 든 리뷰가 많은 신발부터 — 상위 문서 하나로만 고르면 언급 0건인 신발이 섞였다. [code:chatbot/branches/experience.py:34-35] [code:chatbot/branches/experience.py:348-357]
- **관점** — 질문에서 가장 앞에 나온 관점 하나(무릎 · 발볼 · 사이즈 · 내구성 · 발바닥 · 종아리 · 발목 · 뒤꿈치 · 발등 · 통증 · 쿠션 · 무게 · 통기성 · 접지 · 반발 · 안정감 · 착용감, 낱말 묶음은 `experience.ASPECTS`). [code:chatbot/branches/experience.py:46-65] [code:chatbot/branches/experience.py:123-131] [code:chatbot/branches/experience.py:406-415]
- **관점 후보(낱말 + 임베딩)** — 임베딩 유사도의 절대값으로는 가를 수 없었다. 같은 신발 리뷰는 머리말(신발 이름)을 같이 가져, 낱말이 든 리뷰도 0.55~0.76, 안 든 리뷰도 0.70 이었다(노바블라스트 6 · 무릎). 그래서 낱말이 든 리뷰가 주 신호이고, 임베딩은 「낱말이 든 리뷰의 유사도 중앙값보다 가까운 것」을 신발마다 5건까지 더한다(분류가 none 으로 걸러 낸다). 질의 벡터는 질문에서 신발 이름을 뺀 글로 만든다. [code:chatbot/branches/experience.py:665-680] [code:chatbot/branches/experience.py:41-42] [code:chatbot/branches/experience.py:323-333] [code:chatbot/branches/experience.py:344-345] (2026-11-12 기준) [c:b11e139]
- **분류 실패** — 번호가 빠지면 한 번 다시 묻는다. 그래도 안 되면 긍부정을 말하지 않고 "리뷰 N건 중 무릎 이야기가 나온 리뷰는 K건이에요"(낱말로만 센 수). [code:chatbot/branches/experience.py:694-711] [code:chatbot/branches/experience.py:188-189]
- **유사도의 0~1** — 추천수 리랭킹의 "유사도"는 RRF 점수를 그 검색 1등의 RRF 점수로 나눈 값. RRF 는 크기가 1/(60+순위)라 그대로 섞으면 추천수가 순위를 다 정한다. [code:chatbot/search/index.py:52-65]
- **인용** — 관점 낱말이 든 리뷰를 먼저. "가장 많은 추천"은 정말 그 리뷰가 그 무리에서 추천이 가장 많을 때만. 따옴표 뒤에 조사를 붙이지 않는다("…주문."라고 가 됐다). [code:chatbot/branches/experience.py:254-276] [code:chatbot/branches/experience.py:206]
- **설명문을 경험 · 후기 근거로** — 관점 없는 질문에는 넣지 않는다 — 넣으면 설명문 요약이 리뷰 이야기를 밀어냈다. [code:chatbot/branches/experience.py:43-44] <!-- 헷갈림: 이 갈래는 운영 뒤 수정에서 설명문을 아예 뺐다. 관점 없는 질문에 넣지 않은 까닭이라 남김 -->
- **라우터 규칙 더함** — "후기 · 리뷰 · 평가 · 신어 본 …"이면 신발이 없어도 경험 · 후기, "착용감 · 사이즈감 · 내구 · 편해 · 아파 · 물집 · 끼어 · 치수 …"는 신발이 하나 정해졌을 때만. 추천 · 비교 규칙이 먼저다. 통증 + 신발 없음 + 후기를 직접 묻지 않음이면 5-1 처럼 특성 설명으로 — "저려서 큰 사이즈로 신는데 괜찮을까요"에 여러 신발의 리뷰 목록을 내면 물음을 비켜 간다(평가 경계 B06 · B08). [code:chatbot/router.py:32-34] [code:chatbot/router.py:149-163] [code:chatbot/bot.py:279-282]
- **이름 찾기 고침(5-1 코드)** — "젤 카야노 32 사이즈 …"에서 세대 32 를 못 읽고 현행 33 으로 답했다. 「사이즈」 앞 숫자는 200 이상(발 크기)일 때만 세대가 아니라고 본다. [code:chatbot/catalog.py:265-266]
- **해요체 표 넓힘** — 설명문 끝(나옵니다 · 됩니다 · 맞습니다 …)을 해요체로 바꿔 준다. 합니다체를 그대로 주면 LLM 이 "나온답니다"로 옮겼다(경계 B01). [code:chatbot/reply.py:238-242]

측정(2026-11-12, 운영 공개 API 스냅숏 · 호스트 model-service · 로컬 Ollama)

| 무엇 | 값 |
|---|---|
| 임베딩 3,438건(256건씩 14번) | 혼자 9.3초, 두 프로세스 동시 각 16.6초(배치당 0.7초 → 1.2~1.3초). 그동안 1건 `/embed`(펫퍼민트 질의 같은 것)가 14ms → 약 1초 기다린다 [code:chatbot/search/embed.py:19] (2026-11-12 기준) [c:b11e139] <!-- 확인 못 함: model-service 와 펫퍼민트 질의는 저장소 밖 --> |
| 토큰(gemma4 실측) | 38건 신발의 추천 상위 30건 1,827 · 그 신발 설명문 350 · 통증 생성 시스템 1,617 — 대화 4줄을 넣은 가장 큰 입력 4,455 + 답 상한 1,500 = 약 5,960 / 8,192 [code:chatbot/llm.py:21] (2026-11-12 기준) [c:b11e139] |
| 검색 한 번 | 24~40ms(질의 임베딩 포함) (2026-11-12 기준) [c:b11e139] |
| 메모리(컨테이너 `--memory 256m`, 이미지 그대로, 0.5초마다 cgroup `memory.current` · 프로세스 RSS) | (가) 색인을 만드는 동안 최대 cgroup 69MiB · RSS 90MiB(전량 3,438건 11.3초). 10분 갱신(바뀐 것 없음 — 60초로 줄여 두 번)은 평상시와 구별되지 않는다. (나) 만든 뒤 질문을 받는 동안 — 연결 셋에서 9질문 동시: 최대 cgroup 83MiB · RSS 94MiB, 그 뒤 평상시 약 77MiB. 전체 최댓값 `memory.peak` 85MiB · `VmHWM` 94MB → 상한 256Mi 의 약 37% (2026-11-12 기준) [c:b11e139] |

- 벡터를 파이썬 float 목록으로 쌓으면 최대 메모리가 207MB 였다(측정 스크립트) — 그래서 배치마다 바로 float32 로 바꾼다(`embed.py`). [code:chatbot/search/embed.py:6-7] [code:chatbot/search/embed.py:42] (2026-11-12 기준) [c:b11e139]
- 임베딩 모델이 바뀌면(`/health` 의 이름 @ revision) 옛 색인을 비우고 다시 만든다 — 옛 것과 새 것을 함께 들지 않아 최대치는 처음 만들 때와 같다. [code:chatbot/search/service.py:91-97]
- 상한에 가까워지면 — 코드로: 벡터를 float16 으로(14MB → 7MB, 내적 정확도는 평가로 확인), 갱신 때 `/api/reviews` 전량 대신 바뀐 것만 받는 API, 배치를 64건으로. 상한을 올리려면(인프라): 챗봇 컨테이너 `limits.memory` 256Mi → 384Mi(requests 48Mi 는 그대로 두어도 된다). 지금 문서 수로는 둘 다 필요 없다 — 문서 1,000건당 벡터 약 4MB 이고, 1만 건(1절 전환 기준)이어도 벡터 약 41MB 다. (2026-11-12 기준) [c:b11e139] <!-- 확인 못 함: 챗봇 컨테이너 limits.memory, requests 는 인프라 저장소 -->

저장공간(PVC) — 판단: **지금은 볼륨 없이 메모리만**(2026-11-12 사용자 · 관리자 확인)

- **같이 쓸 저장공간이 없다.** 클러스터의 스토리지클래스는 local-path(ReadWriteOnce, 처음 붙은 노드에 묶임)뿐이다. 두 Pod 는 anti-affinity 로 다른 노드에 뜨므로 local-path 하나를 같이 쓸 수 없다. ReadWriteMany 는 호스트 NFS 정적 PV(`storageClassName: ""`, 호스트 export 는 sudo — 펫퍼민트 백업 · Harbor 백업이 이 방식)뿐이다. infra 저장소를 읽어 확인했다. <!-- 확인 못 함: 스토리지클래스, 호스트 NFS, PV 는 클러스터와 인프라 저장소 -->
- **emptyDir 는 배포 때 도움이 안 된다.** 롤링(`maxSurge 0` · `maxUnavailable 1`)이 Pod 를 새로 만들기 때문이다 — 살아남는 것은 컨테이너만 다시 뜰 때(OOM 등)뿐이다. <!-- 확인 못 함: 롤링 설정은 인프라 매니페스트 -->
- **30초 기준(1절)을 넘는 것은 리뷰 약 9,400건(혼자 임베딩) 또는 약 4,600건(두 Pod 동시)부터.** 잰 방법: 256건씩 3,438건이 단독 9.3초 · 동시 각 16.6초 → 초당 약 370건 · 약 207건으로 비례, 30초 안에 문서 약 11,100 · 약 6,200건에서 설명문 1,638 을 뺐다(문서 길이가 지금과 비슷하다고 보고). 지금 리뷰 1,800건이라 멀다. (2026-11-12 기준) [c:b11e139]
- 롤링은 한 Pod 씩이고 다음 Pod 는 앞 Pod 가 Ready 가 된 뒤라, 배포 때 두 Pod 가 동시에 임베딩하는 일은 드물다(둘이 같이 다시 뜰 때만). <!-- 확인 못 함: 롤링 순서와 Ready 는 인프라 매니페스트 -->
- **나중에 붙여도 지금보다 어렵지 않다.** 캐시 코드는 이미 있다 — `CHATBOT_INDEX_CACHE`(파일 경로)를 주면 시작 때 읽고(모델 이름 @ revision 이 다르면 통째로 버린다, 문서마다 해시로 맞춰 본다), 바뀌면 임시 파일에 쓴 뒤 이름 바꾸기로 갈아 끼운다(두 Pod 가 같은 파일을 써도 반쯤 쓴 파일을 읽지 않게). 그때 필요한 것은 인프라 쪽뿐이다: 호스트 NFS export 하나(sudo) · ReadWriteMany PV/PVC · 챗봇 컨테이너 volumeMount · env 한 줄. [code:chatbot/search/service.py:25] [code:chatbot/search/service.py:129-155] <!-- 확인 못 함: NFS export, PV/PVC, volumeMount 는 인프라 -->

평가 — `python -m chatbot.eval.run`(운영 공개 API · 호스트 model-service · 로컬 Ollama) [code:chatbot/eval/run.py]

- 골든셋에 경험 · 후기 15문항(`chatbot/eval/golden-experience.jsonl`, Claude 초안 — 사용자가 본다)을 더했다. 정답 신발은 실제 리뷰를 세어 골랐다(관점 낱말이 든 리뷰가 많은 신발). 신발 이름이 나온 질문 10(그 가운데 근거 얇음 1 · 0건 1) · 가리키는 말("그거") 1 · 여러 켤레 4(그 가운데 3은 Hit@5 — 정답 후보 하나가 검색 상위 5에, 1은 통증 + 후기). [code:chatbot/eval/golden-experience.jsonl] (2026-11-12 기준) [c:b11e139]
- 자동 검사 더함: 분모(「리뷰 N건 중」 · 「N건 중 K건에서만」 ↔ `GET /api/reviews?shoeId=` 건수), 세 칸 합(긍정 + 부정 = 언급, 언급 + 나머지 = N), 코드의 집계 대조, Hit@5, 금칙어 셋. [code:chatbot/eval/run.py:214-229] [code:chatbot/eval/run.py:375-388] [code:chatbot/eval/run.py:285-286]
- 결과(2026-11-12, 두 번): **75/75 · 75/75**(용어 10 · 스펙 10 · 비교 10 · 추천 15 · 경계 15 · 경험·후기 15). 수치 불일치 0 · 전문의 누락 0 · 분모 · 세 칸 합 어긋남 0 · Hit@5 3/3. 평균 2.7~2.8초, 경험·후기만 평균 4.1~4.3초(최대 10.8초 — 분류 호출이 하나 늘어서). 코드 답 0 · 1. [c:b11e139]
- 첫 회는 63/75 였다. 고친 것: 평가가 집계 숫자(언급 · 나머지 · 부정 0)를 "API 에 없는 숫자"로 잡음(평가 쪽), 통증 + 신발 없음 질문이 리뷰 목록으로 감(경계 B06 · B08 → 특성 설명으로), 설명문의 합니다체를 LLM 이 "나온답니다"로 옮김(B01). (2026-11-12 기준) [c:b11e139]
- 15자 미만 문장 12개는 두 번 모두 근거로 잡히지 않았다(11절). (2026-11-12 기준) [c:b11e139]
- 단위 시험 `python -m unittest discover -s chatbot/tests -t .` 47건(5-1 의 30 + 검색 · 집계 17 — 네트워크 없이, 임베딩은 가짜 벡터 · 분류는 주입). [code:chatbot/tests/] (2026-11-12 기준) [c:b11e139]
- 이미지 끝에서 끝: 5-2 이미지를 `--memory 256m` 으로 띄워 웹소켓 연결 셋에서 갈래 9개(경험·후기 · 여러 켤레 · 스펙 · 비교 · 추천 · 용어 · 특성 설명)가 모두 답했다. (2026-11-12 기준) [c:b11e139]
- 5-1 남은 한계(15절)를 다시 봤다: **B03(짧은 코드 답)** — 경계 15문항 두 번 모두 코드 답 0. **B02(끝 인사말 줄)** — 두 번 모두 0. **B06(되풀이)** — 사전 한두 줄에 설명문 문장이 더해져, 읽어 본 답에서 같은 뜻을 바꿔 쓴 줄은 보이지 않았다(자동 검사는 없다). 사용자가 다시 보고 TODO 줄을 지울지 정한다. (2026-11-12 기준) [c:b11e139]

1차 수정(2026-11-13 — 사용자가 15문항 답 전문을 읽고 정함, 관리자 지시 1~10)

| 무엇 | 고친 것 |
|---|---|
| 묻는 말이 둘(E14) | 경험·후기 끝 "보러 가실래요?"는 코드가 붙인다. LLM 이 쓴 묻는 문장은 지운다(`drop_asks` — 특성 설명과 같은 길). 평가가 묻는 말 2개 이상을 잡는다 [code:chatbot/branches/experience.py:40] [code:chatbot/branches/experience.py:617] [code:chatbot/reply.py:162-177] [code:chatbot/eval/run.py:242-249] |
| "평이 많아요"(E06 · E07) | 양은 [결론 문장]의 센 건수로만, 세지 않은 것은 "~다는 이야기가 있어요"로 끝낸다. "많아요 · 대부분 · 전반적으로 · 주로 · 흔히"(`experience.VAGUE`)가 든 문장은 지운다(인용 안은 둔다). 평가가 검사 [code:chatbot/branches/experience.py:39] [code:chatbot/branches/experience.py:633-647] [code:chatbot/eval/run.py:457-460] |
| 순위 · 최소 건수(E11 · E12) | 여러 켤레는 후보 5켤레를 함께 분류하고, **질문이 찾는 쪽(긍정 · 부정) 건수 순**으로 셋. 찾는 쪽은 분류 JSON 의 `asks`(같은 호출). 반대 쪽이 더 많은 신발 · 찾는 쪽 0건 신발은 **뺀다**. 리뷰 3건 미만 신발은 목록에 넣지 않는다(리뷰 요약과 같은 기준). 지목한 신발은 그대로 [code:chatbot/branches/experience.py:36-37] [code:chatbot/branches/experience.py:650-662] [code:chatbot/branches/experience.py:103-106] [code:chatbot/branches/experience.py:351-352] |
| 피하려는 질문(E12) | 라우터 JSON 에 `avoid` 하나. 피하겠다는 뜻을 직접 말할 때만 true("~는 피하고 싶어요" · "빼 주세요") — "쓸렸다는 후기 있어요?"는 false. avoid 면 부정이 긍정보다 많은 신발만, 인용도 부정 리뷰에서, 보러 가기 버튼 · "보러 가실래요?" · 설명문 없음, 머리 "아래 신발은 등록된 리뷰에 그런 이야기가 있었어요", [할 일]에 "권하거나 좋게 말하지 않는다" [code:chatbot/router.py:82-86] [code:chatbot/router.py:188] [code:chatbot/branches/experience.py:370-371] [code:chatbot/branches/experience.py:430-432] [code:chatbot/branches/experience.py:539] [code:chatbot/branches/experience.py:92-94] [code:chatbot/branches/experience.py:475] |
| "분류"가 샘(E09) | 평가가 "분류"를 잡는다 [code:chatbot/branches/experience.py:548] [code:chatbot/branches/experience.py:589] [code:chatbot/eval/run.py:461-462] |
| 전문의 안내 | E01 · E08 · E10 에 붙는 것이 맞다(몸 이야기 → 통증) — 정답 파일을 고쳤다. [code:chatbot/eval/golden-experience.jsonl:1] [code:chatbot/eval/golden-experience.jsonl:8] [code:chatbot/eval/golden-experience.jsonl:10] [code:chatbot/prompt.py:16] [code:chatbot/reply.py:303-305] |
| 통증 질문의 신발(B05 등) | 특성 설명은 통증 질문이면 설명문을 근거로 쓰지 않는다 — 신발 이름 · 보러 가기가 붙지 않는다(5-1 처럼 사전만). 병명 → 신발로 가는 근거가 사전에 없어서(8절 통증 항목 보강). 사용자가 지목한 신발(E01 "노바블라스트 6 신으면 무릎 괜찮아요?")은 그대로 — 기준은 챗봇이 골랐나 · 사용자가 지목했나. 평가가 잡는다 [code:chatbot/branches/explain.py:83-85] [code:chatbot/eval/run.py:319-321] |
| model-service 주소 | 코드 기본값을 없앴다. env `MODEL_SERVICE_URL`(운영 값 `http://192.168.122.1:8200`), 인프라 매니페스트 챗봇 컨테이너 env 에 `OLLAMA_URL` 과 나란히. **없으면 서버는 그대로 뜨고** 색인을 만들지 않는다 — 경험·후기는 늘 "잠시 뒤"(`EXPERIENCE_WAIT`), 특성 설명은 사전만, 다른 갈래는 그대로. 시작 실패는 아니므로 순서가 틀려도 멈추지는 않지만, 매니페스트가 먼저 들어가야 배포하자마자 경험·후기가 답한다 [code:chatbot/search/embed.py:3-5] [code:chatbot/search/embed.py:18] [code:chatbot/server.py:118-124] [code:chatbot/bot.py:99] <!-- 확인 못 함: 운영 값과 인프라 매니페스트 env 는 인프라 저장소 --> |

Claude 가 정한 것(1차 수정)

- **반대 쪽이 많은 신발은 뺀다(㉠)** — 넣고 먼저 밝히는(㉡) 것보다 낫다고 봤다. 질문이 "편하다는 리뷰 많은 신발"인데 목록에 들면 버튼과 함께 권하는 모양이 되고, 앞에 "부정이 더 많아요"를 붙여도 그 신발을 왜 보여 주는지가 남는다. 빼도 그 신발 이름으로 다시 물으면 집계를 그대로 답한다. 같은 수(예: 긍정 7 · 부정 5 는 남음, 6 · 7 은 뺌)는 남긴다. 다 빠지면 "찾지 못했어요 — 신발 이름을 알려주시면 그 신발 리뷰를 살펴볼게요"(버튼 없음). [code:chatbot/branches/experience.py:650-662] [code:chatbot/branches/experience.py:540] [code:chatbot/branches/experience.py:375]
- **피하려는 질문은 부정이 긍정보다 많은 신발만**(같은 수도 뺀다) — "부정 언급이 많은 신발만 남긴다"를 엄격하게 읽었다. 신발을 지목한 피하려는 질문은 집계를 그대로 답하고 버튼만 뺀다. [code:chatbot/branches/experience.py:657-658] [code:chatbot/branches/experience.py:372-373] [code:chatbot/branches/experience.py:475]
- **찾는 쪽은 분류 호출의 `asks`** — 라우터가 아니라 분류 JSON 에 넣었다(관점과 리뷰를 함께 보는 호출이라). 처음엔 `asks` 를 앞에 두었더니 그쪽 리뷰 번호만 적고 나머지를 빠뜨렸다(28건 중 6건) — `labels` 를 먼저 쓰게 바꿨다. [code:chatbot/branches/experience.py:103-107] (2026-11-13 기준) [c:8e35bd4]
- **후보 5켤레** — 빼는 신발이 생겨도 셋이 남게. 분류 리뷰가 늘어 여러 켤레 질문이 1~2초 길어졌다(E11 7~8초). [code:chatbot/branches/experience.py:36] (2026-11-13 기준) [c:8e35bd4]
- **양 짐작 말은 문장만 지운다** — 답 전체를 코드 답으로 바꾸면 짧고 딱딱했다(5-1 B03 과 같은 문제). [code:chatbot/branches/experience.py:609-612]
- **경험·후기 답의 발매가 문장을 지운다** — 이 갈래는 가격을 다루지 않는데 LLM 이 말투 예시의 "다만 가격은 발매가 기준이라 …"를 옮겨 붙였다(1차 평가 E01 · E06 · E11). [code:chatbot/branches/experience.py:613-615]
- **특성 설명의 생성 글도 해요체 표(`haeyo`)로** — 설명문이 빠져 근거가 사전뿐이 되자 LLM 이 "무난하다고 합니다"처럼 썼다(1차 평가 경계 B04 · B05 실패). [code:chatbot/branches/explain.py:108-109]
- **라우터 `health_context` 문구 더함** — `avoid` 를 넣자 E12("발에 물집이 잘 잡히는 편이라 …")의 health 가 false 로 바뀌었다(temperature 0 이라 매번). "피하려는 질문이어도 몸 이야기가 있으면 true — 둘은 따로", 예시 "발에 물집이 잘 잡혀요"를 더했다. [code:chatbot/router.py:76-80]
- **여러 켤레는 하나만 남아도 신발 이름을 앞에** — 이름 없이 "13건 중 2건에서만…"이 나갔다. [code:chatbot/branches/experience.py:380] [code:chatbot/branches/experience.py:416]
- **이음말만 LLM 에 맡기는 길은 쓰지 않았다** — 안내 바로 앞이 코드 문장("보러 가실래요?" · 용도 묻기)이거나 답 전체가 코드 답(고정 문구 · 검사에 걸린 답)일 때가 많아, LLM 이 쓴 이음말이 안내 앞에 오지 않는다. 그래서 "다만"까지 고정했다. 경험·후기 답 끝의 "다만 가격은 …"과 이어 "다만"이 두 번 나올 수 있었는데 위의 발매가 문장 지우기로 경험·후기에서는 없어졌다(비교 · 스펙 통증 답에서는 남을 수 있다). [code:chatbot/prompt.py:16] <!-- 헷갈림: 「다만」 고정은 4차 수정에서 걷었다(안내를 맨 앞으로). 그때 고정한 까닭이라 남김 -->

평가(2026-11-13, 고친 뒤 두 번 — `--out` 결과는 세션 스크래치)

- **75/75 · 74/75**(마지막 두 번). 실패 하나는 E09(0건) — LLM 이 고정 문구 "그 부분을 말한 리뷰는 없었어요"를 "밑창이 금방 닳는 부분에 대한 이야기는 없었어요"로 바꿔 썼다(분모 8건 · 0건은 맞다). 같은 일이 그 전 회차에도 한 번 있었다. 다시 돌려 고르지 않았다. (2026-11-13 기준) [c:8e35bd4]
- 수치 불일치 0 · 전문의 누락 0 · 분모 · 세 칸 합 어긋남 0 · Hit@5 3/3 · 묻는 말 둘 0(75문항 전부) · 통증 질문에 챗봇이 고른 신발 0 · 양 짐작 말 0 · "분류" 0 · 코드 답 0. 평균 2.6초, 경험·후기 평균 4.0초(최대 8.2초). (2026-11-13 기준) [c:8e35bd4]
- 여러 켤레 순위(두 번 같다): E10 무릎 편함 — 긍정 6 · 4 · 4 순. E11 발볼 편함 — 클라우드몬스터 3(8 · 1) · 젤 님버스 28(7 · 5) · 슈퍼블라스트 3(5 · 1), 전에 들던 페가수스 42(6 · 7)는 빠졌다. E12 피하려는 질문 — 엘립스 v1(부정 2) 한 켤레, 버튼 없음, 보메로 18(긍정 2) 빠짐. E13 덥다 — 부정 3 · 3 · 2. (2026-11-13 기준) [c:8e35bd4]
- 돌린 차례: ① 73/75 · 75/75 — 경계 B04 · B05 가 합니다체(특성 설명 생성 글에 해요체 표를 씌움). ② 74/75 · 75/75 — [할 일]에 금지 예시로 든 "이렇게 확인해 봤어요"를 경험·후기 15문항 중 4~7문항이 그대로 붙임(예시를 뺌). ③ 75/75 · 74/75 — 위 결과. 고칠 때마다 처음부터 두 번 다시 돌렸다. (2026-11-13 기준) [c:8e35bd4]
- 5-1 B02(끝맺는 인사말 줄) — 마지막 두 번은 경계 15문항 · 경험·후기 15문항 모두 없다(첫머리 "…찾아봤어요"는 여러 켤레의 머리 — 코드 답과 같은 자리). 묻는 말 둘도 0. (2026-11-13 기준) [c:8e35bd4]

2차 수정(2026-11-13 — 사용자가 1차 결과 전문을 읽고 정함, 관리자 지시 1~9)

| 무엇 | 한 것 |
|---|---|
| E14 는 통증이 아니다 | "쓸렸다는 후기 있어요?"는 후기를 묻는 것 → false 그대로(라우터 · 정답 파일 고치지 않음). 자기 이야기가 섞이면 true — E16 "… 후기 있어요? 저도 좀 그래서요"(health true)를 더했다. 라우터가 네 번 모두 가른다(E14 false · E16 true) [code:chatbot/router.py:76-80] [code:chatbot/eval/golden-experience.jsonl:14] [code:chatbot/eval/golden-experience.jsonl:16] (2026-11-13 기준) [c:6eb2878] |
| 꼭 들어갈 문장은 코드가 | 경험·후기의 집계 문장(0건 · 근거 얇음 · 평소)과 인용은 코드가 앞에 쓰고, LLM 은 그 밖의 이야기만 뒤에 잇는다. 0건이고 설명문도 없으면 LLM 을 부르지 않는다. LLM 글이 검사(사실에 없는 숫자 등)에 걸리면 LLM 글만 빼고 코드 글은 그대로 [code:chatbot/branches/experience.py:381] [code:chatbot/branches/experience.py:416-419] [code:chatbot/branches/experience.py:428] [code:chatbot/branches/experience.py:451-455] |
| 인용은 블록으로 | `> ` 인용 블록을 코드가 고르고 붙인다(`experience.quote`). 찾는 쪽이 긍정이면 긍정 리뷰에서, 부정 · avoid 면 부정 리뷰에서 [code:chatbot/branches/experience.py:254-281] |
| 화면 마크다운 | `ChatBot.tsx` 가 챗봇 답을 `markdown-to-jsx` 9.10.4 로 그린다(인용 · 굵게 · 목록 등). 사용자 글은 그대로. 프롬프트는 인용만 허용 — LLM 글의 굵게 · 머리 · 목록 · 인용 표시는 생성 검사가 지운다(인용은 코드만) [code:src/components/ChatBot.tsx:3] [code:src/components/ChatBot.tsx:9-26] [code:package.json:17] [code:chatbot/reply.py:186-189] |
| 합니다체 · 출처 | LLM 글에도 `haeyo`. [code:chatbot/branches/experience.py:618] |

화면 렌더러 — `markdown-to-jsx` 9.10.4(2026-10-28 판, React 원소를 만든다 — innerHTML 을 쓰지 않는다) [code:package.json:17]

- 원시 HTML 막기: `disableParsingRawHTML` · `ignoreHTMLBlocks` 로 HTML 을 파싱하지 않고 글자 그대로 둔다(라이브러리 기본 `tagfilter` 도 켜져 있다). `<script>` · `<img onerror>` · `<iframe>` · `<DatePicker />`(컴포넌트 이름) 모두 글자로 나오는 것을 서버 렌더로 확인했다. 링크는 글자(`a` → `span`), 이미지는 그리지 않는다(`img` → null), 맨 URL 자동 링크 끔 — 신발 링크는 서버가 보내는 "보러 가기" 버튼만. [code:src/components/ChatBot.tsx:12-26] <!-- 확인 못 함: 라이브러리 기본 tagfilter 와 서버 렌더 확인은 저장소 밖(라이브러리 동작, 사람이 한 확인) -->
- 번들(`yarn build`, 이미지와 같은 길): JS 370.29 kB → 448.48 kB(gzip 113.75 → 142.91 kB, +29 kB). CSS 74.14 → 74.48 kB. 챗봇 창을 열 때만 쓰므로 줄여야 하면 `ChatBot` 을 지연 로딩하면 된다(지금은 하지 않았다). (2026-11-13 기준) [c:6eb2878]
- 잠금 파일: 이미지는 `yarn install --frozen-lockfile` 이다. npm 으로 넣으면 `yarn.lock` 전체가 다시 써져(785줄) 되돌리고 yarn 1.22.22 로 넣었다 — `yarn.lock` +5줄, `package-lock.json` 은 새 패키지 두 칸만(+29줄, npm 이 지운 무관한 `libc` 칸은 되살림). `yarn install --frozen-lockfile` · `npm ci` 둘 다 받는다. [code:Dockerfile:14] [code:yarn.lock:1453-1455] [code:package-lock.json:13] [code:package-lock.json:2990-2992] (2026-11-13 기준) [c:6eb2878]

Claude 가 정한 것(2차 수정)

- **답의 모양** — 여러 켤레는 LLM 글이 모든 신발 뒤에 한데 오므로 "문단마다 신발 이름을 밝힌다"를 여러 켤레일 때만 더했다(처음엔 "리뷰에서는 …"만 써서 어느 신발인지 몰랐다). [code:chatbot/branches/experience.py:467-474] <!-- 헷갈림: 이름 지시(MULTI_TASK)는 4차 수정에서 신발마다 따로 부르며 뺐다. 더한 까닭이라 남김 -->
- **앞 글 되풀이 지우기** — [이미 쓴 앞부분]이라고 보여 줘도 LLM 이 집계 · 인용을 그대로 다시 썼다(E11 · E12). 앞 글과 같은 문장(공백 · 문장부호를 뺀 글자가 같음)은 코드가 지운다. 한 번 평가에 5~8번. [code:chatbot/reply.py:105-121] [code:chatbot/branches/common.py:97] (2026-11-13 기준) [c:6eb2878]
- **묻는 문장 지우기는 남겼다** — 붙는 문장("보러 가실래요?")을 보여 줘도 LLM 이 묻는 문장을 쓰는 일이 한 번 평가에 24~25번이었다(모든 갈래). 지우는 코드(`drop_asks`)는 그대로 두고 지울 때 센다. 그래서 묻는 말 둘은 0. [code:chatbot/reply.py:162-177] (2026-11-13 기준) [c:6eb2878]
- **청유 · 마침표로 끝난 물음을 지우지 않는다.** 묻는 문장 지우기는 "?" · "알려주시면/말씀해주시면"만 본다. 평가의 "묻는 말 둘"도 놓친다. 낱말을 늘리지 않기로 했다. [code:chatbot/reply.py:102] [code:chatbot/reply.py:168] [code:chatbot/eval/run.py:247] (2026-11-13 기준) [c:c80ef57]
- **1차 금지 문구 뺀 것** — 경험·후기 [할 일]의 "답 끝에 안내 문장이 자동으로 붙으니 질문으로 끝내지 않고, 끝맺는 인사 · 정리 문장도 따로 쓰지 않는다", 특성 설명 [할 일]의 "끝맺는 안내 · 묻는 말은 따로 붙는다"(5-1). 뒤에 붙는 문장 블록이 대신한다. 양 짐작 말 금지는 붙는 글로 대신되지 않아 남겼다. [code:chatbot/branches/explain.py:42-48] [code:chatbot/branches/common.py:34-40] [code:chatbot/branches/experience.py:86]
- **생성 검사가 LLM 글의 목록 · 인용 표시도 지운다** — 화면이 마크다운을 그리게 되어 "- " · "1. " · "> "가 실제 목록 · 인용이 된다. 프롬프트는 인용만 허용이므로 LLM 글에서는 지운다(인용은 코드만). [code:chatbot/reply.py:186-189]
- **인용 소개 문장의 "가장 많은 추천"** — 소개한 무리(예: 좋게 한 리뷰) 안에서 정말 가장 많을 때만. [code:chatbot/branches/experience.py:271]

평가(2026-11-13, 고친 뒤 두 번)

- **76/76 · 75/76**(경험·후기 16 — E16 더함 + 기존 60). 실패 하나는 S10(스펙 — 이번에 고치지 않은 갈래): LLM 이 "플레이트는 나일론을 사용해요"라고 써서 평가의 금칙어 규칙("카본" 없는 "플레이트")에 걸렸다. 다시 돌려 고르지 않았다. [code:chatbot/eval/run.py:287-290] (2026-11-13 기준) [c:6eb2878]
- 수치 불일치 0 · 전문의 누락 0 · 분모 · 세 칸 어긋남 0 · Hit@5 3/3 · 묻는 말 둘 0 · 리뷰 원문 따옴표 옮김 0 · 여러 켤레 이름 없는 문단 0 · 경험·후기 합니다체(인용 밖) 0 · E14 false · E16 true(두 번). 평균 2.6초, 경험·후기 평균 3.6~3.8초(최대 10.2초). (2026-11-13 기준) [c:6eb2878]
- LLM 글을 뺀 답(코드 글만): E01 두 번 — 말할 거리가 적을 때 LLM 이 말투 예시의 스펙 숫자(169,000원 · 255g …)를 끌어와 검사에 걸린다. 집계 · 인용 · 안내는 그대로 나간다. (2026-11-13 기준) [c:6eb2878]
- 돌린 차례: ① 76 · 76 — 여러 켤레에서 LLM 문단에 신발 이름이 없었다(E11) → 여러 켤레일 때 이름을 밝히게. ② 76 · 75 — 위 결과. (2026-11-13 기준) [c:6eb2878]
- **"다만" 두 번은 남았다** — 76문항 중 3~4문항(R04 · B02 · B05 · B09). R04 는 코드 문장 둘("다만 가격은 발매가 기준이라 …" + "다만 지속되는 통증은 …")이 붙어서다 — 붙는 글을 알려 줘도 풀리지 않는다. 나머지는 LLM 글 끝 문장이 "다만 …"이다. 금지 문구는 더하지 않았다(지시). (2026-11-13 기준) [c:6eb2878]
- **이 보고의 "0" 셋은 틀렸다**(3차 수정 때 관리자가 전문에서 확인): E11 두 번 모두 이름 없는 문단 셋, B05 · B09 용도 묻는 말 두 번, "다만" 겹침. 까닭은 3차 수정 6 아래. (2026-11-13 기준) [c:8389dc0]

3차 수정(2026-11-13 — 사용자가 2차 결과 전문을 읽고 정함, 관리자 지시 1~10)

| 무엇 | 한 것 |
|---|---|
| 1. 인용 소개 문장 | 조립하지 않고 경우마다 문장을 따로 둔다(`experience.INTRO` · `INTRO_ALL`). "{관점}을/를"은 조사만 코드가 고른다(아래 원문) [code:chatbot/branches/experience.py:210-220] [code:chatbot/branches/experience.py:273] |
| 2 · 5. 붙는 것을 보여 주지 않는다 | 앞 — 집계 · 인용 글을 보여 주지 않는다(`experience.BEFORE_NOTE`). 인용한 리뷰는 근거 목록에서 뺀다. 근거 머리의 건수도 뺐다. 뒤 — 문장 대신 종류만. 코드가 붙이는 글과 같은 문장이 LLM 글에 있으면 문장째 지운다(모든 갈래, `reply.drop_repeats`). 묻는 문장을 지운 뒤 그 단락에 한 문장만 남으면 단락째 지운다(조각 "… 가운데 하나면 돼요." — B05 · B09) [code:chatbot/branches/experience.py:543-546] [code:chatbot/branches/common.py:15-16] [code:chatbot/branches/common.py:34-40] [code:chatbot/reply.py:109-121] [code:chatbot/reply.py:172-174] [code:chatbot/branches/experience.py:421] |
| 3. 인용 길이 | 관점 문장(둘까지) 중심. 관점 문장이 20자보다 짧거나 다음 문장이 8자보다 짧으면 다음 문장을, 이음말("그래서 · 그런데 · 하지만 …")로 시작하면 앞 문장을 붙인다. 상한 160자. 통증(묶음이 넓다)은 질문의 낱말("물집" · "쓸리")이 든 리뷰만 인용 · 근거로 — 없으면 근거 없음 [code:chatbot/branches/experience.py:206-208] [code:chatbot/branches/experience.py:291-320] [code:chatbot/branches/experience.py:384] [code:chatbot/branches/experience.py:586-587] |
| 4. "다만" 겹침 | 발매가 문장을 "가격은 발매가 기준이라 지금은 더 저렴할 수 있어요."로(`facts.PRICE_NOTE`, [공통 규칙] 문장, 말투 예시 ⑤ · ⑥의 같은 문장도). [code:chatbot/facts.py:18] [code:chatbot/prompt.py:55] [code:chatbot/prompt.py:125] [code:chatbot/prompt.py:147] [code:chatbot/prompt.py:16] |
| 6. 이름 없는 문단 | 여러 켤레에서 LLM 문단에 신발 이름(모델명 전체, 또는 그 목록에서 하나뿐인 세대 뗀 이름)이 없으면 문단째 뺀다(`experience.keep_named`). 평가도 코드가 쓴 문단(머리 · 신발 블록 · 인용 · 의료 안내 · 보러 가실래요?)을 뺀 모든 문단을 같은 규칙으로 본다 [code:chatbot/eval/run.py:492-517] <!-- 헷갈림: 문단째 빼는 keep_named 는 4차 수정에서 뺐다(까닭은 4차 3). 평가 검사는 지금도 있어 한 줄로 남김 --> |
| 8. R04 | 정답 파일 `health: true`(발 유형도 통증 — 임시, 7절 · `TODO.md`) [code:chatbot/eval/golden.jsonl:34] [docs:TODO.md] |
| 9. 집계가 질문마다 다르다 | 알려진 한계로 둔다(아래) |
| 10. S10 | 평가의 "카본 없는 플레이트" 금칙을 경험·후기에서 "리뷰"가 든 문장만으로 좁혔다 — 설명문 · 스펙에는 "판(플레이트)은 나일론"이 실제로 있다(엔돌핀 스피드 4) [code:chatbot/eval/run.py:287-290] |

인용 소개 문장 원문(`{a}` 자리는 관점 + 을/를 — "무릎을" · "통증을" · "사이즈를")

| 경우 | 가장 많은 추천일 때 | 아닐 때 |
|---|---|---|
| 찾는 쪽이 긍정 | {a} 말한 리뷰 중 좋다는 쪽에서, 가장 많은 추천을 받은 리뷰예요. | {a} 말한 리뷰 중 좋다는 쪽의 한 건이에요. [code:chatbot/branches/experience.py:215-216] |
| 찾는 쪽이 부정(피하려는 질문 포함) | {a} 말한 리뷰 중 아쉽다는 쪽에서, 가장 많은 추천을 받은 리뷰예요. | {a} 말한 리뷰 중 아쉽다는 쪽의 한 건이에요. [code:chatbot/branches/experience.py:217-218] |
| 관점은 있고 쪽은 없음 | {a} 말한 리뷰 가운데 가장 많은 추천을 받은 리뷰예요. | {a} 말한 리뷰 가운데 한 건이에요. [code:chatbot/branches/experience.py:213-214] |
| 관점이 없음("후기 어때요") | 등록된 리뷰 가운데 가장 많은 추천을 받은 리뷰예요. | 등록된 리뷰 가운데 한 건이에요. [code:chatbot/branches/experience.py:220] |

여러 켤레는 앞에 "{브랜드}의 {모델}: " + 집계가 붙고 소개 문장은 같다. 근거가 얇을 때는 집계 문장("리뷰 근거가 많지 않아요 — N건 중 K건에서만 나온 이야기예요. 둘 다 좋다는 이야기였어요.") 뒤에 같은 소개 문장이 온다. [code:chatbot/branches/experience.py:177-178] [code:chatbot/branches/experience.py:416] [code:chatbot/branches/experience.py:194-195]

6 — 2차 검사가 놓친 까닭: 이름 없는 문단은 평가(`run.py`)에 검사가 없었고, 보고 숫자는 따로 돌린 스크립트에서 "(등록된) 리뷰에서는"으로 **시작하는** 문단만 찾았다 — E11 은 "리뷰에 따르면, …"이었다. 같은 구멍: **묻는 말 검사**는 "?"로 끝나는 문장만 셌다 — 용도 묻기("…알려주시면 그에 맞춰 찾아볼게요.")는 마침표라 B05 · B09 의 두 번을 놓쳤다 → "알려주시면 · 말씀해주시면"이 든 문장도 센다(코드 고정 문구 하나는 하나로). **"다만"**은 경고로만 셌고 보고에 문항을 적었지만 R04 외엔 "LLM 끝 문장"이라고 뭉뚱그렸다. **"같은 문장 두 번"** 검사는 없었다 → 코드 고정 문구(용도 묻기 · 의료 안내 · 발매가 · 보러 가실래요?)의 문장이 두 번 나오면, 인용 블록의 문장이 인용 밖에 또 나오면 실패로 더했다. 신발 이름 검사는 "젤 님버스"처럼 이름 일부로 통과하지 않게 모델명 전체(또는 그 목록에서 하나뿐인 세대 뗀 이름)만 본다. [code:chatbot/eval/run.py:242-249] [code:chatbot/eval/run.py:250-263] [code:chatbot/eval/run.py:264-267] [code:chatbot/eval/run.py:492-501]

코드가 붙이는 문장끼리 겹칠 자리(4 — 찾은 목록, 고치지 않았다)

- 추천 + 통증: "좋은 신발 만나시길 바랄게요!" 바로 뒤 "다만 지속되는 통증은 …"(R04) — 느낌표 인사 뒤 의료 안내. 통증 답은 느낌표를 쓰지 않는다는 규칙(9절)과도 어긋난다. [code:chatbot/branches/recommend.py:92] [code:chatbot/reply.py:303-305] <!-- 헷갈림: 지금은 의료 안내가 답 맨 앞이다. 4차 수정에서 자리를 옮긴 까닭이라 남김 -->
- 등록되지 않은 신발 + 통증: "비슷한 모델로 찾아볼까요?"(NO_SHOE) 뒤에 의료 안내가 붙는다 — 묻고 나서 안내. 같은 라인 권하기("…보러 가실래요?")도 같다. [code:chatbot/prompt.py:10] [code:chatbot/bot.py:333] <!-- 헷갈림: 지금은 의료 안내가 답 맨 앞이다. 4차 수정에서 자리를 옮긴 까닭이라 남김 -->
- 스펙 · 비교 + 통증: LLM 이 쓴 "…보러 가실래요?" 문장 뒤에 의료 안내(코드 끝 단락이 아니라 앞으로 옮기지 못한다). [code:chatbot/reply.py:303-305] <!-- 헷갈림: 지금은 의료 안내가 답 맨 앞이다. 4차 수정에서 자리를 옮긴 까닭이라 남김 -->
- 경험·후기 "잠시 뒤"(EXPERIENCE_WAIT) + 통증, 특성 설명 "근거 없음"(NO_FEATURE) + 통증 — 이어 읽어 어색하지 않다. [code:chatbot/bot.py:283-285] [code:chatbot/branches/explain.py:86-87]

평가(3차, 2026-11-13 — 고친 뒤 두 번. 검사 숫자 밖에 답 전문을 읽어 확인했다)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0 · E14 false · E16 true · R04 true(두 번). (2026-11-13 기준) [c:8389dc0]
- 묻는 말 둘 — 평가 검사("?"로 끝나거나 "알려주시면 · 말씀해주시면"이 든 문장, 코드 고정 문구 하나는 하나로)로 0. 고정 문구까지 그대로 세면 R09 · B15 둘이 2 인데 둘 다 코드 문구 `ASK_PURPOSE` 하나("…건가요? … 알려주시면 …!")다. B05 · B09 는 답 전문에서 용도 묻기가 한 번뿐인 것을 읽어 확인했다. [code:chatbot/prompt.py:20] [code:chatbot/eval/run.py:244-247] (2026-11-13 기준) [c:8389dc0]
- 코드 문장 두 번 · 인용을 인용 밖에서 다시 씀 · 여러 켤레 이름 없는 문단 — 평가 검사로 0. 이름 없는 문단은 코드가 지운 것이다(E10 · E13 두 번 모두 1~2문단, 그 문단 내용은 답에서 빠진다). (2026-11-13 기준) [c:8389dc0]
- 인용 길이 — 21개, 최대 119자(E15), 평균 44자. E13 가이드 19 는 "갑피도 두툼해서 한여름엔 발이 금방 더워지고요." 한 줄. (2026-11-13 기준) [c:8389dc0]
- E12 — 쓸림 · 물집과 상관없는 리뷰가 근거에서 빠져 LLM 글이 없다(집계 · 인용 · 안내만). E14 도 같다(인용한 리뷰 말고 "쓸렸"이 든 리뷰가 없다). (2026-11-13 기준) [c:8389dc0]
- LLM 글이 빠진 답 — 3회차 B03 · E01 · E08(검사에 걸림 — 말투 예시의 숫자), 4회차 0. (2026-11-13 기준) [c:8389dc0]
- 평균 2.4초, 경험·후기 평균 3.3~3.4초(최대 7.6초). (2026-11-13 기준) [c:8389dc0]
- 돌린 차례: ① 76 · 76 — E12 에 "30km 롱런엔 쿠션이 모자라"가 남았다(질문 낱말이 든 리뷰가 없으면 통증 묶음 전체로 돌아갔다) → 질문 낱말이 든 리뷰만으로. ② 76 · 76 — 위 결과. (2026-11-13 기준) [c:8389dc0]

4차 수정(2026-11-13 — 사용자가 3차 결과 전문을 읽고 정함, 관리자 지시 1~8)

| 무엇 | 한 것 |
|---|---|
| 1. 전문의 안내 자리 | 통증이면 **답 맨 앞**, "다만" 없이 — "지속되는 통증은 전문 의료기관에서 정확한 진단을 받아보시는 게 좋아요." + 빈 줄(`reply.with_doctor` 한 곳 — 모든 갈래). 생성 프롬프트 알림도 "네 답 앞에 따로 붙는 것: 통증 …"으로, 통증 시스템 문단 "앞의 의료 안내는 따로 붙는다", 말투 예시 ③의 괄호 "(의료 안내 문장은 시스템이 답 앞에 붙인다)" [code:chatbot/reply.py:303-305] [code:chatbot/prompt.py:16] [code:chatbot/branches/common.py:29-37] [code:chatbot/prompt.py:64] [code:chatbot/prompt.py:96] |
| 2. 관련 없는 설명문 | E03 · E16 의 "신발 설명을 보면 …"은 설명문이 아니라 [할 일]의 설명문 문장이 지어낸 것이었다(그 질문엔 설명문을 주지 않았다). E15 "쿠션 소재가 FF Blast Max …"는 대화 기록(앞 턴의 스펙 답)에서 왔다 → 경험·후기 생성에는 대화 기록을 주지 않는다 [code:chatbot/branches/experience.py:448] [code:chatbot/branches/experience.py:457] |
| 3. 이름 없는 문단 | 지우는 코드(`keep_named`)를 뺐다. 여러 켤레는 **신발마다 LLM 을 따로**(동시에) 부르고, 그 글을 그 신발의 인용 바로 아래에 붙인다 — 어느 신발 이야기인지 자리로 정해지고 섞일 일이 없다. 1차 · 2차의 "문단마다 신발 이름"(`MULTI_TASK`)도 뺐다 [code:chatbot/branches/experience.py:438-465] |
| 4. 세지 않은 양 | 근거 리뷰를 묶음으로 주고 건수를 붙인다 — 관점이 있으면 "[무릎 — 좋다는 쪽 4건, 1건은 앞에 인용함] 이 쪽 리뷰 가운데 쿠션 이야기 3건 · 착용감 이야기 3건", 관점이 없으면 "[리뷰 — 이야기별 건수(…)] 쿠션 14건 · 발볼 13건 …" + 리뷰마다 이야기 표시. 인용한 리뷰는 내용 없이 자리만 남긴다(빼면 LLM 이 남은 줄을 세어 "3건"이라 썼다). LLM 글의 건수는 근거에 준 건수만 — 아닌 문장은 그 문장만 지운다(전엔 LLM 글 전체를 뺐다) [code:chatbot/branches/experience.py:575-606] <!-- 헷갈림: 근거에 준 건수는 5차 수정에서 모두 뺐다(엉뚱한 말에 갖다 붙였다). 5차의 까닭이 이 줄을 가리켜 남김 --> |
| 5 · 6. 원칙 | [할 일]을 원칙으로 다시 썼다: 리뷰 내용은 "~다는 이야기가 있어요" 꼴 · 리뷰 문장을 그대로 옮기거나 네 말로 단정하지 않는다 · 근거에 있는 내용만 · 근거에 없는 것은 없다고도 말하지 않는다 · 묶음 건수로만 양을 말한다 · 문단마다 새 이야기 · 할 말이 없으면 그 문단을 쓰지 않는다(아무것도 안 써도 된다 — 빈 글은 검사에 걸린 것으로 세지 않는다). 금지 예시 문장은 넣지 않았다. 양 짐작 낱말 목록도 [할 일]에서 뺐다(코드 `drop_vague` 는 그대로) [code:chatbot/branches/experience.py:77] [code:chatbot/branches/experience.py:83-89] [code:chatbot/branches/experience.py:612] |
| 6. 소재 이름 | 쉬운 말 변환(`reply.plain_words`)은 사전 용어 셋(스택하이트 · 드롭 · 미드솔)만 바꾼다 — 소재 이름(FF Blast Max · ZoomX …)은 다루지 않는다. E15 의 것은 대화 기록에서 온 것이라 기록을 빼서 없어졌다 [code:chatbot/reply.py:225-235] |
| 7. 추천 순위 | 순위 문장("1위는 아식스의 젤 카야노 33이에요." …)을 [결론 문장]으로 준다. 그래도 "N위"가 하나라도 빠지면 코드 답(사용자 예시 ⑥ 꼴)으로 [code:chatbot/branches/recommend.py:94-100] |

걷어낸 임시 처리(전문의 안내를 끝에 두느라 넣었던 것)

- 남겨 둔 것: 발매가 문장에서 "다만"을 뺀 것(3차 — 사용자 결정 문구), LLM 이 쓴 의료 문장 지우기(`strip_medical`, 5-1 — 자리와 상관없이 중복을 막는다). [code:chatbot/facts.py:18] [code:chatbot/reply.py:73-81] [code:chatbot/reply.py:190-192]

Claude 가 정한 것(4차 수정)

- **신발마다 따로 부르기** — 동시에 부른다(스레드). 여러 켤레 경험·후기 평균은 3.3~3.4초 → 3.6초 안팎(최대 8.8초). [code:chatbot/branches/experience.py:458-461] (2026-11-13 기준) [c:c884594]
- **경험·후기에 대화 기록을 주지 않는다** — 근거는 [리뷰] · [설명문]뿐. 가리키는 말("그거")은 그 전에 코드가 신발로 풀어 둔다. [code:chatbot/branches/experience.py:457] [code:chatbot/bot.py:167-169]
- **쪽 건수를 근거 머리에 준다** — 앞 집계(긍정 · 부정)와 같은 수다. 처음엔 빼 봤는데 그 쪽 이야기를 할 때 "몇 번 나왔어요"로 뭉갰다(E04). 대신 [이미 앞에 나간 것]에서 "집계 문장을 다시 쓰지 않는다"로 문장 되풀이만 막는다. [code:chatbot/branches/experience.py:544-545] [code:chatbot/branches/experience.py:589] <!-- 헷갈림: 쪽 건수는 5차 수정에서 다시 뺐다. 그때 넣은 까닭(E04 뭉갬)이라 남김 -->
- **길이** — 신발 하나는 "두 문장에서 네 문장", 여러 켤레는 신발마다 "두세 문장, 한 문단". [code:chatbot/branches/experience.py:436]
- **근거에 없는 건수는 문장째 지운다**(글 전체가 아니라). [code:chatbot/reply.py:132-159]

평가(4차, 2026-11-13 — 고친 뒤 두 번. 답 전문을 읽어 확인)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0. (2026-11-13 기준) [c:c884594]
- 의료 안내 — 통증 답 모두 맨 앞(답이 안내로 시작하지 않는 통증 답 0 — 평가 결과에서 "지속되는 통증은"이 든 답이 그 문장으로 시작하는지 셌다). "다만"이 붙어 이어지는 답 0(안내에 "다만"이 없다). LLM 글 안의 "다만"이 두 번인 답은 E06 · E10 · E15(떨어져 있다). (2026-11-13 기준) [c:c884594]
- 추천 순위 — 용도까지 받아 결과를 낸 추천 답에서 "1위"가 없는 답 0(코드 답으로 바꾼 것 0 — "코드 답: 순위 빠짐" 로그 0). [code:chatbot/branches/recommend.py:97-100] (2026-11-13 기준) [c:c884594]
- 여러 켤레 — 평가 검사(첫 신발 블록 앞의 LLM 문단 · 다른 신발 이야기가 섞인 문단)로 0. **이번엔 지운 것이 아니다** — 이름 없는 문단을 지우는 코드는 없다. LLM 글이 그 신발 블록 아래에 붙어 이름이 없어도 어느 신발인지 정해진다. [code:chatbot/branches/experience.py:458-470] (2026-11-13 기준) [c:c884594]
- 코드가 LLM 글을 지운 횟수(두 번 합): 묻는 문장 15 · 근거에 없는 건수 문장 4 · 양 짐작 문장 4 · 사전 용어 → 쉬운 말 3. LLM 글을 통째로 뺀 답(검사에 걸림): E15 · E06 각 1회(사실에 없는 숫자 — 말투 예시의 숫자), 경계 B02(신발이 몸에 도움) · B03(목록 이야기)은 코드 답. (2026-11-13 기준) [c:c884594]
- 세지 않은 양 — 두 번 합쳐 2문장(E04 "몇 건" · E15 "여러 번"). 3차엔 E04 · E06 · E10 · E11 · E15 에 있었다. 답 전문을 "여러 번 · 몇 번 · 몇 건 · 여러 개 · 많이"로 찾고 문맥을 읽어 셌다("땀이 많이 찬다"처럼 리뷰 내용인 것은 뺐다). (2026-11-13 기준) [c:c884594]
- "없다"고 말한 문장 — 0(3차 E13 "등록된 정보에서 찾을 수 없었어요"류). (2026-11-13 기준) [c:c884594]
- 평균 2.5초, 경험·후기 평균 3.6초(최대 8.8초). (2026-11-13 기준) [c:c884594]
- 돌린 차례: 시험(부분)에서 ① LLM 이 남은 줄을 세어 앞 집계와 다른 건수를 씀 → 인용 자리 남김 ② 근거에 없는 건수면 글 전체를 뺌 → 문장만 ③ 평가가 새 건수를 몰라 "API 에 없는 숫자" → trace 로 넘김. 전체 두 번은 그 뒤 한 번. [code:chatbot/bot.py:294] (2026-11-13 기준) [c:c884594]

5차 수정(2026-11-13 — 사용자가 4차 결과와 E11 · E06 · E07 · E10 전문을 읽고 정함: "건수를 주니 엉뚱한 말에 갖다 붙였다 — 틀린 사실이 숫자로 나가는 것이 뭉개는 것보다 위험하다")

| 무엇 | 한 것 |
|---|---|
| 1. 역할 나누기 | 틀리면 안 되는 것(집계 · 인용 · 설명문)은 코드가, LLM 은 리뷰 여러 건을 묶어 말하기만 [code:chatbot/branches/experience.py:8-9] |
| 1-1. 숫자 | LLM 근거에서 숫자를 모두 뺐다 — 쪽 건수 · 이야기별 건수(4차) · 별점 · 추천 수. 근거는 "[무릎 — 좋다는 쪽 리뷰]" + 리뷰 원문 줄(관점이 없으면 "[리뷰]" 한 묶음). [code:chatbot/branches/experience.py:575-606] [code:chatbot/branches/experience.py:86] [code:chatbot/reply.py:147-159] |
| 1-2. 설명문 | 해요체 표만으로는 설명문 끝("않습니다" 98 · "아졌습니다" 46 …)이 남아 `reply.haeyo` 를 일반 규칙(받침 ㅆ · ㅂ 불규칙 · 모음 어울림 · 르 · ㅅ · ㄹ 탈락)으로 넓혔다 — 설명문 1,638문장 모두 해요체로. [code:chatbot/reply.py:262-300] (2026-11-13 기준) [c:b40a4de] |
| 2. 집계 문장 | "리뷰 18건 중 발볼 이야기가 9건이고, 그중 좋다는 쪽이 8건 아쉽다는 쪽이 1건이에요." 한쪽만이면 "…9건이고, 모두 좋다는 쪽이에요." 근거 얇음 · 0건 문장은 그대로(이미 좋다 · 아쉽다 말). 코드 대조 `Tally.check` 와 평가는 좋다 + 아쉽다 = 관점 이야기 ≤ N, 집계 문장의 숫자가 코드 집계와 같은지로 [code:chatbot/branches/experience.py:196-203] [code:chatbot/branches/experience.py:161-163] [code:chatbot/eval/run.py:375-388] |
| 3 · 4. 빈 문장 · "반면에" | 따로 고치지 않았다 — 결과는 아래 |

Claude 가 정한 것(5차 수정)

- **숫자는 문장째 지운다** — 글 전체가 아니라. 리뷰 속 숫자(6분 20초 · 30km)도 같다(숫자를 옮긴 문장이 맞는지 코드가 가를 수 없다). 신발 이름의 숫자("노바블라스트 6" · "카야노 33")는 숫자로 보지 않는다(세대 숫자만 남는 "33"은 아니다). 2E · 4E 도 숫자다. [code:chatbot/reply.py:124-144] <!-- 헷갈림: 리뷰 속 숫자까지 지우던 것은 6차 수정 3에서 풀었다(근거 리뷰에 있는 숫자는 둔다). 그때의 까닭이라 남김 -->
- **숫자가 필요한 갈래**: 스펙 · 비교 · 추천은 숫자가 답의 몸이라 그대로(공통 검사 — 사실에 없는 숫자면 코드 답). 경험·후기만 숫자를 막는다. [code:chatbot/branches/common.py:88-92] [code:chatbot/branches/experience.py:448-450] [code:chatbot/prompt.py:161]
- **근거 리뷰를 쪽마다 묶는 것은 남겼다**("[무릎 — 좋다는 쪽 리뷰]", 숫자 없이) — 분류가 정한 쪽을 LLM 이 다시 가르지 않게. [code:chatbot/branches/experience.py:584-590]
- **통증 질문에는 설명문을 붙이지 않는다** — 코드가 붙이는 글은 생성 검사(효과 약속 등)를 거치지 않는다. [code:chatbot/branches/experience.py:43-44] <!-- 헷갈림: 이 갈래는 운영 뒤 수정에서 설명문을 아예 뺐다. 코드 글이 생성 검사를 거치지 않는다는 까닭이라 남김 -->
- **해요체 일반 규칙** — 설명문을 그대로 붙이게 되어 필요했다. 특성 설명의 코드 답에도 쓰인다. [code:chatbot/reply.py:286-300] [code:chatbot/branches/explain.py:101]

평가(5차, 2026-11-13 — 고친 뒤 두 번. 답 전문을 읽어 확인)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0. 평균 2.7초, 경험·후기 평균 3.9초(최대 9.3초). (2026-11-13 기준) [c:b40a4de]
- LLM 글의 숫자 — 평가 검사(`trace.generated` 에서 신발 이름 숫자를 뺀 숫자)로 0. **코드가 지워서 0이다**: 숫자 문장 지움 1회차 6(E03 1 · E10 2 · E15 3) · 2회차 3(E06 · E10 · E15 각 1). [code:chatbot/eval/run.py:463-471] (2026-11-13 기준) [c:b40a4de]
- LLM 글을 통째로 뺀 답 — 0 · 0(4차 E15 · E06 각 1 — 말투 예시의 숫자). LLM 글이 없는 경험·후기 답은 E09(0건 — 부르지 않음) · E12 · E14 · E16(질문 낱말이 든 리뷰가 인용 한 건뿐) — 4차와 같다. (2026-11-13 기준) [c:b40a4de]
- 코드가 LLM 글을 지운 횟수(두 번 합, 모든 갈래): 묻는 문장 21 · 숫자 문장 9 · 사전 용어 → 쉬운 말 1. 양 짐작 문장 0(4차 4) · 근거에 없는 건수 문장 —(걷음, 4차 4). (2026-11-13 기준) [c:b40a4de]
- 4차에 보고한 문제: E03 "발볼이 눌린다는 이야기가 3건" · E10 "…4건" · 앞 집계 되풀이(E10 · E11 · E13) · 이야기별 건수 나열(E07 · E08 · E15) · E04 "몇 건" · E15 "여러 번" — 두 번 모두 없다(숫자가 근거에도 글에도 없다). E10 "페가수스 42가 해당해요" · E06 · E07 "이런 이야기들이 있네요" — 두 번 모두 없다. E10 "반면에 + 긍정" — 두 번 모두 없다(E04 2회차 "반면에, 대회용으로는 좋았고 …"는 앞이 아쉽다는 이야기라 맞다). (2026-11-13 기준) [c:b40a4de]
- 빠진 이야기 — 4차와 관점 낱말로 견줬다(LLM 글만). 4차에만 있던 것은 대부분 설명문에서 온 것(E02 발등 · 안정감, E13 사이즈 · 안정감 — 이제 LLM 이 설명문을 받지 않는다). 리뷰 이야기가 빠진 문항은 보이지 않았다. (2026-11-13 기준) [c:b40a4de]

남은 것(5차에서 보이는 것)

- **관점 없는 질문의 LLM 글이 길어졌다** — "리뷰 하나하나 전한다"를 30건 근거에 적용해 한 줄씩 늘어놓는다: E15 1회차 21문장(920자, 한 문장 문단 18개) · 2회차 10문장, E06 12 · 9문장, E07 5 · 10문장. 길이 지시("두 문장에서 네 문장으로")를 넘는다. 같은 이야기를 리뷰마다 되풀이하기도 한다(E04 "밑창이 빨리 닳는다" 셋). 관점이 있는 질문은 2~4문장으로 지킨다. (2026-11-13 기준) [c:b40a4de]
- **숫자를 글자로 바꿔 쓴다** — E13 "아홉월에도"(리뷰 원문 "9월에도", 두 번 모두 — "글자로 바꿔 쓰지도 않는다"를 붙인 뒤에도). (2026-11-13 기준) [c:b40a4de]
- **빈 문장** — E11 "젤 님버스 28은 발볼에 대한 리뷰가 여러 가지 있어요 / 나뉘는 것 같아요"(두 번), "좋다는 리뷰와 아쉽다는 리뷰가 있어요"(슈퍼블라스트 3). (2026-11-13 기준) [c:b40a4de]
- **리뷰 원문의 "와이드 모델"** — LLM 글에 그대로 옮긴다(쉬운 말 경고, 리뷰 말이라 바꾸지 않는다). 설명문의 것은 코드가 바꾼다. (2026-11-13 기준) [c:b40a4de]

6차 수정(2026-11-13 — 사용자가 5차 결과와 규칙 브리핑을 읽고 정함, 관리자 지시 1~8)

| 무엇 | 한 것 |
|---|---|
| 1. 관점 없는 질문의 길이 | LLM 에 주는 리뷰를 줄였다 — 관점이 없는 질문(「후기 어때요」)은 근거 10건. 코드가 자르기 · 지시 덧대기는 쓰지 않는다(지시). **건수를 줄여도 두세 문장이 되지 않았다**(아래 표) [code:chatbot/branches/experience.py:29-34] <!-- 헷갈림: 10건은 7차에서 걷은 옛 값이지만, 줄여도 짧아지지 않았다는 결과가 7차로 넘어간 까닭이라 남김 --> |
| 3. 숫자 규칙 좁히기 | [할 일] "건수나 양을 세지 않는다 — 몇 건인지는 앞의 집계가 이미 말했다. 리뷰에 있는 숫자는 그대로 써도 된다." 5차의 "숫자는 쓰지 않는다 · 리뷰 속 숫자도 옮기지 않는다 · 글자로 바꿔 쓰지도 않는다 · 얼마나 많이 나왔는지도 말하지 않는다"를 뺐다. 코드는 그 신발에 준 근거 리뷰 + 인용에 없는 숫자, 또는 건수("N건")가 든 문장만 지운다(`reply.bad_digits`). 평가도 같은 기준(답 신발들의 리뷰 원문) [code:chatbot/branches/experience.py:86] [code:chatbot/reply.py:135-144] [code:chatbot/eval/run.py:463-471] |
| 6. 리랭커 | 보류 — 2절 · `TODO.md` [docs:TODO.md] |
| 7. 악성 리뷰 | 남은 일로 — 6절 · `TODO.md` [docs:TODO.md] |

관점 없는 질문 — LLM 에 주는 리뷰 건수별 LLM 글 문장 수(2026-11-13, 노바블라스트 6 · 페가수스 42 · 젤 카야노 33 "후기 어때요", 건수마다 두 번. 근거 = 인용 1 + LLM 에 준 리뷰) [c:6d8d364]

| 근거 건수 | 노바블라스트 6 | 페가수스 42 | 젤 카야노 33 |
|---|---|---|---|
| 2 | 3 · 3 | 7 · 7 | 3 · 3 (2026-11-13 기준) [c:6d8d364] |
| 3 | 6 · 7 | 7 · 9 | 4 · 4 (2026-11-13 기준) [c:6d8d364] |
| 5 | 7 · 8 | 9 · 11 | 8 · 9 (2026-11-13 기준) [c:6d8d364] |
| 8 | 7 · 11 | 17 · 6 | 9 · 8 (2026-11-13 기준) [c:6d8d364] |
| 10 | 12 · 7 | 15 · 13 | 9 · 8 (2026-11-13 기준) [c:6d8d364] |
| 15 | 18 · 16 | 6 · 8 | 6 · 7 (2026-11-13 기준) [c:6d8d364] |
| 20 | 11 · 11 | 17 · 9 | 7 · 11 (2026-11-13 기준) [c:6d8d364] |
| 30 | 7 · 9 | 10 · 7 | 9 · 9 (2026-11-13 기준) [c:6d8d364] |

건수와 길이가 따라가지 않는다. LLM 에 리뷰 4건(근거 5)만 줘도 리뷰마다 두세 문장씩 풀어 7~11문장을 쓴다 — 두세 문장은 LLM 에 리뷰 1건(근거 2)일 때뿐이다. 원인은 건수보다 "리뷰 하나하나 전한다"를 관점 없이(묶을 이야기 없이) 따르는 데 있다. 관점이 있는 질문은 같은 지시로 2~4문장이다. 결정은 관리자 · 사용자에게 넘겼다(지금은 지시대로 10). (2026-11-13 기준) [c:6d8d364]

평가(6차, 2026-11-13 — 고친 뒤 두 번. 답 전문을 읽어 확인)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0. 평균 2.7초. (2026-11-13 기준) [c:6d8d364]
- LLM 글 문장 수(5차 두 번 → 6차 두 번): E06 12 · 9 → 8 · 10, E07 5 · 10 → 8 · 7(리뷰 8건이라 바뀐 것 없음), E15 21 · 10 → 10 · 12. 관점 있는 질문은 한 켤레 2~4문장(5차와 같음), 여러 켤레는 신발마다 2~5문장이고 E10 2회차 젤 카야노 33 은 10문장("두세 문장" 넘음 — 무릎 리뷰 6건뿐이라 상한과 상관없다). (2026-11-13 기준) [c:6d8d364]
- "아홉월" — 두 번 모두 "9월에도"(리뷰 원문 그대로). (2026-11-13 기준) [c:6d8d364]
- 리뷰 숫자를 다른 리뷰 이야기에 붙임 — 0. 두 번의 LLM 글에서 단위가 붙은 숫자(30분 · 6분 20초 · 2시간 · 5세대 · 1시간 · 10km · 15km · 30km · 8주 · 3km · 20km · 25km · 9월 · 5K) 문장 41개를 원 리뷰와 하나씩 대조했다. (2026-11-13 기준) [c:6d8d364]
- 코드가 지운 것(두 번 합, 모든 갈래): 묻는 문장 25 · 양 짐작 문장 3 · 사전 용어 → 쉬운 말 2 · 발매가 문장 1. **근거에 없는 숫자 문장 0**(5차 숫자 문장 9) — 지워서 0이 아니라 그런 문장이 나오지 않았다. LLM 글 통째로 뺌 — 경험·후기 0 · 0. 경계 B09 1회차가 코드 답(신발이 몸에 도움 — 추천 갈래, 6차와 상관없는 LLM 흔들림. 4차 B02 와 같은 꼴). (2026-11-13 기준) [c:6d8d364]
- 빠진 이야기 — E06 · E15 에서 5차에 있던 사이즈 · 안정감 · 발등 이야기가 빠졌다(추천 순 11번째 뒤 리뷰에 있던 것 — 근거를 줄인 대가). E07 은 리뷰 8건이라 근거가 같다. (2026-11-13 기준) [c:6d8d364]
- 지목한 신발 + 통증의 설명문 — 평가 문항에서는 붙는 답이 없다: 무릎 관점에 걸리는 설명문 문장이 0개(E01 · E08 · E10), E16(젤 님버스 28 · 통증)은 그 신발 설명문에 통증 낱말 문장이 없다. (2026-11-13 기준) [c:6d8d364]
- 설명문 속 몸에 대한 말(지시 4 — 운영 공개 API 310켤레 · 1,638문장, 고치지 않음): 효과를 말함 12 · 불편을 말함 12 · 몸 조건으로 가름 48(과내전 46 · 체중 2) · 낱말만 걸림 8. 통증 관점 낱말이 든 설명문 6문장 가운데 인피니티런 4 "러너가 부상 없이 달리도록 돕겠다는 목표로 시작된 라인"이 효과 문장이다. (2026-11-13 기준) [c:6d8d364]

남은 것(6차에서 보이는 것)

- **관점 없는 질문의 길이** — 위 표. 근거를 줄여도 두세 문장이 되지 않는다. (2026-11-13 기준) [c:6d8d364]
- **빈 문장** — E11 "젤 님버스 28은 발볼에 대한 리뷰가 여러 가지 있어요"(두 번), "슈퍼블라스트 3는 발볼 넓은 분들에게 좋다는 리뷰가 있어요"(두 번), E13 "여름에 신으면 덥다는 이야기가 있는 신발은 사우코니의 라이드 19이 있어요"(두 번, 머리 되풀이), E06 · E07 "리뷰를 몇 가지 말씀드릴게요"(여는 말). (2026-11-13 기준) [c:6d8d364]
- **LLM 이 판단을 보탠다** — E03 2회차 "본디 9은 정사이즈보다는 와이드 모델을 고려해보시는 게 좋을 것 같아요."(리뷰 전하기가 아니라 권하기). (2026-11-13 기준) [c:6d8d364]
- → 7차에서 사용자가 전문을 읽고 정했다: 위 "빈 문장"(E11 · E13)은 뒤 내용을 받는 도입이고, E03 권유는 사이즈 리뷰 3건이 모두 아쉽다는 쪽에서 나온 결론이라 **고치지 않는다**. 설명문 효과 문장 12개도 구조 설명이라 고치지 않는다(`01d_catalog_copy.md` 4-1). [docs:01d_catalog_copy.md]

7차 수정(2026-11-13 — 사용자가 6차 결과와 전문을 읽고 정함, 관리자 지시: 관점 없는 질문만 고친다)

| 무엇 | 한 것 |
|---|---|
| 관점 있는 질문 | 그대로(한 켤레 30 · 여러 켤레 10, 리뷰 하나하나) [code:chatbot/branches/experience.py:29] [code:chatbot/branches/experience.py:34] |

Claude 가 정한 것(7차 수정)

- **낱말로 나눈다(LLM 분류 호출 없이)** — 리뷰가 많은 다섯 켤레(노바블라스트 6 · 페가수스 42 · 젤 카야노 33 · 클리프톤 10 · 본디 9)의 추천 상위 30건(적으면 전부)에서 관점 사전 어디에도 안 걸린 리뷰는 0~4건이었다. 둘 이상 주제에 걸린 리뷰가 17~25건이라 → 주제 순서대로 아직 쓰지 않은 리뷰를 고른다(한 리뷰는 한 묶음에만 — 같은 리뷰를 두 번 풀어 쓰지 않게). 어디에도 안 걸린 리뷰 · 셋 밖 주제에만 걸린 리뷰는 주지 않는다. (2026-11-13 기준) [c:2b4be05]
- **착용감은 주제로 세지 않는다** — "편하다 · 불편하다"가 무엇이든 걸려(30건 중 5~12건, 거의 다 다른 주제와 겹침) 묶을 축이 되지 못한다. [code:chatbot/branches/experience.py:551] (2026-11-13 기준) [c:2b4be05]
- **묶음 안 좋다 · 아쉽다 쪽은 표시하지 않는다** — 분류 호출 없이 LLM 이 리뷰 원문에서 읽는다(묶음마다 2건뿐이라). 관점 있는 질문의 쪽은 그 관점만 분류한 것이라 다른 주제에 쓸 수 없다. (2026-11-13 기준) [c:2b4be05]
- **주제마다 2건** — 처음 3건으로 돌린 평가(1차)에서 리뷰마다 한 문장씩 써 묶음이 2~3문장, 노바블라스트 6 이 7~9문장이었다. (2026-11-13 기준) [c:2b4be05]

관점 없는 질문의 길이(LLM 글 문장 수)

| 질문 | 6차(10건, 두 번) | 7차 측정(주제 · 2건, 세 번) | 7차 평가(두 번) |
|---|---|---|---|
| 노바블라스트 6 후기(E06) | 8 · 10 | 5 · 5 · 5 | 5 · 7 (2026-11-13 기준) [c:2b4be05] |
| 클리프톤 10 리뷰(E07) | 8 · 7 | 8 · 5 · 5 | 7 · 3 (2026-11-13 기준) [c:2b4be05] |
| 노바블라스트 6, "그거"(E15) | 10 · 12 | — | 7 · 7 (2026-11-13 기준) [c:2b4be05] |
| 페가수스 42 리뷰 | (측정 10건 15 · 13) | 6 · 5 · 5 | — (2026-11-13 기준) [c:2b4be05] |
| 젤 카야노 33 후기 | (측정 10건 9 · 8) | 7 · 4 · 4 | — (2026-11-13 기준) [c:2b4be05] |
| 본디 9 후기 | — | 4 · 4 · 3 | — (2026-11-13 기준) [c:2b4be05] |

3~6 안: 측정 15번 중 13번, 평가 6번 중 2번(E06 1회차 5 · E07 2회차 3). 넘는 답은 7문장 — 묶음 하나에 리뷰 둘을 두세 문장으로 풀거나, 묶음과 다르게 문단을 리뷰마다 나눈다(E15 1회차). E06 2회차 끝 "궁금한 점 있으시면 언제든지 말씀해주세요!"는 묻는 문장 지우기에 걸리지 않고 남았다("말씀해주세요" 꼴 — 지우기 규칙은 "말씀해주시면"). (2026-11-13 기준) [c:2b4be05]

셋 밖으로 밀린 주제(인용 뺀 30건에서 그 낱말이 든 리뷰 수)

- 노바블라스트 6: 쿠션 11 · 발볼 7 · 통증 6 / 밀림 — 발목 5 · 뒤꿈치 5 · 무릎 4 · 발바닥 · 무게 · 접지 · 반발 3 … (2026-11-13 기준) [c:2b4be05]
- 클리프톤 10: 쿠션 5 · 발볼 3 · 발목 2 / 밀림 — 발등 2 · 발바닥 · 뒤꿈치 · 반발 1 (2026-11-13 기준) [c:2b4be05]
- 페가수스 42: 발볼 11 · 쿠션 11 · 무릎 3 / 밀림 — 발등 · 무게 3 … (2026-11-13 기준) [c:2b4be05]
- 젤 카야노 33: 무게 15 · 안정감 13 · 쿠션 11 / 밀림 — 발볼 9 · 무릎 · 발바닥 · 발등 5 … (2026-11-13 기준) [c:2b4be05]
- 본디 9: 쿠션 13 · 발볼 9 · 사이즈 4 / 밀림 — 통증 3 · 무릎 · 발바닥 · 무게 2 … (2026-11-13 기준) [c:2b4be05]

평가(7차, 2026-11-13 — 주제마다 2건으로 고친 뒤 두 번)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0. 평균 2.7초, 경험·후기 3.8~3.9초(최대 10.5초). (2026-11-13 기준) [c:2b4be05]
- 관점 있는 질문(6차 → 7차, 두 번씩): E01 4 · 4 → 4 · 4, E02 4 · 3 → 5 · 4, E03 2 · 3 → 3 · 2, E04 2 · 3 → 3 · 2, E05 3 · 3 → 2 · 3, E08 2 · 2 → 2 · 2, E10 4+2+3 · 10+4+3 → 9+4+3 · 8+2+3, E11 4+5+3 · 4+5+3 → 4+8+4 · 6+5+4, E13 3+3+2 · 3+3+2 → 3+4+2 · 4+3+2. 코드는 바뀌지 않았다(LLM 흔들림) — 여러 켤레 첫 신발이 8~9문장인 답이 6차(E10 2회차 10)처럼 나온다. (2026-11-13 기준) [c:2b4be05]
- 코드가 지운 것(두 번 합, 모든 갈래): 묻는 문장 32 · 사전 용어 → 쉬운 말 3 · 의료 문장 1 · 양 짐작 1 · 발매가 1 · 근거에 없는 숫자 문장 0. LLM 글 통째로 뺌 — 경험·후기 0 · 0. 경계 B03(추천) 두 번 코드 답(목록 이야기). (2026-11-13 기준) [c:2b4be05]
- 3건으로 돌린 첫 평가(fix7_run1 · 2)에서 경계 B05(특성 설명 · 통증) 두 번이 코드 답 — "사실에 없는 숫자 41.5 · 42 …", 말투 예시 ⑤의 쿠션 높이다. 특성 설명은 6차에 예시 여섯을 그대로 두었다(이번 수정과 상관없는 갈래). 2건 평가 두 번에서는 나오지 않았다. (2026-11-13 기준) [c:2b4be05]

8차 수정(2026-11-13 — 사용자: "길이는 줄었는데 아쉬운 이야기가 거의 사라졌다. 그쪽이 길이보다 큰 문제다")

7차 주제 묶음은 주제마다 추천 많은 2건이라, 추천 많은 리뷰가 거의 좋다는 쪽이어서 아쉬운 이야기가 근거에 들지 않았다(E06 · E15 "2시간 롱런엔 모자라" · "템포로 올리면 힘이 샌다" · "기본 모델은 새끼발가락이 쓸린다" · "5세대보다 탱탱", E07 "쿠션이 단단하고 튀는 맛이 없다"). (2026-11-13 기준) [c:c129673]

| 무엇 | 한 것 |
|---|---|
| 좋다 · 아쉽다로 묶기 | 관점 없는 질문은 상한 안 리뷰(한 켤레 30, 인용 뺌) 전체를 LLM 분류 한 번으로 가른다(`experience.split_sides` · `SIDES_SYSTEM`, temperature 0, 번호를 빠뜨리면 한 번 더 — 그래도 안 되면 추천 많은 리뷰 한 묶음). 근거는 "[좋다는 쪽 리뷰]" 추천 많은 순 3건 · "[아쉽다는 쪽 리뷰]" 4건, 건수 없이. [할 일] 앞머리: "좋다는 쪽 묶음의 이야기를 한두 문장, 아쉽다는 쪽 묶음의 이야기를 한두 문장 — 아쉽다는 쪽 묶음에서는 그 리뷰의 아쉬운 이야기만 쓰고, 그 리뷰에 섞인 좋은 말은 쓰지 않는다. 묶음이 없는 쪽은 쓰지 않는다." [code:chatbot/branches/experience.py:754-768] [code:chatbot/branches/experience.py:113-120] [code:chatbot/branches/experience.py:32-33] [code:chatbot/branches/experience.py:78-82] [code:chatbot/branches/experience.py:592-605] [code:chatbot/llm.py:43-45] |
| 별점 | 쓰지 않았다 — 5-2 처음 결정 9 "별점으로 대신하지 않는다" |
| 집계 문장 | 그대로("…에는 리뷰가 N건 있어요") — 좋다 · 아쉽다 건수를 더하지 않았다 [code:chatbot/branches/experience.py:399] |

Claude 가 정한 것(8차 수정)

- **분류는 넷 — positive(좋은 말만) · mixed(좋은 말 + 아쉬운 점) · negative(아쉬움이 중심) · none.** 좋은 말과 아쉬운 말이 같이 든 리뷰는 **아쉽다는 쪽 칸**에 넣는다(놓치지 않게). 아쉽다 칸은 negative 를 먼저, 그다음 mixed 를 각각 추천 많은 순으로 채운다 — 아쉬움이 큰 리뷰를 앞에 두려던 것인데, **gemma 는 아쉬운 말이 든 리뷰를 모두 mixed 로 가른다**(노바블라스트 6 13건 · 클리프톤 10 4건 모두 mixed, negative 0). 그래서 지금은 아쉽다 칸이 사실상 "아쉬운 말이 든 리뷰를 추천 순으로"다. 처음 둘(positive · negative)로 갈랐을 때도 분류 자체는 리뷰 내용과 맞았다(노바블라스트 6 30건을 읽어 확인). [code:chatbot/branches/experience.py:113-120] [code:chatbot/branches/experience.py:598-601] (2026-11-13 기준) [c:c129673]
- **상한 30건에서 가른다(6차의 10건은 다시 두지 않는다)** — 아쉬운 리뷰는 추천이 적어 추천 순 뒤쪽에 있다(노바블라스트 6 의 빠졌던 넷: 6 · 8 · 24 · 26/30위). 10건이면 24위 뒤는 가를 수도 없다. [code:chatbot/branches/experience.py:393] [code:chatbot/branches/experience.py:422-425] (2026-11-13 기준) [c:c129673]
- **쪽마다 3 · 4건** — 측정(아래): 아쉽다 3건이면 클리프톤 10 "튀는 맛이 없다"(7위)가 빠지고, 5건은 4건과 문장 수 · 내용이 비슷했다. [code:chatbot/branches/experience.py:32-33] (2026-11-13 기준) [c:c129673]

쪽마다 리뷰 수별 LLM 글 문장 수(2026-11-13, 질문 넷 × 두 번. 둘로 가른 첫 측정 2·2 / 3·3 / 3·5, 넷으로 가른 뒤 3·3 / 3·4 / 3·5) [c:c129673]

| 좋다 · 아쉽다 | 노바블라스트 6 | 클리프톤 10 | 페가수스 42 | 젤 카야노 33 |
|---|---|---|---|---|
| 2 · 2 | 6 · 4 | 5 · 5 | 4 · 3 | 6 · 5 (2026-11-13 기준) [c:c129673] |
| 3 · 3 | 4 · 4 → 5 · 3 | 5 · 4 → 4 · 4 | 5 · 5 → 4 · 4 | 3 · 3 → 5 · 5 (2026-11-13 기준) [c:c129673] |
| 3 · 4 | — → 4 · 3 | — → 4 · 3 | — → 5 · 5 | — → 3 · 3 (2026-11-13 기준) [c:c129673] |
| 3 · 5 | 3 · 2 → 4 · 4 | 4 · 5 → 3 · 8 | 5 · 4 → 4 · 5 | 5 · 3 → 4 · 5 (2026-11-13 기준) [c:c129673] |

평가(8차, 2026-11-13 — 고친 뒤 두 번)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0. 평균 2.7초, 경험·후기 3.9~4.0초(최대 10.5초 — 분류 호출이 하나 늘었다). (2026-11-13 기준) [c:c129673]
- 관점 없는 질문 LLM 글 문장 수(7차 두 번 → 8차 두 번): E06 5 · 7 → 6 · 6, E07 7 · 3 → 3 · 4, E15 7 · 7 → 3 · 3. 모두 3~6. 관점 있는 질문은 코드가 그대로라 7차와 비슷하다(E04 2회차 5, E10 첫 신발 9~10 — LLM 흔들림). (2026-11-13 기준) [c:c129673]
- 빠졌던 아쉬운 이야기(근거 = 아쉽다 칸에 들었나 / 답 = LLM 글에 나왔나):

| 이야기 | E06 1 | E06 2 | E15 1 | E15 2 |
|---|---|---|---|---|
| 2시간 롱런엔 모자라(6위) | 근거 ○ · 답 ○ | ○ · ○ | ○ · ○ | ○ · ○ (2026-11-13 기준) [c:c129673] |
| 5세대보다 탱탱(8위) | ○ · ○ | ○ · ○ | ○ · ○ | ○ · ✕ (2026-11-13 기준) [c:c129673] |
| 템포로 올리면 힘이 샌다(26 · 30위) | ✕ · ✕ | ✕ · ✕ | ✕ · ✕ | ✕ · ✕ (2026-11-13 기준) [c:c129673] |
| 기본 모델은 새끼발가락이 쓸린다(24위) | ✕ · ✕ | ✕ · ✕ | ✕ · ✕ | ✕ · ✕ (2026-11-13 기준) [c:c129673] |

  E07 "쿠션이 단단하고 튀는 맛이 없다"(7위) — 1회 근거 ○ · 답 ✕, 2회 근거 ○ · 답 ○. 노바블라스트 6 아쉽다 칸은 두 번 모두 추천 2 · 6 · 8 · 10위(2 · 10위는 "처음엔 뒤꿈치가 높아 어색" 정도의 작은 아쉬움), 24 · 26 · 30위는 추천 순으로 닿지 않는다. (2026-11-13 기준) [c:c129673]
- 리뷰 요약(`GET /api/shoes/{id}/summary`)의 "아쉬운 점"과 대조(요약은 대조 기준으로만, 챗봇 근거에는 넣지 않는다): [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryController.java:18]
  - 노바블라스트 6 "장거리 또는 빠른 템포에서 쿠션이 너무 말랑하거나 지지력이 부족" — 근거: 네 번 모두 ○(롱런 모자람 · 탱탱 리뷰). 답: 네 번 모두 ○(E15 1회는 "롱런에는 살짝 모자란다" — 낱말 대조가 "모자라"만 찾아 처음엔 ✕로 셌다가 전문을 읽어 고쳤다). 템포 쪽(힘이 샌다)은 근거에도 없다. (2026-11-13 기준) [c:c129673]
  - 클리프톤 10 "쿠션이 단단하다는 의견 · 덮개가 밀리거나 쏠림" — 덮개: 두 번 근거 ○ · 답 ○. 쿠션 단단: 두 번 근거 ○, 답 1회 ✕ · 2회 ○. (2026-11-13 기준) [c:c129673]
- 코드가 지운 것(두 번 합, 모든 갈래): 묻는 문장 32 · 사전 용어 → 쉬운 말 4 · 양 짐작 1 · 발매가 1 · 근거에 없는 숫자 문장 0. LLM 글 통째로 뺌 — 경험·후기 0 · 0. 경계 B05 두 번 코드 답(특성 설명 · 사실에 없는 숫자 41.5 · 42 — 말투 예시 ⑤, 7차 첫 평가와 같은 꼴 · 이번 수정과 상관없는 갈래). 쪽 가르기 실패 0. (2026-11-13 기준) [c:c129673]

남은 것(8차)

- **추천이 적은 아쉬운 리뷰는 들지 않는다** — 노바블라스트 6 "템포로 올리면 힘이 샌다"(26 · 30위) · "기본 모델은 쓸린다"(24위). 아쉽다 칸을 추천 순으로 채우는 한 닿지 않는다. 아쉬움의 크기로 고르려 했지만(negative 먼저) 분류가 갈라 주지 않았다. 별점으로 고르면 닿는다(24위 별점 1) — 결정 9 와 부딪혀 쓰지 않았다. (2026-11-13 기준) [c:c129673]
- **묶음 머리를 글에 옮긴다** — "좋다는 쪽 리뷰에서는 … / 아쉽다는 쪽 리뷰에서는 …"(E06 · E07 두 번). 틀린 말은 아니지만 기계적으로 읽힌다. (2026-11-13 기준) [c:c129673]
- **아쉽다 문단에 좋은 말** — 측정 3·4 클리프톤 1회 "반면, … 앞쪽이 넉넉하고 뒤꿈치는 패딩이 잘 잡아준다"(섞인 리뷰의 좋은 말). 평가 두 번에서는 보이지 않았다. (2026-11-13 기준) [c:c129673]
- 끝인사 줄 — 5~8차 평가 경험·후기 LLM 글에서 7차 2회차 E06 "궁금한 점 있으시면 언제든지 말씀해주세요!" 한 번(8차 0 · 0). 측정 중에 "노바블라스트 6 스펙과 더 자세한 정보는 스펙 사이트에서 확인하실 수 있어요."가 한 번. 원인 · 제안은 보고(관리자)에. (2026-11-13 기준) [c:c129673]

9차 수정 — 5-2 마무리(2026-11-13, 사용자 승인 1 · 2)

| 무엇 | 한 것 |
|---|---|
| 1. 아쉽다 칸 — 이야기가 다른 것부터 | `experience.diverse`: 후보(아쉽다 칸은 negative → mixed, 각각 추천 많은 순)를 차례로 보면서 관점 사전 낱말(착용감 빼고)로 본 이야기가 **이미 넣은 리뷰와 하나도 겹치지 않는 리뷰**를 먼저 넣고, 남은 자리는 후보 순서대로 채운다. 이야기가 겹치는 리뷰 · 어느 관점에도 안 걸리는 리뷰는 남은 자리에서만 들어간다. 넣은 리뷰는 추천 순으로 준다. 건수는 그대로(좋다 3 · 아쉽다 4), 별점은 쓰지 않는다. **좋다 칸에도 같은 방식**(Claude — 노바블라스트 6 좋다 칸이 3 · 4 · 5위 → 3 · 4 · 11위, 5위는 3위와 쿠션이 겹치고 11위는 젖은 길 접지) [code:chatbot/branches/experience.py:551-572] [code:chatbot/branches/experience.py:598-601] [code:chatbot/branches/experience.py:32-33] (2026-11-13 기준) [c:c80ef57] |
| 2. 예시를 갈래에 맞게 | 갈래 → 예시 표를 `prompt.EXAMPLES_BY_BRANCH` 한곳에: 경험·후기 없음 · 특성 설명 · 용어 ① ② ③ · 스펙 · 비교 · 추천 ① ② ④ ⑤ ⑥. `generate(…, branch=)` 가 표에서 고른다. 말투 규칙(TONE · HEALTH)은 모든 갈래에 그대로. 용어 갈래는 LLM 을 부르지 않아(사전 원문) 표의 줄이 쓰이는 자리가 없다. 시스템 길이: 경험·후기 924자 · 특성 설명 1,416자 · 스펙 · 비교 · 추천 2,199자(여섯 모두 2,382자) [code:chatbot/prompt.py:155-182] [code:chatbot/branches/common.py:67] [code:chatbot/branches/common.py:83] |
| 3. 묶음 머리 옮기기 | 고치지 않았다 — 결과는 아래 |

평가(9차, 2026-11-13 — 고친 뒤 두 번. 답 전문을 읽어 확인)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0. 평균 2.7초, 경험·후기 3.8초(최대 9.8초 — E11 여러 켤레). (2026-11-13 기준) [c:c80ef57]
- 노바블라스트 6 아쉽다 칸 — 네 번(E06 · E15 × 두 번) 모두 추천 2 · 6 · 8 · **24**위(8차는 2 · 6 · 8 · 10위). 좋다 칸 3 · 4 · 11위. 클리프톤 10 은 아쉽다 후보가 4건뿐이라 그대로(2 · 3 · 6 · 7위). (2026-11-13 기준) [c:c80ef57]

| 이야기 | E06 1 | E06 2 | E15 1 | E15 2 |
|---|---|---|---|---|
| 2시간 롱런엔 모자라(6위) | 근거 ○ · 답 ○ | ○ · ○("살짝 부족하다") | ○ · ○ | ○ · ○ (2026-11-13 기준) [c:c80ef57] |
| 5세대보다 탱탱(8위) | ○ · ✕ | ○ · ○ | ○ · ○ | ○ · ○ (2026-11-13 기준) [c:c80ef57] |
| 기본 모델은 새끼발가락이 쓸린다(24위) | **○ · ○** | ○ · ✕ | ○ · ✕ | ○ · ✕ (2026-11-13 기준) [c:c80ef57] |
| 템포로 올리면 힘이 샌다(26 · 30위) | ✕ · ✕ | ✕ · ✕ | ✕ · ✕ | ✕ · ✕ (2026-11-13 기준) [c:c80ef57] |

  쓸림은 근거에 늘 들어왔지만 답에는 한 번 — LLM 은 아쉽다 칸 넷 가운데 둘을 골라 한두 문장으로 쓴다. 템포 두 건(26 · 30위)은 이야기가 쿠션 · 발볼 · 무게로, 앞에서 이미 넣은 리뷰와 겹쳐 남은 자리까지 닿지 않는다. 롱런 · 탱탱은 밀리지 않았다. E07 — 덮개 두 번 답 ○, 튀는 맛 1회 답 ○ · 2회 ✕(근거는 둘 다 ○). (2026-11-13 기준) [c:c80ef57]
- 관점 없는 질문 문장 수(8차 → 9차, 두 번씩): E06 6 · 6 → 4 · 4, E07 3 · 4 → 3 · 3, E15 3 · 3 → 3 · 3. (2026-11-13 기준) [c:c80ef57]
- 예시를 뺀 뒤 말투(8차 전문과 견줌):
  - 경험·후기 — 묶음 머리("좋다는 쪽 리뷰에서는 …")가 관점 없는 질문에서 사라졌다(8차 E06 · E07 네 번 → 9차 0). 여는 말("리뷰를 몇 가지 말씀드릴게요")도 관점 없는 질문에서 0(8차 E06 · E07 세 번). 남은 것: E10 "아식스의 젤 카야노 33을 말씀드릴게요"(두 번), E13 "가이드 19는 통기성에 대해 아쉽다는 쪽 리뷰가 있어요"(두 번 — 관점 있는 질문의 근거 머리), E08 1회 "혹시 더 궁금한 점이 있으신가요."(마침표로 끝난 물음 — 지우는 규칙도 평가 검사도 놓친다). (2026-11-13 기준) [c:c80ef57]
  - 특성 설명 — B05 가 두 번 모두 LLM 답(8차는 두 번 모두 코드 답 — 예시 ⑤의 41.5mm). B09 의 "이런 특성을 고려해서 신발을 찾아보시면 좋을 것 같아요"(빈 문장)가 빠졌다. B03 은 같다. (2026-11-13 기준) [c:c80ef57]
  - 추천(③이 빠짐 — 통증 + 추천) — R04 는 8차와 문장까지 거의 같다. B03 · B09 는 특성 설명 길로 가서 위와 같다. B03 2회 코드 답 1(목록 이야기 — 7차 두 번 평가에도 한 번씩, 8차는 0). (2026-11-13 기준) [c:c80ef57]
  - 스펙 · 비교 — 새 경고 둘: S01 "발볼이 넓은 편이라 넓은 폭 버전도 나온답니다"(두 번 — 해요체 아님 경고, 무게만 물었는데 덧붙임), C09 노바블라스트 6 에 브랜드를 다시 붙이지 않음(두 번 — 같은 브랜드 둘째 신발이라 틀린 것은 아니다). 8차엔 S05 "살 수 있답니다" 한 번이었다. (2026-11-13 기준) [c:c80ef57]
- 코드가 지운 것(두 번 합, 모든 갈래): 묻는 문장 11(8차 32) · 발매가 문장 3 · 의료 문장 1 · 사전 용어 → 쉬운 말 1 · 근거에 없는 숫자 문장 0. LLM 글 통째로 뺌 — 경험·후기 0 · 0. 쪽 가르기 실패 0. (2026-11-13 기준) [c:c80ef57]

#### 운영 뒤 수정(2026-11-13 — main 6bb9b1f 운영 반영 뒤, 사용자 승인)

5-2 는 main `6bb9b1f` 로 합쳐 운영에 올랐다(Jenkins #125, 이미지 `6bb9b1ff4e8d`, 두 Pod 색인 3,438 · 10.7초 — 관리자 확인). 그 뒤 고친 것: [c:6bb9b1f] (2026-11-13 기준) [c:92a8b41] <!-- 확인 못 함: Jenkins 빌드 번호, 이미지 태그, 운영 Pod 색인은 운영 확인(관리자) -->

| 무엇 | 한 것 |
|---|---|
| 첫 동기화 실패 줄 | 챗봇이 뜨자마자 같은 Pod 백엔드(127.0.0.1:3000)를 읽어, 백엔드(Spring + Flyway 약 25~30초)가 뜨기 전이라 배포마다 Pod 마다 `[search] 동기화 실패: ConnectionError … Connection refused` 한 줄이 남았다(15초 뒤 재시도로 성공). 사용자: "로그에 매번 남으면 나중에 진짜 에러를 못 찾는다." → `search.service.Searcher._loop` 가 **첫 동기화 전에만** 2초마다 3분까지 기다린다(`wait_backend`). 200 이면 "[search] 백엔드 준비 확인 — N초 기다림" 한 줄 뒤 sync. 3분이 넘으면 "기다리지 못했다" 한 줄 뒤 지금 루프 그대로(그때 실패는 실패 줄). 기다리는 동안 확인 실패는 찍지 않는다(`http.status` — 예외 · 로그 없이 None). 첫 동기화 뒤(10분 갱신)의 실패는 지금처럼 실패 줄. 기다리는 동안 경험·후기는 "잠시 뒤". 인프라 매니페스트는 고치지 않았다 [code:chatbot/search/service.py:26-32] [code:chatbot/search/service.py:63-84] [code:chatbot/http.py:40-45] (2026-11-13 기준) [c:92a8b41] |
| 경험·후기에서 설명문을 뺐다 | 사용자: "'베이퍼플라이 4 밑창 금방 닳아요?'에 갑피, 통기성, 텅 이야기까지 붙는다. 리뷰로 답이 되는데 설명문을 덧붙일 이유가 없다. 설명문은 상세 페이지에 이미 있다." → 5차부터 코드가 LLM 글 뒤에 붙이던 "신발 설명을 보면 …"을 한 켤레 · 여러 켤레 · 통증 지목 모두에서 뺐다. **특성 설명 갈래의 설명문 검색은 그대로** [code:chatbot/branches/experience.py:43-44] [code:chatbot/branches/experience.py:467-470] [code:chatbot/branches/explain.py:68-77] |
| 남긴 것 | 해요체 일반 규칙(`reply.haeyo` — 경험·후기 LLM 글 `tidy`, 특성 설명의 사전 · 설명문 근거 · 코드 답 · 생성 글), 쉬운 말 변환(`reply.plain_words` — 생성 검사 `guard` 와 특성 설명) [code:chatbot/reply.py:286-300] [code:chatbot/branches/experience.py:618] [code:chatbot/branches/explain.py:91] [code:chatbot/reply.py:193] [code:chatbot/reply.py:229-235] |

평가(운영 뒤, 2026-11-13 — 고친 뒤 두 번)

- **76/76 · 76/76**. 수치 불일치 0 · 전문의 누락 0. 평균 2.7~2.8초, 경험·후기 3.8~3.9초(최대 9.8초). 단위 시험 61(백엔드 기다림 셋 더함). (2026-11-13 기준) [c:92a8b41]
- "신발 설명을 보면"이 든 경험·후기 답 — 9차 두 번 모두 5문항(E02 · E04 · E05 · E11 · E13) → 0 · 0. 답 전문에서 그 문구를 찾아 셌다(코드가 붙이지 않으므로 지운 것이 아니다). (2026-11-13 기준) [c:92a8b41]
- 경험·후기 LLM 글 문장 수(9차 → 운영 뒤, 두 번씩) — E02 3 · 3 → 2 · 3, E05 3 · 3 → 2 · 2, E06 4 · 4 → 4 · 6, E15 3 · 3 → 2 · 3, 나머지는 같거나 1 차이. 리뷰 이야기는 그대로이고 설명문 단락만 빠졌다(E04 · E05 를 9차와 줄마다 견줌). (2026-11-13 기준) [c:92a8b41]
- 코드가 지운 것(두 번 합, 모든 갈래): 묻는 문장 14 · 발매가 문장 3 · 사전 용어 → 쉬운 말 3 · 근거에 없는 숫자 문장 2(E10 1회). LLM 글 통째로 뺌 — 경험·후기 0 · 0. 코드 답: R07 1회(순위 빠짐) · B03 두 번(금칙어 "전문가" · 사실에 없는 숫자 "3") — 추천 갈래, 이번 수정과 상관없는 LLM 흔들림(코드가 바뀌지 않은 갈래). (2026-11-13 기준) [c:92a8b41]

0건 답 — 제안만(사용자가 정한다, 보고에) → (나)로 정했다(아래 「운영 뒤 수정 2」)

- 리뷰가 0건인 신발은 없다(310켤레 모두 1건 이상 — 1~2건 98 · 3건 이상 212, 운영 공개 API 2026-11-13). [c:92a8b41]
- 관점을 물었는데 그 이야기가 0건인 신발(관점 낱말이 든 리뷰가 없는 신발 — 실제로는 임베딩 후보 · 분류까지 거쳐 조금 다를 수 있다): 무릎 241 · 발볼 161 · 사이즈 247 · 내구성 236 · 발바닥 220 · 종아리 276 · 발목 221 · 뒤꿈치 200 · 발등 191 · 통증 244 · 쿠션 80 · 무게 110 · 통기성 247 · 접지 194 · 반발 224 · 안정감 155 · 착용감 141(/310). (2026-11-13 기준) [c:92a8b41]
- 길 셋 — (가) 지금 그대로 · (나) 스펙으로 답할 수 있는 관점만 코드가 스펙 한 줄 · (다) 리뷰 전체 좋다 · 아쉽다로 이어 주기. 권하는 것은 (나)(관리자 보고에 장단점).

#### 운영 뒤 수정 2 — 0건일 때 스펙 한 줄(2026-11-13, 사용자 승인 (나) — "0건이 310켤레 중 240켤레쯤이라는 숫자를 보고 정했다. 그대로 두면 답이 자주 빈다")

| 무엇 | 한 것 |
|---|---|
| 대상 | 관점이 쿠션 · 무게 · 발볼 · 안정감이고, 그 신발 리뷰에 그 이야기가 0건일 때(한 켤레 · 여러 켤레 지목 모두). 0건 문장 바로 뒤, 같은 단락에 코드가 붙인다(`experience.spec_line`). LLM 을 부르지 않는다. 나머지 관점은 0건 문장만 [code:chatbot/branches/experience.py:488] [code:chatbot/branches/experience.py:400-404] [code:chatbot/branches/experience.py:503-536] |
| 쓰는 사실 | 쿠션 → 쿠션 높이(mm) + 위치 말 · 무게 → 무게(기준 사이즈) + 270mm 환산(기준이 270 이 아닐 때) + 위치 말 · 발볼 → 발볼 칸(넓은 편 · 보통 · 좁은 편) + 넓은 폭(2E·4E) 버전(국내 · 해외만 · 없음) · 안정감 → 안정성 칸(중립화 · 안정화, 풀이와 함께). 숫자 · 풀이는 스펙 갈래와 같은 `facts`(`weight_phrase` · `weight_converted` · `WIDTH_PLAIN` · `WIDE_SCOPE` · `STABILITY_PLAIN`), 위치 말("높은 편" · "중간" · "가벼운 편")은 비교하기와 같은 `GET /api/compare?ids=<그 신발>`(못 읽으면 말 없이). 값이 비면 그 줄을 붙이지 않는다(발볼 칸만 비면 "발볼은 등록된 스펙에 없지만, 넓은 폭(2E·4E) 버전은 …") [code:chatbot/branches/experience.py:503-536] [code:chatbot/branches/experience.py:492-500] [code:chatbot/branches/experience.py:23-24] [code:chatbot/facts.py:22-24] [code:chatbot/facts.py:78] [code:chatbot/facts.py:93] |
| 문장 꼴(Claude) | 0건 문장("이 신발 리뷰 N건 가운데 그 부분을 말한 리뷰는 없었어요.")이 이미 리뷰에 없다고 말하므로, 사용자 예의 "리뷰에는 그 이야기가 없지만"을 되풀이하지 않고 "등록된 스펙으로는 …"으로 이어 리뷰와 가른다 [code:chatbot/branches/experience.py:187] [code:chatbot/branches/experience.py:489] |
| 평가 | 문항 셋을 더했다(실제 0건 신발 — 운영 공개 API로 골라 챗봇 길로 0건을 확인): E17 페가수스 프리미엄 쿠션(9건) · E18 패트리어트 14 발볼(8건) · E19 알파플라이 3 무게(18건). 0건 문장 · 스펙 한 줄이 있는지 보고, 숫자는 수치 검사가 API 원값(무게 · 쿠션 높이 · 환산)으로 본다. 모두 79문항 [code:chatbot/eval/golden-experience.jsonl:17-19] (2026-11-13 기준) [c:92a8b41] |

실제 답(운영 뒤 수정 2 평가 1회차)

> 이 신발 리뷰 9건 가운데 그 부분을 말한 리뷰는 없었어요. 등록된 스펙으로는 쿠션 높이가 45mm로 높은 편이에요. (2026-11-13 기준) [c:92a8b41]
> 보러 가실래요?(E17)
>
> 이 신발 리뷰 8건 가운데 그 부분을 말한 리뷰는 없었어요. 등록된 스펙으로는 발볼이 보통으로 나와 있고, 넓은 폭(2E·4E) 버전은 따로 없어요.(E18) (2026-11-13 기준) [c:92a8b41]
>
> 이 신발 리뷰 18건 가운데 그 부분을 말한 리뷰는 없었어요. 등록된 스펙으로는 무게가 218g(270mm 기준)으로 가벼운 편이에요.(E19) (2026-11-13 기준) [c:92a8b41]

평가(운영 뒤 수정 2 — 두 번)

- **79/79 · 79/79**. 수치 불일치 0(E17 ~ E19 의 45mm · 218g 도 API 값으로 통과) · 전문의 누락 0. 평균 2.7초. 단위 시험 62(스펙 한 줄 하나 더함). (2026-11-13 기준) [c:92a8b41]
- 스펙 한 줄이 든 경험·후기 답 — 두 번 모두 E17 · E18 · E19 셋뿐(답 전문에서 "등록된 스펙으로는 · 등록된 스펙에 없지만"으로 찾아 셈). E09(내구성 0건)는 그대로 0건 문장만. (2026-11-13 기준) [c:92a8b41]
- 나머지 경험·후기 답(운영 뒤 수정 두 번과 견줌): 코드가 바뀌지 않은 길이라 문장 수가 같거나 1 ~ 2 차이(E11 가운데 신발 5 → 7, E06 4 · 6 → 3 · 4 — LLM 흔들림). 나빠진 곳은 못 찾았다. (2026-11-13 기준) [c:92a8b41]
- 코드가 지운 것(두 번 합): 묻는 문장 13 · 발매가 문장 5 · 근거에 없는 숫자 문장 5 · 양 짐작 1 · 쉬운 말 1. LLM 글 통째로 뺌 — 경험·후기 0 · 0. 코드 답 B03 1회(추천 · 사실에 없는 숫자 — 코드가 바뀌지 않은 갈래). (2026-11-13 기준) [c:92a8b41]

#### 운영 뒤 수정 3 — 근거 리뷰도 관점 문장으로 자른다(2026-11-13, 사용자 지시 · 로컬)

「베이퍼플라이 4 밑창 금방 닳아요?」에 「짧은 대회에선 정말 빠르다고 언급하면서도…」가 섞였다. 인용 블록은 3차 수정부터 관점 문장 중심으로 잘랐지만, LLM 에 주는 근거 리뷰는 통째였다(운영 리뷰 「짧은 대회에선 정말 빨라요. 밑창 닳는 속도만 좀 아쉬워요.」).

| 무엇 | 한 것 |
|---|---|
| 자르기 한 곳 | 3차 수정의 자르기를 `experience.aspect_lines` 로 떼어 인용 블록(`quote_block`, 줄마다 `> `)과 근거 줄(`evidence_line`, 한 줄 `- `)이 함께 쓴다. 규칙(관점 문장 둘까지, 20자보다 짧거나 다음 문장이 8자보다 짧으면 다음 문장, 이음말이면 앞 문장, 160자 상한, 관점 문장이 없으면 앞 두 문장)은 그대로 [code:chatbot/branches/experience.py:279-320] |
| 쓰는 낱말 | 인용과 같다 — 통증은 질문의 낱말(focus), 그 밖에는 관점 낱말 묶음. 낱말 목록은 넓히지 않았다 [code:chatbot/branches/experience.py:263] [code:chatbot/branches/experience.py:583] |
| 관점 없는 질문 | 근거는 지금처럼 통째(E06 · E07 · E15 의 `evidence` 길은 코드가 바뀌지 않았다) [code:chatbot/branches/experience.py:591-605] |
| 통증 focus 와 겹침 | 통증은 focus 낱말이 든 리뷰만 근거에 남기므로(3차 수정 3) 자를 때 늘 관점 문장이 있다. 다른 관점은 임베딩으로만 후보가 된 리뷰(낱말 없음)가 있을 수 있어, 그때는 인용처럼 앞 두 문장이 간다 [code:chatbot/branches/experience.py:384] [code:chatbot/branches/experience.py:586-587] [code:chatbot/branches/experience.py:665-680] [code:chatbot/branches/experience.py:306] |
| 남는 것 | 관점 낱말이 든 문장 안의 다른 이야기는 남는다(E02 「와이드로 주문했을 때 템포를 낼 때는 무겁다」). 숫자 출처(`digit_source`)는 자른 근거 + 인용이라 잘린 문장의 숫자는 더는 허용되지 않는다 [code:chatbot/branches/experience.py:428] |

평가(운영 뒤 수정 3 — 한 번): **87/87**, 수치 불일치 0 · 전문의 누락 0, 단위 시험 64(근거 자르기 하나 더함). E04 근거는 넷 모두 내구성 문장만 남았고 답에 속도 이야기가 없다. (2026-11-13 기준) [c:7f1eeaf]

#### 운영 뒤 수정 4 — 관점 없는 질문은 요약 블록으로(2026-11-13, 사용자 지시 · 로컬)

「노바블라스트 6 후기 어때요?」의 LLM 글이 「반면에」 뒤에 좋은 이야기를 쓰고, 꺾을 것 없는 「다만」을 붙였다. 8차의 쪽 가르기(`split_sides`)가 좋은 말과 아쉬운 말이 섞인 리뷰를 아쉽다는 쪽에 통째로 넣었기 때문이다. 관점 없는 질문은 LLM 을 부르지 않고, 상세 화면(`src/components/ReviewSummary.tsx`)의 리뷰 요약을 인용 블록으로 그대로 놓는다. [code:src/components/ReviewSummary.tsx] [code:chatbot/branches/experience.py:406-415]

```
아식스의 노바블라스트 6에는 리뷰가 38건 있어요.
'도움이 돼요'를 가장 많이 받은 리뷰를 가져왔어요.

> (추천 많은 리뷰 — 인용 고르는 법은 그대로)

전체적인 평가는 다음과 같아요.

> 좋았던 점
> (요약 positive 원문)

> 아쉬운 점
> (요약 negative 원문)

보러 가실래요?
```

| 무엇 | 한 것 |
|---|---|
| 요약 | `GET /api/shoes/{id}/summary`(`experience.review_summary`) 원문 그대로 — 말투 바꾸기(`haeyo`) · 금칙어 · 숫자 검사를 걸지 않는다(사이트에 같은 글이 나간다, 요약 품질은 요약 배치 쪽 일). 오래된 요약도 그대로. 꼬리표는 `ReviewSummary.tsx` 의 글자, 「Ollama AI가 리뷰를 요약했어요!」 · 「리뷰 N건 기준」은 뺐다 [code:chatbot/branches/experience.py:234-251] [code:chatbot/branches/experience.py:231] [code:src/components/ReviewSummary.tsx:36-44] |
| 요약이 없을 때 | 머리 문장과 블록을 통째로 뺀다, 안내 문구 없음(리뷰 3건 미만 98켤레 · 아직 안 만듦). 아쉬운 점이 비면(4켤레) 좋았던 점 줄만. 읽기 실패면 블록을 빼고 로그 한 줄 [code:chatbot/branches/experience.py:239-243] [code:chatbot/branches/experience.py:250] [code:chatbot/branches/experience.py:411-412] (2026-11-14 기준) [c:7f1eeaf] |
| 집계 · 소개 | 관점 없을 때만 「리뷰 N건 중 추천이 많은 30건을 봤어요」를 빼고, 소개를 「'도움이 돼요'를 가장 많이 받은 리뷰를 가져왔어요.」로(집계 줄 다음 줄, 버튼 이름에 따옴표 — 2026-11-14). 이 문장은 「도움이 돼」가 들어 효과 약속 검사(`reply.help_claims`)의 「주어를 가리기 어려움」에 걸렸다 — 상수 `prompt.INTRO_HELPFUL` 과 똑같은 문장만 건너뛴다(정규식은 그대로). 인용한 리뷰의 도움 수가 0이면 소개를 빼고 집계 줄만. 처음 문구 「많은 분들이 도움이 됐다고 한 …」는 310켤레 중 94켤레(인용 리뷰의 도움 수 0: 46 · 1: 48)에서 사실과 어긋나 바꿨다. 관점 없는 질문의 인용은 상한 30건이 아니라 그 신발 리뷰 전부에서 도움 수 첫째라 「가장 많이」가 늘 맞는다(같은 수면 최근 리뷰). 관점 있는 질문은 그대로 [code:chatbot/branches/experience.py:398] [code:chatbot/prompt.py:24] [code:chatbot/reply.py:50-58] [code:chatbot/branches/experience.py:409-410] [code:chatbot/branches/experience.py:258] [code:chatbot/branches/experience.py:172-174] [c:7f1eeaf] |
| 화면 | 말풍선이 `white-space: pre-line` 이라 `> ` 줄마다 줄이 바뀐다. 꼬리표는 따로 한 줄, 다음 줄부터 본문, 굵게 없음(사용자 2026-11-14). 처음에는 같은 줄에 줄바꿈 없는 빈칸 둘로 띄웠는데 본문이 줄을 넘기면 갈림이 약했다. 좋았던 점과 아쉬운 점은 빈 줄로 띄운 인용 블록 둘 — 한 블록에 두면 두 묶음이 한 덩어리로 보였다(블록 안 빈 인용 줄은 쓰지 않는다). markdown-to-jsx 9.10.4 와 `ChatBot.css` 로 그려 두 블록 사이가 벌어지는 것을 확인했다 [code:src/components/ChatBot.css:81] [code:src/components/ChatBot.css:90] [code:chatbot/branches/experience.py:246-251] |
| LLM | 관점 없는 질문에서 두 번(쪽 가르기 · 글) → 0 [code:chatbot/branches/experience.py:406-415] |
| 남겨 둔 것 | 쪽 가르기 코드는 지우지 않았다 — 부르는 곳만 없다: `SIDE_GOOD` · `SIDE_BAD` · `TASK_SIDES` · `SIDES_SYSTEM` · `classify_sides_llm` · `split_sides` · `diverse` · `evidence` 의 관점 없는 갈래 · `answer` 의 `classify_sides` 인자와 `t.sides = split_sides(...)` 줄 · `INTRO_ALL`(quote 가 아직 만들지만 쓰지 않는다), `prompt.py` 덤프의 `TASK_SIDES` · `SIDES_SYSTEM` 두 줄, 단위 시험 `test_sides` · `test_diverse` [code:chatbot/branches/experience.py:32-33] [code:chatbot/branches/experience.py:78-82] [code:chatbot/branches/experience.py:113-120] [code:chatbot/branches/experience.py:730-768] [code:chatbot/branches/experience.py:554-572] [code:chatbot/branches/experience.py:591-605] [code:chatbot/branches/experience.py:338] [code:chatbot/branches/experience.py:424-425] [code:chatbot/branches/experience.py:220] [code:chatbot/prompt.py:201-202] [code:chatbot/tests/test_search.py:305] [code:chatbot/tests/test_search.py:334] |
| 평가 | `eval/run.py check_summary_block` — 신발마다 요약 API 를 따로 읽어 블록이 원문 그대로인지 · 없으면 블록이 없는지 보고, 요약 줄은 금칙어 · 숫자 · 말투 검사에서 뺀다. 여러 켤레 검사는 「브랜드의 모델에는」으로 시작하는 문단도 신발 블록 머리로 본다. 문항 E20(알파플라이 4, 리뷰 2건 — 요약 없음)을 더해 88문항 [code:chatbot/eval/run.py:410-450] [code:chatbot/eval/run.py:507-508] [code:chatbot/eval/golden-experience.jsonl:20] (2026-11-14 기준) [c:7f1eeaf] |

평가(운영 뒤 수정 4 — 두 번): **88/88 · 88/88**, 수치 불일치 0 · 전문의 누락 0, 단위 시험 65. 관점 없는 문항 시간(1단계 → 두 번) E06 4.8 → 1.9 · 2.3초, E07 3.0 → 2.2 · 1.6초, E15 5.4 → 3.7 · 4.0초(앞 턴 스펙 질문 포함). 관점 있는 E 문항은 집계 줄 · 인용이 1단계와 같다. (2026-11-14 기준) [c:7f1eeaf]

#### 운영 뒤 수정 5 — 이름 없이 이어 묻는 질문은 직전 신발로(2026-11-14, 사용자 지시 · 로컬)

「알파플라이 3 무게는 얼마예요?」 다음 「후기는 어때요?」는 가리키는 말("그거")이 없어 직전 신발을 쓰지 않고 엉뚱한 신발 셋을 찾았다.

| 무엇 | 한 것 |
|---|---|
| 판단 | 라우터 JSON 에 `same_shoe_as_before` 칸 하나(`Route.unnamed`). 같은 라우터 호출에서 받는다 — LLM 호출은 늘지 않는다. 라우터는 대화 기록 최근 4줄(줄마다 200자)을 보고, 규칙이 갈래를 정해도(by_rule) 라우터 LLM 은 부르므로 늘 받는다. `true` 만 참, 실패하면 거짓 [code:chatbot/router.py:48] [code:chatbot/router.py:88-91] [code:chatbot/router.py:131] [code:chatbot/router.py:166-175] [code:chatbot/router.py:189] |
| 직전 신발 | 가리키는 말 목록(넓히지 않음)이 있거나 이 칸이 참이면 쓴다 — 둘 다 둔다(사용자 결정). 이름이 잡힌 질문은 그 이름을 쓴다 [code:chatbot/bot.py:167-169] |
| 직전 신발이 없을 때 | 경험·후기에서 이 칸이 참인데 신발이 없으면 `ASK_SHOE`로 되묻는다 [code:chatbot/bot.py:273-277] [code:chatbot/prompt.py:21] |
| 설명 | 예시 문장을 두지 않는다. 「쿠션 좋으면 무릎 나을까요?」 같은 예시를 두었을 때 E01 「노바블라스트 6 신으면 무릎 괜찮아요?」의 갈래가 experience 에서 explain 으로 바뀌었다(4번 모두). 예시를 빼니 4번 모두 돌아왔다. 처음 칸 이름 `about_unnamed_shoe` 는 이전 대화에 신발이 있으면 거의 모든 문장에 참을 냈다 [code:chatbot/router.py:124-130] (2026-11-14 기준) [c:7f1eeaf] |

평가(88문항 한 번): **88/88**, 갈래가 직전 평가와 다른 문항은 B06 하나(explain → experience, 통과). 다섯 대화(알파플라이 3 후기 · 노바블라스트 6 발볼 · 무릎 편한 신발 여러 켤레 · 쿠션 무릎 특성 설명 · 기록 없이 후기 → 되묻기) 모두 기대대로. 이 다섯을 평가 문항 E21~E25 로 넣어 93문항이 됐다(`setup` 에 앞 턴). E25 의 되묻기(`ASK_SHOE`, 두 문장)는 용도 묻기처럼 묻는 말 하나로 센다. 93문항 한 번 **93/93**. [code:chatbot/eval/golden-experience.jsonl:21-25] [code:chatbot/eval/run.py:88] [code:chatbot/eval/run.py:244-246] (2026-11-14 기준) [c:7f1eeaf]

#### 운영 뒤 수정 6 — 추천 조건 여러 벌(2026-11-14, 사용자 지시 · 로컬)

「조깅용 하나, 레이스용 하나」에 레이스화만 셋을 내고 조깅용을 버렸다. 조건을 한 벌만 받았기 때문이다.

| 무엇 | 한 것 |
|---|---|
| 판단 | 라우터 JSON 에 `more_conditions`(둘째 벌부터, `conditions` 와 같은 꼴). 같은 라우터 호출이라 LLM 호출은 늘지 않는다. 설명에 예시 문장은 두지 않았다(수정 5 의 E01). 한 벌이면 `[]` — `conditions` 는 그대로 [code:chatbot/router.py:60] [code:chatbot/router.py:107-109] [code:chatbot/router.py:134] [code:chatbot/router.py:190] |
| 거르기 | `router.more_sets` — 용도가 있고 첫째 벌 · 앞 벌과 다른 것만. 첫째 벌에 용도가 없으면 둘째 벌도 쓰지 않는다(용도를 먼저 되묻는다). 빈 칸은 발볼 · 발 유형 · 예산(`SHARED_KEYS`)만 첫째 벌에서 물려받는다 — 쿠션은 신발마다 다르다 [code:chatbot/router.py:141] [code:chatbot/router.py:203-219] |
| 상한 | 두 벌(`MAX_SETS`), 벌마다 두 켤레(`recommend.PER_SET`) — 사용자 결정. 셋씩이면 두 벌에 여섯 켤레라 「보러 가기」(비교하기 다섯 켤레까지)에서 하나가 빠진다. 물려받는 칸(발볼 · 발 유형 · 예산)도 사용자 결정 [code:chatbot/router.py:137-138] [code:chatbot/branches/recommend.py:109-110] [code:chatbot/reply.py:39] |
| 겹침 | 앞 벌에만 두고, 뒤 벌에서는 빼고 API 의 다음 순위로 말없이 채운다(사용자 결정). 처음에는 「…용에서 이미 골라서 뺐어요」 한 줄을 붙였는데, 두 쓰임에 다 맞는 신발이 좋지 않은 일처럼 읽혀 뺐다. 운영 데이터에서 겹침은 같은 용도에 쿠션만 다른 조합에서만 나온다(용도가 다른 기본 조건 160쌍에서 0). 예: 「대회용 신발 하나랑 쿠션 많은 대회용 신발 하나」 — 쿠션 많은 쪽 1위 알파플라이 3이 앞 벌에 있어 로켓 X 3 · 베이퍼플라이 3으로 채웠다 [code:chatbot/branches/recommend.py:113-121] [code:chatbot/branches/recommend.py:156-158] (2026-11-14 기준) [c:7f1eeaf] |
| 평가 | R16 「조깅용 하나, 레이스용 하나 추천해 주세요」(`sets`) — 두 벌의 용도, 그리고 조건마다 API 를 다시 불러 앞 벌 신발을 뺀 상위 두 켤레씩과 답의 신발이 같은지 본다. 94문항 [code:chatbot/eval/golden.jsonl:46] [code:chatbot/eval/run.py:171-188] <!-- 헷갈림: 94문항은 그때 평가의 문항 수(기록)라 남김. 지금 세 파일을 세면 86문항이다 --> |
| 답 | `recommend.answer_many` — 벌마다 `/api/recommend` 한 번, 용도마다 「OO용으로는 이렇게 골랐어요.」 문단. LLM 글은 한 번(`TASK_MANY`). 고른 신발 이름이 빠지면 코드 답. 한 벌짜리는 `answer` 그대로(공통 부분만 `_one_set` 으로 뺐다) [code:chatbot/branches/recommend.py:81-82] [code:chatbot/branches/recommend.py:104-152] [code:chatbot/branches/recommend.py:156] |

확인: 라우터 30번(여러 벌 4문장 × 3, 한 벌 6문장 × 3) 모두 맞음. 93문항 두 번 **93/93 · 93/93**, R 계열 15문항은 버튼 신발 · 조건 · 순위 문장이 직전 평가와 같고 여러 벌 경로를 탄 문항은 0. (2026-11-14 기준) [c:7f1eeaf]

