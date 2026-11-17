<!--
다루는 곳: chatbot/, catalog/, contract/, backend/src/main/resources/db/migration/, Jenkinsfile, config/portfolio.toml
읽은 커밋: 606b730
-->
# TODO(남은 일)

> 한 줄에 하나. 무엇이 남았는지만 적는다. 무엇이 문제고 왜 그런지, 어떻게 고칠지는 → 가리키는 문서에 있다. 끝나면 이 줄을 지우고, 한 일은 그 문서(3절)와 `HISTORY.md` 에 남긴다. 남은 일을 다른 문서에 따로 적지 않는다(2026-11-10 사용자, 두 군데에 적으면 한쪽만 지우게 된다).

#### 챗봇 RAG(단계는 `09_chatbot_rag.md` 3-1절)
- [ ] **안전, 먼저 할 것**: 통증 질문의 의료 안내에 키워드 보조 그물이 없다. 라우터 LLM 이 `health_context` 를 false 로 잘못 주면 안내가 나가지 않는다. 부르기에 실패할 때만 true 로 두는 지금 방식으로는 모자라다(2026-11-17 사용자) [code:chatbot/router.py:174-181] → `09_chatbot_rag.md` 1-8절
- [ ] **결정을 어긴 코드, 다음 코드 일에서 먼저 볼 것**: `catalog/fill.mjs` 가 사이즈 표기 없는 공식몰 무게를 맨 뒤 묶음에 둔다. 11-06과 11-09 결정은 M9 로 보고 맨 앞 묶음에 두는 것이다. 운영에서 7켤레가 공식몰 값 대신 BITR 값으로 나가고, 그 가운데 148과 163은 `resolve_official` 사람 판단까지 무시된다(`HUMAN` 목록에 없다)(2026-11-17 사용자) [code:catalog/fill.mjs:36] [code:catalog/fill.mjs:48] [code:catalog/fill.mjs:74-76] → `01a_catalog_sources.md` 1-3
- [ ] 09편을 가리키는 코드 주석 42곳을 새 절 번호로 고치고, 09편 맨 아래 짝 표를 지운다. 표는 주석이 옛 번호를 가리키는 동안만 쓰는 임시 다리다. 런슈즈 문서 일이 끝난 뒤 코드 커밋으로 따로 한다(2026-11-17 사용자) → `09_chatbot_rag.md` 맨 아래 「절 번호 짝」

- [ ] model-service 재부팅 순서 확인(다음 재부팅 때) → `~/AI_programming/model-service/docs/runbook-cutover.md` 8절
- [ ] 5-1 남은 한계 셋. 5-2 뒤 다시 보고, 남아 있으면 고친다 → `09_chatbot_rag.md` 4-1절
- [ ] 5-2 경험과 후기 25문항. 사용자가 초안(`chatbot/eval/golden-experience.jsonl`)을 본다 → `archive/09_chatbot_rag_log.md` 옛 16절 [code:chatbot/eval/] [docs:09_chatbot_rag.md]
- [ ] 5-2 남은 한계. 운영에 올린 뒤 실제 질문을 보고 다시 정한다(항목마다 무엇을 볼지 적어 둠) → `09_chatbot_rag.md` 4-2절 「5-2 남은 한계」
- [ ] 사전에 없는 용어("갑피가 뭐예요")를 설명문 검색으로 답하기. 지금은 5-1 처럼 거절과 기록 → `09_chatbot_rag.md` 1-9절, `archive/09_chatbot_rag_log.md` 옛 16절 [code:backend/src/main/resources/db/migration/V18__chatbot_misses.sql:3] [docs:09_chatbot_rag.md]
- [ ] 5-1 운영 반영 뒤 멀쩡한 것을 보고 태그 `archive/main-before-reword-20261112`, 백업 참조를 지울지 정하기 → `HISTORY.md` 11-12
- [ ] 챗봇 로그인(연결 뒤 첫 프레임 auth, 로컬 구현 끝, 백엔드와 인프라 변경 없음) push 뒤 운영 확인. 로그인 전 버튼 → 안내, 체험 카드로 로그인 → 인사와 답, 로그아웃 → 연결 닫힘, 배포 직후 챗봇 로그의 "인증 실패 — me None" 수 → `09_chatbot_rag.md` 1-13절 [code:chatbot/server.py:3-7] [code:chatbot/server.py:48] [code:chatbot/server.py:76] [docs:09_chatbot_rag.md]
- [ ] 생성 검사가 숫자만 본다. 위치 말(가벼운 편 등)이나 비교 결론을 예시에서 옮겨 와도 못 잡고, 지금은 평가로만 본다 [code:chatbot/reply.py:200-204] → `09_chatbot_rag.md` 1-10절
- [ ] 설명문을 옮기면 사전 용어가 섞인다("미드솔" 등). 스택하이트, 드롭, 미드솔 셋 밖의 쉬운 말 규칙(와이드 모델 등)은 프롬프트로만 지킨다 [code:chatbot/reply.py:193-196] [code:chatbot/prompt.py:52] → `09_chatbot_rag.md` 1-10절
- [ ] 기록과 코드가 어긋남, 어느 쪽이 맞는지 확인: 구현 기록(`archive/09_chatbot_rag_log.md` 운영 뒤 수정 4)은 `split_sides` 를 부르는 곳만 없다고 적는데 `chatbot/branches/experience.py:425` 가 아직 부른다. 코드는 고치지 않는다(2026-11-17 사용자) [code:chatbot/branches/experience.py:425] → `09_chatbot_rag.md`
- [ ] 용어 사전 보강 21개 → `09_chatbot_rag.md` 1-9절
- [ ] 용어 사전에 통증 항목 보강(병명 → 신발 다리, 출처 필요, 전문의 안내를 답 앞으로 뺄지 검토). 그때 통증 질문의 신발 이름과 버튼을 다시 본다 → `09_chatbot_rag.md` 1-9절, `archive/09_chatbot_rag_log.md` 옛 16절
- [ ] 발 유형(과내전, 평발, 발볼)과 증상(아프다, 시큰하다)을 나눠 전문의 안내를 붙일지 정한다. 지금은 모두 붙인다(임시, 사전 보강 때 기준을 세운다) → `09_chatbot_rag.md` 1-8절 [code:chatbot/reply.py:303-305] [docs:09_chatbot_rag.md]
- [ ] 리랭커 판단, 보류. 76문항 통과, Hit@5 3/3이라 검색이 못 찾는 문제가 없다. 리뷰가 늘어 검색이 흐려지거나 Hit@5가 떨어지면 그때 켠다 → `09_chatbot_rag.md` 1-3절 [code:chatbot/search/index.py:52] [docs:09_chatbot_rag.md] (2026-11-13 기준) [c:6d8d364]
- [ ] 챗봇 인용 블록이 리뷰 원문을 그대로 보여 준다. 실유저 리뷰가 들어오면 욕, 비방도 그대로 인용된다. 리뷰 신고 기능이나 필터를 볼 때 함께 본다 → `09_chatbot_rag.md` 1-7절 [code:chatbot/branches/experience.py:68] [code:chatbot/branches/experience.py:206] [docs:09_chatbot_rag.md]
- [ ] 리뷰가 약 4,600건(두 Pod 동시 임베딩 30초)에 가까워지면 색인 파일 캐시용 저장공간(호스트 NFS RWX) → `archive/09_chatbot_rag_log.md` 옛 16절 「저장공간」 [docs:09_chatbot_rag.md] (2026-11-12 기준) [c:b11e139]
- [ ] 추천수 리랭킹 0.8/0.2 를 비율을 바꿔 돌린 평가로 다시 정한다. 지금은 비율에 따라 갈리는 문항이 Hit@5 셋뿐이다 [code:chatbot/search/index.py:20] → `archive/09_chatbot_rag_log.md` 옛 16절
- [ ] 0건이 가장 흔한 무릎, 사이즈, 통기성(310켤레 중 241, 247, 247)을 용어 사전 보강이나 설명문에서 메운다 [code:chatbot/branches/experience.py:187] → `09_chatbot_rag.md` 4-2절

#### 챗봇, 나중에 재면 좋을 것(지금은 계측하지 않는다. 모니터링은 챗봇 작업 뒤, 2026-11-12 사용자)

- [ ] 검사에 걸려 코드 답을 낸 비율과 까닭(사실에 없는 숫자, 금칙어, 잘림, 신발이 몸에 도움) → `archive/09_chatbot_rag_log.md` 옛 15절
- [ ] 거절과 기록 건수(없는 신발, 없는 용어, 답하지 못한 특성(`chatbot_misses` kind 별), 범위 밖) → `07_database.md` 1-1 [code:backend/src/main/resources/db/migration/V18__chatbot_misses.sql:17] [docs:07_database.md]
- [ ] "보러 가기" 버튼을 누른 비율(1켤레, 비교하기) → `02_screens.md` 1-7
- [ ] 동시 연결 수, 연결당 대화 턴 수, 용도 되묻기 뒤 이어서 답한 비율 → `archive/09_chatbot_rag_log.md` 옛 15절

#### 카탈로그

- [ ] 약관 다시 읽기 전 거르는 도구. 약관 페이지를 받아 `terms_version` 날짜와 `clauses` 인용 문구가 그대로인지 본다 → `01a_catalog_sources.md` 1-2b 「다시 읽는 때」
- [ ] 약관 기록 남은 fetch 16항목(호스트 15곳)을 BITR, RSG 꼴로 몇 번에 나눠 채우기. 목록은 → `01a_catalog_sources.md` 1-2b 「채우는 곳」 [docs:01a_catalog_sources.md] (2026-11-15 기준) [c:e0186b7]
- [ ] 수집기(`local/fetch.mjs`)에 www 바꿔 읽기. `read_via` 가 달린 다른 이름 호스트의 주소를 같은 경로의 www 주소로 바꿔 받는다 → `01a_catalog_sources.md` 1-2b [code:.gitignore:39] <!-- 확인 못 함: catalog/local/ 은 git 밖이라 fetch.mjs 를 저장소에서 볼 수 없다 -->
- [ ] 수집기가 아식스 NetFunnel 대기열 페이지를 정상 페이지로 캐시한다(캡차 낱말이 없어 멈추지 않음). 대기열을 알아보고 멈추게 → `01a_catalog_sources.md` 1-2b 「기록과 지금이 다른 곳」 <!-- 확인 못 함: 수집기는 git 밖 catalog/local/ -->
- [ ] www.asics.co.kr(대기열), www.brooksrunning.co.kr(443 접속 거절)은 기록상 `fetch` 인데 지금 열리지 않는다. 판정을 둘지 사람이 정한다 → `01a_catalog_sources.md` 1-2b 「기록과 지금이 다른 곳」
- [ ] 수집기의 캡차 판정(본문 앞 5000자에 `captcha`)이 위키백과 머리 스크립트의 설정값(`"wgConfirmEditCaptchaNeededForGenericEdit":"hcaptcha"`)에 걸려 위키백과 호스트를 멈춘다. 위키백과를 실제로 읽기 전에 고친다 → `01a_catalog_sources.md` 1-2b <!-- 확인 못 함: 수집기는 git 밖 catalog/local/ -->

- [ ] 와이드 정보 없음 6켤레(2026-11-17 운영 공개 API, 사용자가 MAN 으로), 울트라부스트 5X 의 와이드, 정가, 카본 → `01a_catalog_sources.md` 4절
- [ ] GTX 판을 별도 행으로 → `01a_catalog_sources.md` 3절
- [ ] 정가 빈 칸을 채울 방법(국내 공식몰 아카이브 또는 MAN) → `01a_catalog_sources.md` 4절
- [ ] 정기 확인 작업(월 1회 보고서. 새 세대, 정가 변경, 이미지 링크) → `01a_catalog_sources.md`
- [ ] 여성 행(출처가 모이면) → `01a_catalog_sources.md` 4절
- [ ] 상품명이 세대를 섞는 라인 점검 → `01b_catalog_images.md` 4절
- [ ] 이미지 링크 정기 확인 → `01b_catalog_images.md`
- [ ] 이미지 1장뿐인 57켤레, GOAT 색상 → `01b_catalog_images.md` 4절 [docs:01b_catalog_images.md] (2026-11-10 기준) [c:37e665c]
- [ ] 사진이 없어 적재되지 않은 14켤레, 사용자가 관리 화면에서 → `01b_catalog_images.md` 4절 [docs:01b_catalog_images.md] (2026-11-10 기준) [c:37e665c]
- [ ] 관리 화면에서 새로 넣은 신발을 후보 목록 행으로 바꾸는 도구 → `01c_catalog_loader.md` 4절
- [ ] 문구 규칙과 검사기를 저장소로 옮겨 새 켤레에도 → `01d_catalog_copy.md`
- [ ] 문구 검사기의 운영 값 사본(`live-fresh.json`)을 다시 받는다. 3차 뒤 스펙 칸 정정으로 바뀐 값 4개를 "칸에 없는 숫자"로 잡는다 [c:713022f] [c:5e476d5] → `01d_catalog_copy.md`
- [ ] 적재기 스냅숏을 다른 기계에서도 쓰게 한다. 지금은 로컬 파일 하나라 다른 기계에서 적재하면 `--snapshot` 으로 먼저 적어야 한다 [code:catalog/live-fields.mjs:14] [code:catalog/load.mjs:186] → `01c_catalog_loader.md` 1-3
- [ ] 적재기 `--revert` 가 리뷰, 찜이 붙은 뒤에도 깔끔하게 되돌리게 한다 [code:catalog/load.mjs:5] [code:catalog/load.mjs:101-107] → `01c_catalog_loader.md` 1-4
- [ ] 시드 리뷰 생성 스크립트와 글을 저장소로 옮긴다. 지금은 git 밖 `catalog/local/work/reviews-20261109/` 에만 있어 그 폴더 없이 다시 만들 수 없다 → `01e_seed_reviews.md`
- [ ] 설명문 문구 규칙 작업 때 몸에 대한 말 A-1(인피니티런 4 "러너가 부상 없이 달리도록 돕겠다는 목표로 시작된") 정도를 다시 볼 수 있다(지금은 고치지 않는다, 사용자 2026-11-13) → `01d_catalog_copy.md` 1-5, 4-1
- [ ] 설명문 100켤레 시험의 베끼기 사람 확인 3건(아디스타 4, 디비에이트 니트로 엘리트 4, 디비에이트 니트로 3)을 본다(지금은 고치지 않는다, 사용자 2026-11-15) → git 밖 `catalog/local/work/copy-100-20261115/review-copycheck.md` [c:af932aa] <!-- 확인 못 함: 시험 결과 파일은 git 밖 -->
- [ ] RSG 리뷰와 스펙 칸이 어긋난 16곳(발볼 6, 용도 5, 수치와 폼 이름 5)을 본다(지금은 고치지 않는다, 사용자 2026-11-15) → git 밖 `catalog/local/work/copy-100-20261115/spec-mismatch.md` [c:af932aa] <!-- 확인 못 함: 시험 결과 파일은 git 밖 -->
- [ ] 새 신발에 시드 리뷰 더하기 → `01e_seed_reviews.md` 4절
- [ ] 설명문 310켤레 다시 쓰기는 보류했다. 운영 글은 그대로(사용자 2026-11-17). BITR 을 뺀 새 판은 스펙 칸 되풀이만 남아 지금 글보다 못했고, 사실과 평가가 한 문장에 엉켜 평가만 빼는 것도 되지 않는다. 다시 볼 때 시작점 → 로컬 브랜치 `keep/copy-310-rewrite-20261115`, git 밖 `catalog/local/work/copy-310-20261115/README.md`

#### 화면, 계정, API
- [ ] 드롭다운 여백을 12/36 으로 통일한다. 관리자 페이지 고르기 칸만 오른쪽 10px, 안쪽 여백 30px 이다(2026-11-17 사용자) [code:src/pages/AdminMy.css:64-72] [code:src/pages/ShoeForm.css:166-174] → `02b_design_system.md` 1-5
- [ ] 챗봇 청록 `#14807a` 를 `index.css` 토큰으로 올린다. 쓰기로 한 색인데 아직 토큰이 아니다(2026-11-17 사용자) [code:src/components/ChatBot.css:12] → `02b_design_system.md` 1-2

- [ ] 실사용 후기(FOLLOWUP) 화면 → `04_auth.md` 1-5
- [ ] 토큰 밖 색 둘을 토큰으로 옮길지 → `02b_design_system.md` 5절
- [ ] 토큰 밖 색 점검 grep 이 3자리 hex(#444, #999 등)를 못 본다(2026-11-17 사용자) [code:src/components/ChatBot.css:95] [code:src/components/ChatBot.css:132] → `02b_design_system.md` 5절
- [ ] 상세 모달에서 세대 사이를 오가게 한다(`lineKey` 사용) [code:src/components/ShoeModal.tsx:117-208] → `02_screens.md`
- [ ] 실측값(`measured*`)을 화면에 보인다 [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:316-318] → `02_screens.md`
- [ ] 화면 시험을 자동으로 돌린다. 지금은 사람이 브라우저에서 보고, 계약 시험은 API 만 본다 [code:contract/] [code:package.json:12] → `02_screens.md`
- [ ] 수정 이력에 이전 값을 남긴다. 지금은 마지막 한 번만 행에 있다 [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:270] → `03_admin.md`
- [ ] 숨긴 첫 리뷰가 있으면 새 첫 리뷰를 못 쓴다(409) [code:backend/src/main/resources/db/migration/V3__auth.sql:61] → `03_admin.md`
- [ ] CSP 를 올린다(화면 검증 뒤) → `04_auth.md` 4절
- [ ] 활동 로그를 읽는 화면과 API [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityController.java:49] → `04_auth.md` 1-5
- [ ] 비교하기 화면이 목록 전체(약 1MB)를 받지 않게 한다 [code:src/pages/Compare.tsx:22] [code:src/pages/Compare.tsx:32-39] → `08_compare.md`
- [ ] 추천 상위 3 아래에 "조건이 맞는 신발 N켤레 더"를 작은 카드 목록으로 보인다(순위는 그대로) → `10_recommend.md`
- [ ] 서버도 와이드 "없음"의 출처를 요구할지 → `03_admin.md` 4절
- [ ] 목록 페이지 나누기(홈 목록과 공개 목록 API) → `02_screens.md`, `05_api_contract.md`
- [ ] 비교하기 CSS 주석의 내 찜 이름 자리 폭이 틀렸다. 주석은 190px, 150px 인데 2026-11-17 운영에서 잰 값은 스크롤바 17px 기준 205px, 165px 이다(문서 값이 맞다) [code:src/pages/Compare.css:24] [code:src/pages/Compare.css:817] → `08_compare.md` 1-4
- [ ] 코드 주석 둘이 체험 계정을 아직 「시드 3」이라고 적는다(실제는 시드 30과 데모 관리자 1). 동작은 맞고 주석만 낡았다(2026-11-17 문서 근거 달기에서 찾음) [code:backend/src/main/resources/application.yml:36] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:80]
- [ ] 실사용 인증을 다시 켤지. 실사용 후기나 기록 앱 스크린샷 같은 근거가 생긴 뒤. 칸(V3 `verified`)은 남아 있다 → `03_admin.md` 1-6 [code:backend/src/main/resources/db/migration/V3__auth.sql:57-59] [docs:03_admin.md]
- [ ] 사전에 더한 용어를 고치거나 지울 화면 → `07_database.md`
- [ ] 계약 시험을 둘이 함께 돌리지 않게 할지(컨테이너 이름과 포트가 고정) → `contract/README.md` 「결과」 [code:contract/run-spring-local.sh:86-87] [code:contract/run-spring-local.sh:31] [code:contract/README.md:72]
- [ ] v6 관리자 로그인 401. 265번 중 1번(X00 만, 2026-11-17), 앱 로그가 없어 원인을 못 찾았다. 계약 스크립트가 이제 나면 `contract/run/spring-v6-evidence/` 에 앱 로그와 관리자 행을 남기니 다음에 나면 그때 본다 → `contract/README.md` 「관리자 로그인 401 — 증거 남기기」. refresh 재사용 10초 창과 운영 로그 요청은 사용자가 401 을 겪은 시각을 안 뒤에 [code:contract/run-spring-local.sh:22-23] [code:contract/run-spring-local.sh:41-44] [code:contract/README.md:164] [c:014e520]

#### 인프라, DB

- [ ] MySQL 정기 백업(덤프 CronJob, 저장소 밖 보관) → `06_deployment.md`
- [ ] terms 테이블의 키를 `row_no` 에서 `id` 로 [code:backend/src/main/resources/db/migration/V1__schema.sql:55] [code:backend/src/main/resources/db/migration/V17__terms_outsole_id.sql:3] → `07_database.md`
- [ ] 데이터 정리 켜기 — 잠금(`GET_LOCK`, 2026-11-17 코드)이 든 이미지가 운영에 오른 뒤 인프라 관리자에게 infra Deployment env `ACTIVITY_CLEANUP_CRON` 빼기를 부탁한다. 빼면 activity_logs 정리와 chatbot_turns 질문 · 답 90일 비우기가 함께 켜진다. 다음 날 04:00 로그(「데이터 정리 —」 한 줄, 다른 Pod 는 「넘어간다」)를 본다 → `06_deployment.md` 4절
- [ ] MySQL 승격을 앱 트래픽까지 옮겨 한 번 해 보기(점검 시간에, Replica와 런북은 2026-11-10 인프라 묶음 2에서 생김) → `06_deployment.md` 4절
- [ ] Argo Rollouts(카나리), 사이드카 로그 수집, CronJob 리뷰 통계 스냅샷 → 상세 문서 없음(전에 `overview.md` 표에만 있던 것)
- [ ] 옛 칸 정리 마이그레이션(옛 칸, `liked` 삭제, NOT NULL 조이기, `legacy*`) → `07_database.md` 4절 [code:backend/src/main/resources/db/migration/V1__schema.sql:18-21] [code:backend/src/main/resources/db/migration/V1__schema.sql:32] [code:backend/src/main/resources/db/migration/V1__schema.sql:44] [code:backend/src/main/java/com/kopo17/runshoes/domain/Shoe.java:48] [code:backend/src/main/java/com/kopo17/runshoes/domain/Shoe.java:91-94] [docs:07_database.md]
- [ ] Jenkinsfile 「문서만 바뀌었나」가 한글 이름 파일을 못 알아본다. `git diff --name-only` 가 한글 경로를 따옴표로 감싸 `^docs/`, `\.md$` 에 안 걸린다(빌드로 떨어질 뿐 잘못 건너뛰지는 않는다, 지금 한글 이름 파일 0개). `git -c core.quotePath=false diff` 로 → `Jenkinsfile` 「태그」 단계(FOREMAN 「나중에 할 일」에서 옮김, 2026-11-15) [code:Jenkinsfile:79] [code:Jenkinsfile:83] [c:9a94441]

#### 포트폴리오

- [ ] 포트폴리오 글과 그 Notion 페이지. 사용자가 시킬 때 서기 세션이 쓴다 → `config/portfolio.toml`(FOREMAN 「나중에 할 일」에서 옮김, 2026-11-15) [code:config/portfolio.toml:1]
