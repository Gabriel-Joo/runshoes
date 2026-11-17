# TODO — 남은 일

> 한 줄에 하나. 무엇이 남았는지만 적는다 — 무엇이 문제고 왜 그런지 · 어떻게 고칠지는 → 가리키는 문서에 있다. 끝나면 이 줄을 지우고, 한 일은 그 문서(3절)와 `HISTORY.md` 에 남긴다. 남은 일을 다른 문서에 따로 적지 않는다(2026-11-10 사용자 — 두 군데에 적으면 한쪽만 지우게 된다).

#### 챗봇 RAG — 단계는 `09_chatbot_rag.md` 13절

- [ ] model-service 재부팅 순서 확인(다음 재부팅 때) → `~/AI_programming/model-service/docs/runbook-cutover.md` 8절
- [ ] 5-1 남은 한계 넷 — 5-2 뒤 다시 보고, 남아 있으면 고친다 → `09_chatbot_rag.md` 15절 · 16절
- [ ] 5-2 경험·후기 15문항 — 사용자가 초안(`chatbot/eval/golden-experience.jsonl`)을 본다 → `09_chatbot_rag.md` 16절
- [ ] 5-2 남은 한계 — 운영에 올린 뒤 실제 질문을 보고 다시 정한다(항목마다 무엇을 볼지 적어 둠) → `09_chatbot_rag.md` 16절 「5-2 남은 한계」
- [ ] 사전에 없는 용어("갑피가 뭐예요")를 설명문 검색으로 답하기 — 지금은 5-1 처럼 거절 · 기록 → `09_chatbot_rag.md` 8절 · 16절
- [ ] 5-1 운영 반영 뒤 멀쩡한 것을 보고 태그 `archive/main-before-reword-20261112` · 백업 참조를 지울지 정하기 → `HISTORY.md` 11-12
- [ ] 챗봇 로그인(연결 뒤 첫 프레임 auth — 로컬 구현 끝, 백엔드 · 인프라 변경 없음) push 뒤 운영 확인 — 로그인 전 버튼 → 안내, 체험 카드로 로그인 → 인사 · 답, 로그아웃 → 연결 닫힘, 배포 직후 챗봇 로그의 "인증 실패 — me None" 수 → `09_chatbot_rag.md` 17절
- [ ] 용어 사전 보강 21개 → `09_chatbot_rag.md` 8절
- [ ] 용어 사전에 통증 항목 보강(병명 → 신발 다리 · 출처 필요 · 전문의 안내를 답 앞으로 뺄지 검토) — 그때 통증 질문의 신발 이름 · 버튼을 다시 본다 → `09_chatbot_rag.md` 8절 · 16절
- [ ] 발 유형(과내전 · 평발 · 발볼)과 증상(아프다 · 시큰하다)을 나눠 전문의 안내를 붙일지 정한다 — 지금은 모두 붙인다(임시, 사전 보강 때 기준을 세운다) → `09_chatbot_rag.md` 7절
- [ ] 리랭커 판단 — 보류. 76문항 통과, Hit@5 3/3이라 검색이 못 찾는 문제가 없다. 리뷰가 늘어 검색이 흐려지거나 Hit@5가 떨어지면 그때 켠다 → `09_chatbot_rag.md` 2절
- [ ] 챗봇 인용 블록이 리뷰 원문을 그대로 보여 준다 — 실유저 리뷰가 들어오면 욕 · 비방도 그대로 인용된다. 리뷰 신고 기능이나 필터를 볼 때 함께 본다 → `09_chatbot_rag.md` 6절
- [ ] 리뷰가 약 4,600건(두 Pod 동시 임베딩 30초)에 가까워지면 색인 파일 캐시용 저장공간(호스트 NFS RWX) → `09_chatbot_rag.md` 16절 「저장공간」

#### 챗봇 — 나중에 재면 좋을 것(지금은 계측하지 않는다 — 모니터링은 챗봇 작업 뒤, 2026-11-12 사용자)

- [ ] 검사에 걸려 코드 답을 낸 비율과 까닭(사실에 없는 숫자 · 금칙어 · 잘림 · 신발이 몸에 도움) → `09` 15절
- [ ] 거절 · 기록 건수 — 없는 신발 · 없는 용어 · 답하지 못한 특성(`chatbot_misses` kind 별) · 범위 밖 → `07_database.md` 1-1
- [ ] "보러 가기" 버튼을 누른 비율(1켤레 · 비교하기) → `02_screens.md` 1-7
- [ ] 동시 연결 수 · 연결당 대화 턴 수 · 용도 되묻기 뒤 이어서 답한 비율 → `09` 15절

#### 카탈로그

- [ ] 약관 다시 읽기 전 거르는 도구 — 약관 페이지를 받아 `terms_version` 날짜와 `clauses` 인용 문구가 그대로인지 본다 → `01a_catalog_sources.md` 1-2b 「다시 읽는 때」
- [ ] 약관 기록 남은 fetch 16항목(호스트 15곳)을 BITR · RSG 꼴로 몇 번에 나눠 채우기 — 목록은 → `01a_catalog_sources.md` 1-2b 「채우는 곳」
- [ ] 수집기(`local/fetch.mjs`)에 www 바꿔 읽기 — `read_via` 가 달린 다른 이름 호스트의 주소를 같은 경로의 www 주소로 바꿔 받는다 → `01a_catalog_sources.md` 1-2b
- [ ] 수집기가 아식스 NetFunnel 대기열 페이지를 정상 페이지로 캐시한다(캡차 낱말이 없어 멈추지 않음) — 대기열을 알아보고 멈추게 → `01a_catalog_sources.md` 1-2b 「기록과 지금이 다른 곳」
- [ ] www.asics.co.kr(대기열) · www.brooksrunning.co.kr(443 접속 거절)은 기록상 `fetch` 인데 지금 열리지 않는다 — 판정을 둘지 사람이 정한다 → `01a_catalog_sources.md` 1-2b 「기록과 지금이 다른 곳」
- [ ] 수집기의 캡차 판정(본문 앞 5000자에 `captcha`)이 위키백과 머리 스크립트의 설정값(`"wgConfirmEditCaptchaNeededForGenericEdit":"hcaptcha"`)에 걸려 위키백과 호스트를 멈춘다 — 위키백과를 실제로 읽기 전에 고친다 → `01a_catalog_sources.md` 1-2b

- [ ] 와이드 정보 없음 4켤레(사용자가 MAN 으로) · 울트라부스트 5X 의 와이드 · 정가 · 카본 → `01a_catalog_sources.md` 4절
- [ ] GTX 판을 별도 행으로 → `01a_catalog_sources.md` 4절
- [ ] 정가 빈 칸을 채울 방법(국내 공식몰 아카이브 · MAN) → `01a_catalog_sources.md` 4절
- [ ] 정기 확인 작업(월 1회 보고서 — 새 세대 · 정가 변경 · 이미지 링크) → `01a_catalog_sources.md` 4절
- [ ] 여성 행(출처가 모이면) → `01a_catalog_sources.md` 4절
- [ ] 상품명이 세대를 섞는 라인 점검 → `01b_catalog_images.md` 4절
- [ ] 이미지 링크 정기 확인 → `01b_catalog_images.md` 4절
- [ ] 이미지 1장뿐인 57켤레 — GOAT 색상 → `01b_catalog_images.md` 4절
- [ ] 사진이 없어 적재되지 않은 14켤레 — 사용자가 관리 화면에서 → `01b_catalog_images.md` 4절
- [ ] 정기 가져오기 · 정기 확인(CronJob — 보고서만) → `01c_catalog_loader.md` 4절
- [ ] 관리 화면에서 새로 넣은 신발을 후보 목록 행으로 바꾸는 도구 → `01c_catalog_loader.md` 4절
- [ ] 문구 규칙 · 검사기를 저장소로 옮겨 새 켤레에도 → `01d_catalog_copy.md` 4절
- [ ] 설명문 문구 규칙 작업 때 몸에 대한 말 A-1(인피니티런 4 "러너가 부상 없이 달리도록 돕겠다는 목표로 시작된") 정도를 다시 볼 수 있다(지금은 고치지 않는다 — 사용자 2026-11-13) → `01d_catalog_copy.md` 4절 · 4-1
- [ ] 설명문 100켤레 시험의 베끼기 사람 확인 3건(아디스타 4 · 디비에이트 니트로 엘리트 4 · 디비에이트 니트로 3)을 본다(지금은 고치지 않는다 — 사용자 2026-11-15) → git 밖 `catalog/local/work/copy-100-20261115/review-copycheck.md`
- [ ] RSG 리뷰와 스펙 칸이 어긋난 16곳(발볼 6 · 용도 5 · 수치와 폼 이름 5)을 본다(지금은 고치지 않는다 — 사용자 2026-11-15) → git 밖 `catalog/local/work/copy-100-20261115/spec-mismatch.md`
- [ ] 새 신발에 시드 리뷰 더하기 → `01e_seed_reviews.md` 4절
- [ ] 설명문 310켤레 다시 쓰기는 보류했다 — 운영 글은 그대로(사용자 2026-11-17). BITR 을 뺀 새 판은 스펙 칸 되풀이만 남아 지금 글보다 못했고, 사실과 평가가 한 문장에 엉켜 평가만 빼는 것도 되지 않는다. 다시 볼 때 시작점 → 로컬 브랜치 `keep/copy-310-rewrite-20261115` · git 밖 `catalog/local/work/copy-310-20261115/README.md`

#### 화면 · 계정 · API

- [ ] 실사용 후기(FOLLOWUP) 화면 → `04_auth.md` 4절
- [ ] 토큰 밖 색 둘을 토큰으로 옮길지 → `02b_design_system.md` 4절
- [ ] 서버도 와이드 "없음"의 출처를 요구할지 → `03_admin.md` 4절
- [ ] 목록 페이지 나누기 → `05_api_contract.md` 4절
- [ ] 실사용 인증을 다시 켤지 — 실사용 후기 · 기록 앱 스크린샷 같은 근거가 생긴 뒤. 칸(V3 `verified`)은 남아 있다 → `03_admin.md` 1-6
- [ ] 사전에 더한 용어를 고치거나 지울 화면 → `07_database.md` 4절
- [ ] 계약 시험을 둘이 함께 돌리지 않게 할지(컨테이너 이름 · 포트가 고정) · v6 의 간헐적인 관리자 로그인 401 원인 → `contract/README.md` 「결과」. 운영에서 관리자 로그인이 풀리는 현상이 생기면 이것과 함께 본다

#### 인프라 · DB

- [ ] MySQL 정기 백업(덤프 CronJob, 저장소 밖 보관) → `06_deployment.md` 4절
- [ ] ShedLock — activity_logs 정리를 Pod 하나만 돌게, 그 뒤 infra Deployment env `ACTIVITY_CLEANUP_CRON` 빼기 → `06_deployment.md` 4절. 그때 chatbot_turns 질문 · 답 90일 정리도 함께 켠다
- [ ] MySQL 승격을 앱 트래픽까지 옮겨 한 번 해 보기(점검 시간에 — Replica · 런북은 2026-11-10 인프라 묶음 2에서 생김) → `06_deployment.md` 4절
- [ ] Argo Rollouts(카나리) · 사이드카 로그 수집 · CronJob 리뷰 통계 스냅샷 → 상세 문서 없음(전에 `overview.md` 표에만 있던 것)
- [ ] 옛 칸 정리 마이그레이션(옛 칸 · `liked` 삭제 · NOT NULL 조이기 · `legacy*`) → `07_database.md` 4절
- [ ] Jenkinsfile 「문서만 바뀌었나」가 한글 이름 파일을 못 알아본다 — `git diff --name-only` 가 한글 경로를 따옴표로 감싸 `^docs/` · `\.md$` 에 안 걸린다(빌드로 떨어질 뿐 잘못 건너뛰지는 않는다, 지금 한글 이름 파일 0개). `git -c core.quotePath=false diff` 로 → `Jenkinsfile` 「태그」 단계(FOREMAN 「나중에 할 일」에서 옮김, 2026-11-15)

#### 포트폴리오

- [ ] 포트폴리오 글과 그 Notion 페이지 — 사용자가 시킬 때 서기 세션이 쓴다 → `config/portfolio.toml`(FOREMAN 「나중에 할 일」에서 옮김, 2026-11-15)
