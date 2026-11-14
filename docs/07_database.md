> 상태: 운영에서 쓰는 중(2026-11-02). 운영 MySQL 은 V13 까지 적용됐다(11-03), V14(요약) · V15(270mm 무게) · V16(무게 용어 설명)은 2026-11-10 적용 — 신발 310켤레 · 리뷰 1,800건(2026-11-09 시드 리뷰 다시 만들기 — `01e_seed_reviews.md`, 공개 API `GET /api/shoes` · `/api/reviews` 로 센 수). 원천: `backend/src/main/resources/db/migration/V1~V16` · `domain/*.java` · 로컬 dev DB(V1~V16)의 `information_schema`

#### 0. 한 줄 요약

MySQL 8 하나에 테이블 9개(+ `flyway_schema_history`)다. 스키마는 **Flyway 마이그레이션으로만** 바꾸고, 앱은 `ddl-auto validate` 로 맞는지만 본다. 마이그레이션은 **추가만 · 한 번에 한 목적 · 옛 이미지로 롤백해도 뜨게** 쓴다.

#### 1. 최종 설계

#### 1-1. 테이블

| 테이블 | 칸 | 무엇 |
|---|---|---|
| `shoes` | 48 | 신발 한 세대 · 한 성별이 한 행. 스펙(공시 · 실측) · 가격 메타 · 스펙 출처 · 품번 · 와이드 범위 · 숨김 · 수정 이력 |
| `reviews` | 17 | 리뷰. 첫 리뷰(FIRST)와 실사용 후기(FOLLOWUP), 작성자 닉네임 스냅샷 |
| `users` | 9 | 계정. 역할 `USER` · `ADMIN` · `DEMO_ADMIN`, 탈퇴는 `deleted_at` |
| `likes` | 3 | 사용자별 찜(신발) |
| `review_likes` | 3 | 사용자별 리뷰 공감 |
| `refresh_tokens` | 10 | refresh token 의 SHA-256 · family · `replaced_by` |
| `activity_logs` | 10 | 인증 · 리뷰 · 찜 · 신발 조회 · 비교 · 관리 화면 쓰기 이력. 로그인 시도 제한도 여기서 센다 |
| `shoe_purges` | 11 | 영구 삭제한 신발의 기록(행이 없으니 FK 아님) |
| `terms` | 6 | 용어 설명(읽기 전용). `row_no` 가 키 — 시드에 `id 12` 가 둘이었고 V17 에서 아웃솔을 13 으로 |
| `chatbot_misses` | 5 | 챗봇이 찾지 못한 신발 · 용어 · 답하지 못한 특성 질문(V18, kind `shoe` · `term` · `feature`) — 뽑은 이름 · 원문 · 시각. 챗봇 사이드카만 쓴다(내부 POST, 127.0.0.1). 관리 화면이 이름으로 묶어 센다 |
| `chatbot_turns` | 21 | 챗봇 대화 한 턴에 한 줄(V19) — 연결 id · 계정 id · 질문 · 답 · 갈래 · 판정 표시 · 신발 수 · 단계별 시간(라우터 · 검색 · 생성 · API 다섯). 챗봇 사이드카만 쓴다(내부 POST, 127.0.0.1). 대시보드가 복제본을 읽되 질문 · 답 칸은 권한으로 막는다. `user_id` 는 계정이지 사람이 아니다(체험 계정을 여럿이 쓴다) — `09_chatbot_rag.md` 18절 |
| `summary_batch_runs` | 11 | 요약 배치 한 실행 한 줄(V20) — 시작 · 끝 · 결과(`running` · `ran` · `skipped` · `error`) · 대상 · 성공 · 실패 · 다시 stale · 사라짐 · 걸린 시간 · 오류 글. 배치가 바로 쓴다 — `09_chatbot_rag.md` 5절 「실행 기록」 |
| `summary_batch_failures` | 5 | 요약 배치가 만들지 못한 켤레 한 줄(V20) — 실행 id(FK, CASCADE) · 신발 id(FK 없음) · 까닭 · 시각 |
| `grafana_compare_views`(뷰) | 4 | `activity_logs` 의 `compare.view` 행에서 비교한 신발 번호만(V21). 대시보드 읽기 계정이 `meta` 없이 비교 조합을 센다 — 1-6절 |

- 키 · 제약
  - `uk_shoes_line_generation_gender(line_key, generation, gender)` — 한 라인의 한 세대 · 한 성별은 한 행. 숨긴 행에도 걸린다(같은 세대는 새로 넣지 않고 되살린다, 409).
  - `uk_reviews_user_first_shoe(user_id, first_shoe_id)` — 한 사람이 한 신발에 첫 리뷰는 하나. `first_shoe_id` 는 FIRST 일 때만 값이 있는 VIRTUAL 생성 칸이라 FOLLOWUP 은 걸리지 않는다.
  - `uk_users_email` · `uk_users_nickname`(collation 이 대소문자를 같게 본다) · `uk_refresh_tokens_hash`.
  - FK 11개. 신발 · 리뷰를 가리키는 것(`likes` · `review_likes` · `reviews.shoe_id` · `reviews.parent_review_id` · `shoe_summaries.shoe_id`(V14))은 `ON DELETE CASCADE` — 영구 삭제 때 함께 지워진다. `activity_logs.user_id` 는 `SET NULL`, `reviews.user_id` 는 막는다(탈퇴는 행을 지우지 않는다).
- id — `shoes` · `reviews` · `users` 모두 `AUTO_INCREMENT`(V10 부터). 신발 POST 본문에 id 가 있으면 그대로 쓴다(`AutoIncrementOrAssigned`).
- 시간은 모두 UTC, `DATETIME(3)`(ms) — 프런트의 `toISOString()` 과 같은 값을 돌려준다.
- 숫자 스펙 · 가격 · 평점은 `DOUBLE` — JSON 숫자를 그대로 담는다(250.5 · 38.55 가 잘리지 않게).

#### 1-2. `shoes` 의 칸 묶음

| 묶음 | 칸 | 들어온 때 |
|---|---|---|
| 식별 | `id` · `brand` · `model` · `line_key` · `generation` · `gender` · `is_current` · `sku` | V1 · V4 · V11 |
| 영어 이름 | `model_en`(상세 모달 브랜드 줄에) · `model_alias`(검색용 다른 표기, 쉼표로 나눈다 — 화면에 보이지 않는다) | V13 |
| 분류 | `purpose` · `stability` · `midsole` · `carbon` | V1 |
| 공시 스펙 | `official_weight_g` · `official_weight_size` · `official_heel_mm` · `official_drop_mm` · `official_spec_size` | V4 |
| 실측 스펙 | `measured_weight_g` · `measured_weight_size` · `measured_heel_mm` · `measured_drop_mm` · `measured_source` · `measured_count` | V4 |
| 발볼 · 와이드 | `toebox_width` · `wide_available` · `wide_scope` | V4 · V12 |
| 가격 | `price`(정가만) · `price_source` · `price_checked_at` · `price_kind` | V1 · V5 |
| 출처 | `spec_sources`(JSON — 칸마다 `{code, url}`) | V6 |
| 표시 | `image` · `images`(JSON) · `summary` · `description` | V1 |
| 셈 | `rating` · `review_count` · `like_count` — 리뷰 · 찜 쓰기와 같은 트랜잭션에서 고친다 | V1 · V3 |
| 관리 | `deleted_at`(숨김) · `updated_at` · `last_change`(JSON, 바뀐 칸 이름) | V8 · V11 |
| **옛 칸** | `weight` · `drop_mm` · `stack_height` · `width` · `liked` | V1 — 4절 |

- 앱(`domain/Shoe`)은 `official_*` · `toebox_width` 를 읽는다. 쓸 때는 옛 칸(`weight` · `drop_mm` · `stack_height` · `width`)에도 같은 값을 쓴다 — 옛 이미지로 롤백하면 그 이미지가 옛 칸으로 최신 값을 본다.
- 숨긴 신발은 엔티티로 읽히지 않는다(`@SQLRestriction("deleted_at IS NULL")`). 숨기기 · 되살리기 · 영구 삭제는 `ShoeRepository` 의 native 쿼리다.
- `updated_at` · `last_change` 는 관리자 등록 · 수정 · 숨김 · 되살리기 때만 앱이 찍는다. 적재기(`X-Runshoes-Client: loader`)의 수정, 찜 · 평점 셈은 찍지 않는다 — 그래서 `ON UPDATE CURRENT_TIMESTAMP` 를 쓰지 않는다.
- 와이드 넷: 있음(국내) = `wide_available TRUE` + `wide_scope 'domestic'` · 국외에만 있음 = `TRUE` + `'overseas'` · 없음 = `FALSE` · 정보 없음 = `NULL`. 판단 규칙은 `01a_catalog_sources.md` 1-7.

#### 1-3. 활동 로그 보존

- `ActivityCleanup` 이 매일(`app.activity.cleanup-cron`, Asia/Seoul) 지운다 — `auth.*` · `user.*` 90일, 나머지(`review.*` · `like.*` · `shoe.*` · `compare.*` …) 180일(`application.yml`).
- 그래서 오래 남아야 하는 기록은 로그에 기대지 않는다 — 영구 삭제는 `shoe_purges`, 신발의 마지막 수정은 `shoes.last_change`.

#### 1-4. 마이그레이션 V1~V21

| V | 이름 | 무엇 | 운영 적용 |
|---|---|---|---|
| 1 | schema | json-server `db.json` 의 shoes · reviews · terms 를 그대로 옮긴 스키마 | 2026-10-21(Spring 전환) |
| 2 | seed data | 신발 20 · 리뷰 105 · 용어 13 | 2026-10-21 |
| 3 | auth | 사용자 · 찜 · 리뷰 공감 · refresh token · 활동 로그, 실사용 후기 칸. 리뷰 105건 → 사용자 30명 | 2026-10-21 |
| 4 | shoe generations | `line_key` · `generation` · `gender` · `is_current`, 공시 · 실측 분리, `toebox_width` | 2026-10-29 |
| 5 | price reference | 정가의 출처 · 읽은 날 · 종류 | 2026-10-29 |
| 6 | spec sources | 칸별 출처 JSON | 2026-10-30 |
| 7 | demo admin | 읽기 전용 데모 관리자 한 계정(비밀번호 칸 `'!demo'`) | 2026-10-30 |
| 8 | shoe soft delete | 신발 숨김 `deleted_at` | 2026-10-30 |
| 9 | user withdraw | 회원 탈퇴 `deleted_at`(이메일 · 닉네임 자리표시로 UNIQUE 를 비운다) | 2026-10-30 |
| 10 | auto increment ids | 리뷰 · 신발 id 를 DB 가 매긴다 | 2026-11-01 |
| 11 | admin history | `sku` · `updated_at` · `last_change` · `shoe_purges` | 2026-11-01 |
| 12 | wide scope | `wide_scope`(domestic · overseas) | 2026-11-02 |
| 13 | model en | `model_en` · `model_alias` | 2026-11-03 |
| 14 | shoe summaries | 리뷰 요약 `shoe_summaries`(요약 · 만들 때 리뷰 수 · 반올림 전 평균 · stale · 만든 때). 3건 이상인 보이는 신발을 "아직 만들지 않은" 행으로 넣는다 — `09_chatbot_rag.md` 5절 | 2026-11-10 |
| 15 | weight norm 270 | `weight_norm_270` — 공시 무게를 270mm(M9)로 맞춘 값, 생성 컬럼(VIRTUAL, 반 사이즈당 2.6%). 기준이 없거나 다섯 사이즈 밖이면 NULL — `01a_catalog_sources.md` 1-3a | 2026-11-10 |
| 16 | weight term | 무게 용어(`term_key 'weight'`) 설명을 환산 규칙(반 사이즈당 약 2.6%)에 맞춘다. 첫 구문 가드 — 시드 원문과 다르면 멈춘다. id 12 가 둘이라 `term_key` 로 고친다 | 2026-11-10 |
| 17 | terms outsole id | 아웃솔 용어의 id 12 → 13 — 챗봇이 용어를 id 로 참조할 때 둘이 섞이지 않게(`09_chatbot_rag.md` 8절). 첫 구문 가드 — 아웃솔이 id 12 인 행이 하나이고 13 이 비었을 때만 | 2026-11-12 |
| 18 | chatbot misses | `chatbot_misses`(kind `shoe` · `term` · `feature` CHECK · query · message · created_at) — `09_chatbot_rag.md` 15절 | 2026-11-12 |
| 19 | chatbot turns | `chatbot_turns`(턴 한 줄 — 연결 · 계정 · 질문 · 답 · 갈래 · 판정 · 단계별 시간, created_at · conn_id 색인) — `09_chatbot_rag.md` 18절 | 2026-11-14 |
| 20 | summary batch runs | `summary_batch_runs` · `summary_batch_failures`(요약 배치 실행 기록 · 실패한 켤레) — `09_chatbot_rag.md` 5절. V19 와 같은 배포 | 2026-11-14 |
| 21 | grafana compare views | 뷰 `grafana_compare_views`(`compare.view` 행의 신발 번호만, `SQL SECURITY DEFINER`) — 대시보드 비교 조합 순위, 1-6절. 표는 바꾸지 않는다 | 아직(로컬) |

운영 적용 날짜는 KST 다(런북 실행 기록의 시각은 UTC). 걸린 시간은 infra 런북의 실행 기록(`auth-v3.md` · `catalog-v4-v5.md` · `admin-demo-v6-v9.md` · `v10-auto-increment.md` · `v11-admin-history.md` · `v12-wide-scope.md` · `v13-model-en.md` · `v14-shoe-summaries.md` · `v15-weight-norm.md` · `v17-v18-chatbot.md`)에 있다. 절차는 `06_deployment.md`.

#### 1-5. 마이그레이션을 쓰는 규칙

- **적용된 파일은 한 글자도 고치지 않는다** — Flyway 체크섬이 달라져 앱이 뜨지 않는다. 주석이 틀렸어도 다음 번호에서 바로잡는다.
- **추가만 한다.** 칸 이름을 바꾸거나 지우지 않는다. 새 칸은 NULL 허용으로, 맨 뒤에 붙인다(MySQL 8 INSTANT — 테이블을 다시 만들지 않는다).
  - 옛 이미지로 롤백해도 뜬다: Flyway 는 모르는 새 마이그레이션을 무시하고, `ddl-auto validate` 는 늘어난 칸 · 테이블을 문제 삼지 않는다.
- **한 마이그레이션에 한 목적.**
- **기존 행을 추측으로 채우지 않는다.** 새 칸의 기존 값은 NULL 로 두고 적재기 · 관리 화면이 채운다(V5 · V6 · V11 · V12).
- 기존 데이터를 고정 값으로 고치는 마이그레이션(V3 · V4)은 **맨 첫 구문에 가드**를 둔다 — 운영 데이터가 시드와 같을 때만 진행하고, 다르면 `ERROR 1242` 로 아무것도 바꾸기 전에 멈춘다.
- MySQL DDL 은 트랜잭션이 아니다 — 운영 적용 전에 `mysqldump` 를 먼저 뜬다(런북).

#### 1-6. 대시보드 읽기 계정 `grafana_ro`(관측 작업 A-3, 2026-11-14 — SQL 만, 운영에는 아직 없다)

Grafana 가 런슈즈 MySQL **복제본**(`runshoes-mysql-replica.runshoes.svc:3306`, read_only)을 읽는 계정이다. 복제본에서는 만들 수 없으므로 **원본(`runshoes-mysql-0`)에서 사람이 만들면 복제된다**. 꼴은 펫퍼민트 `grafana_ro` 와 같다(infra `docs/09_monitoring.md` 2-4절): 칸 단위 SELECT 만, 최대 연결 5.

```sql
-- 원본에서 한 줄씩. 비밀번호는 자리표시 — 화면 · 기록에 남기지 않게 넣는다(Grafana 쪽 Secret 과 같은 값)
CREATE USER 'grafana_ro'@'%' IDENTIFIED BY '<비밀번호>' WITH MAX_USER_CONNECTIONS 5;
GRANT SELECT (turn_id, conn_id, user_id, created_at, branch, by_rule, llm_ok, health, fallback_used, shoe_count, latency_ms, router_ms, search_ms, gen_ms, catalog_ms, compare_ms, recommend_ms, review_ms, summary_ms) ON runshoes.chatbot_turns TO 'grafana_ro'@'%';
GRANT SELECT (run_id, started_at, finished_at, result, target, ok, failed, restaled, gone, duration_ms, error) ON runshoes.summary_batch_runs TO 'grafana_ro'@'%';
GRANT SELECT (id, run_id, shoe_id, reason, created_at) ON runshoes.summary_batch_failures TO 'grafana_ro'@'%';
GRANT SELECT (id, occurred_at, user_id, event, target_type, target_id) ON runshoes.activity_logs TO 'grafana_ro'@'%';
GRANT SELECT (id, role, created_at, deleted_at) ON runshoes.users TO 'grafana_ro'@'%';
GRANT SELECT (id, brand, model, generation, gender, deleted_at) ON runshoes.shoes TO 'grafana_ro'@'%';
GRANT SELECT (id, shoe_id, user_id, rating, review_type, created_at) ON runshoes.reviews TO 'grafana_ro'@'%';
GRANT SELECT (user_id, shoe_id, created_at) ON runshoes.likes TO 'grafana_ro'@'%';
GRANT SELECT (user_id, review_id, created_at) ON runshoes.review_likes TO 'grafana_ro'@'%';
-- 뷰(V21)는 V21 이 운영에 올라간 뒤에 친다 — 그 전에는 뷰가 없어 ERROR 1146
GRANT SELECT ON runshoes.grafana_compare_views TO 'grafana_ro'@'%';
```

주지 않은 칸 · 표와 까닭

| 표 | 뺀 칸 | 까닭 |
|---|---|---|
| `chatbot_turns` | `question` · `answer` | 대화 본문(18절 — 대시보드는 숫자만) |
| `users` | `email` · `password_hash` · `nickname` · `updated_at` · `last_login_at` | 개인 정보 · 비밀번호 해시 · 한 사람의 접속 시각 |
| `activity_logs` | `meta` · `ip` · `user_agent` · `request_id` | `meta` 에 닉네임 변경 전후(`user.nickname.change`) · 모델 이름 · 바뀐 칸이 섞인다. ip · 브라우저는 개인 정보 |
| `reviews` | `author` · `content` · `proof_image_url` · `distance_km` · `verified*` · `liked` · `like_count` · `parent_review_id` · `first_shoe_id` | 닉네임 스냅샷 · 리뷰 글 · 인증 사진. 나머지는 대시보드에 쓰지 않는다 |
| `shoes` | 나머지 42칸 | 순위 이름표에 쓰는 것만 |
| `refresh_tokens` · `chatbot_misses` · `shoe_purges` · `shoe_summaries` · `terms` · `flyway_schema_history` | 표 전체 | 토큰 해시 · 사용자가 친 글(챗봇 못 찾은 말) · 대시보드에 쓰지 않음 |

- `activity_logs.target_id` 는 로그인 이벤트(`target_type='email'`)일 때 이메일의 HMAC-SHA256 앞 8바이트다(`auth/EmailKey` — 키는 JWT 서명 키에서 뽑아 서버 밖에서는 되돌릴 수 없다). 그래서 준다 — 신발 조회 순위(`shoe.view` 의 `target_id`)에 필요하다.
- 체험 계정은 `users.id` 1~30(시드 사용자, V3 가 id 를 고정해 넣는다)과 `role='DEMO_ADMIN'` 이다. 대시보드는 이 둘을 「체험 계정」으로 가른다 — 이메일을 보지 않는다.
- 비교 조합 순위는 `activity_logs.meta` 의 `shoeIds` 에만 있다. `meta` 칸은 줄 수 없으니 뷰 `grafana_compare_views`(V21 — `compare.view` 행의 `id` · `occurred_at` · `user_id` · `shoe_ids` 만)의 SELECT 를 준다(사용자 2026-11-14).
  - `SQL SECURITY DEFINER` · 정의자 `runshoes`@`%`(Flyway 를 돌리는 앱 계정) — 뷰는 정의자 권한으로 밑 표를 읽으므로 `grafana_ro` 는 `meta` 권한 없이 뷰만 읽는다. 복제본에도 `runshoes` 계정이 있다(복제본은 `mysql` 스키마까지 옮겨 채운다 — infra `docs/runbooks/mysql-replica.md` 2절). 없으면 뷰를 읽을 때 `ERROR 1449`.
  - 뷰는 `meta` 에서 `$.shoeIds` 하나만 꺼내고 `compare.view` 행만 본다 — 닉네임 변경 같은 다른 이벤트의 `meta` 는 나오지 않는다.
  - **다른 이름의 DB 로 복원하면 그 DB 에서는 뷰를 읽을 수 없다**(`ERROR 1356` — 정의자 권한이 `runshoes.*` 에만 있다). 덤프 · 복원 확인(06 1-7 3단계)은 표의 행 수로 하고 뷰는 세지 않는다. 같은 이름(`runshoes`)으로 복원하면 그대로 읽힌다.
- 표에 칸이 생기면 권한을 손으로 더해야 한다(펫퍼민트와 같은 대가).

시험(2026-11-14, 임시 MySQL — 개발 DB 덤프 복원 + V17~V20, tmpfs, 끝나면 사라짐)

- 막힘: `SELECT question` · `SELECT answer FROM chatbot_turns` → `ERROR 1143`, `SELECT * FROM chatbot_turns` → `ERROR 1142`. `users` 의 `email` · `password_hash` · `nickname`, `activity_logs` 의 `meta` · `ip`, `reviews` 의 `content` · `author` → 모두 `ERROR 1143`. `chatbot_misses` · `refresh_tokens` → `ERROR 1142`. `INSERT INTO likes` → `ERROR 1142`.
- 6번째 동시 연결 → `ERROR 1226 … max_user_connections (current value: 5)`.
- 준 칸으로 집계는 된다(`SELECT event, COUNT(*) FROM activity_logs GROUP BY event` 등).
- 뷰(V21, 같은 날 — 빈 임시 MySQL 에 Flyway 로 V1~V21, 앱 계정 `runshoes` 로): API 로 비교 기록 셋과 닉네임 변경 하나를 만든 뒤, `grafana_ro` 로 뷰를 읽으면 비교 세 줄(`[2, 16]` · `[2, 5, 16]` · `[7, 9]`)만 나오고 닉네임 값은 없다. 같은 계정으로 `SELECT meta FROM activity_logs` 는 여전히 `ERROR 1143`, `SHOW CREATE VIEW` 는 `ERROR 1142`. 덤프를 `runshoes_restore` 로 복원하면 복원은 되고 표 행 수도 맞지만, 뷰를 읽으면 `ERROR 1356`.

#### 2. 왜 이렇게 했나

- **json-server 응답과 같아야 했다.** 백엔드를 json-server 에서 Spring Boot 로 바꿀 때(2026-10-18~21) 화면을 고치지 않는 것이 조건이었다. 그래서 V1 은 "좋은 스키마"보다 "같은 응답"을 골랐다 — `DOUBLE` 숫자, ms 까지의 UTC 시간, 중복된 `terms.id 12`, 앱이 매기는 id. 기준은 녹화한 실제 응답(`contract/baseline/node`)이다.
- **롤백할 수 있어야 했다.** 운영은 GitOps 라 이미지를 되돌리는 것이 가장 빠른 복구다. 그러려면 새 스키마에서 옛 이미지가 떠야 한다 — 이름 바꾸기 · 지우기 대신 추가 + 복사, 그리고 엔티티가 옛 칸에도 같은 값을 쓴다.
- **공시값과 실측값을 나눴다(2026-10-23).** 제조사 공시 무게와 리뷰 사이트 실측 무게는 다른 사실이다. 한 칸에 섞으면 어느 쪽인지 잃는다. 출처는 칸마다 하나의 JSON(`spec_sources`)에 둔다 — 출처로 검색할 일이 없고, 칸이 늘어도 마이그레이션이 필요 없다.
- **남녀를 별도 행으로(2026-10-21).** 같은 모델이라도 공시 무게 · 기준 사이즈가 다르다.
- **지우지 않고 숨긴다(V8 · V9, 2026-10-30 사용자).** 신발을 지우면 리뷰 · 찜이 사라진다. 숨기면 되살릴 때 그대로 돌아온다. 영구 삭제는 따로 두고(V11), 다음 적재에서 다시 들어오지 않게 `shoe_purges` 에 남긴다.
- **카운터를 행에 둔다.** `like_count` · `review_count` · `rating` 은 매번 세지 않고 쓰기와 같은 트랜잭션에서 고친다 — 목록이 302켤레 × 리뷰를 세지 않게.

#### 3. 시도했던 것들

- **`max + 1` id(2026-10-21 → 11-01).** json-server 는 새 id 를 "남은 최대값 + 1"로 매겨 마지막 행을 지우면 같은 id 를 다시 썼다. 이를 재현하려고 V1 은 AUTO_INCREMENT 없이 앱이 JVM 안의 쓰기 잠금으로 id 를 매겼다. 롤링 배포(maxSurge 1)로 Pod 가 둘 겹치는 순간 두 Pod 가 같은 id 를 매겨 PK 충돌이 났고, 리뷰에서는 그 오류가 409 "이미 리뷰를 썼다"로 잘못 보였다. V10(2026-11-01)에서 AUTO_INCREMENT 로 바꿨다 — 계약에서 "지운 id 를 다시 쓴다"는 것은 의도한 변경으로 받아들였다(`05_api_contract.md`).
- **V3 의 가드와 지문(2026-10-21).** 리뷰 105건을 닉네임 101종 → 사용자 30명으로 나누는 재배분은 리뷰 id 를 고정 목록으로 썼다. 운영 리뷰가 시드와 다르면 엉뚱한 사람에게 붙는다. 그래서 첫 구문에 리뷰-신발 짝의 SHA-256 지문을 비교하는 SELECT 를 두고, 다르면 서브쿼리 오류로 멈추게 했다. 덤프 → Sync 사이 59초 동안 쓰기가 없었는지도 런북에서 확인했다.
- **옛 칸 정리가 계속 밀렸다(2026-10-21 → 지금).** V3 머리말은 `shoes.liked` · `reviews.liked` 삭제와 `reviews.user_id NOT NULL` 을 "V4"로 미뤘고, V4 는 "V6"으로, V5 는 다시 "V6"으로, V6 은 "V10"으로 미뤘다. V7~V12 가 모두 먼저 필요한 기능이었고(데모 관리자 · 숨김 · 탈퇴 · id · 관리 이력 · 와이드), "한 마이그레이션에 한 목적"이라 끼워 넣지 않았다. 적용된 머리말은 고칠 수 없어서 각 파일에 남은 번호가 서로 다르다 — 지금 남은 일은 4절.
- **V4 주석만 고친 적이 있다(2026-10-29).** 운영 적용 전, 옛 칸 정리를 "V5"로 적었던 주석을 "V6"으로 고쳤다. 아직 어디에도 적용되지 않은 파일이라 가능했다 — 그 뒤로 적용된 파일은 손대지 않는다.
- **`updated_at` 에 `ON UPDATE` 를 쓰지 않았다(V11, 2026-11-01).** 찜 · 평점 셈도 `shoes` 행을 바꾸고, 적재기가 293켤레를 고치면 전부 "최근 수정" 맨 위로 올라와 사람의 수정을 찾을 수 없다. 앱이 관리자 쓰기에서만 찍게 했고, 기존 행은 날짜를 추측하지 않고 NULL 로 뒀다.
- **와이드를 참 · 거짓에서 넷으로(V12, 2026-11-02).** "와이드 있음"이 해외 전용 모델까지 포함해 국내 사용자에게 틀린 안내가 됐다. `wide_available` 을 바꾸지 않고 `wide_scope` 를 더했다 — 추천 화면과 계약 시험이 참 · 거짓을 그대로 쓴다.

#### 4. 남은 한계

- **옛 칸이 남아 있다.** `shoes.weight` · `drop_mm` · `stack_height` · `width` · `liked`, `reviews.liked`. 앱은 앞의 넷에 새 칸과 같은 값을 쓰고, `liked` 는 읽지 않는다. 지우려면 옛 이미지로의 롤백을 포기해야 하므로, 롤백 지점을 정하고 한 번에 정리하는 마이그레이션이 필요하다.
- **NOT NULL 로 조이지 못한 칸.** `line_key` · `generation` · `gender` · `is_current` 는 NULL 허용이다(지금 운영 302행은 모두 값이 있다 — 공개 API 로 센 NULL 0, 적재기 · 관리 화면이 채운다). `reviews.user_id` 도 NULL 허용이다. UNIQUE 는 NULL 을 서로 다르게 보므로 값이 빠진 신발 행은 중복을 막지 못한다.
- **엔티티 주석이 옛 계획을 말한다.** `domain/Shoe.java`(옛 칸 "V6 에서 지운다") · `domain/Review.java`(`liked` "V4 에서 지운다"). 코드 주석이라 고칠 수 있지만 정리 마이그레이션과 함께 고친다.
- **카운터는 앱이 지킨다.** `like_count` · `review_count` · `rating` 이 `likes` · `reviews` 와 어긋나도 DB 가 막지 않는다.
- **`terms.id` 가 키가 아니다.** 시드의 중복(`id 12` 둘)을 재현하려고 `row_no` 를 키로 썼다. 중복은 V17 에서 없앴지만(아웃솔 13, 계약 R03 다시 녹화) 키는 그대로 `row_no` 다. 화면이 직접 가진 와이드 모델 · 안정성 용어(`src/utils/terms.ts`)는 `terms` 로 옮기지 않았다 — 챗봇이 사본을 가지고 평가가 대조한다(2026-11-12 사용자).
- **`chatbot_misses` 는 쌓이기만 한다.** 지우는 일 · 보존 기간이 없다. 쓰는 길이 챗봇 사이드카 하나뿐이라 그대로 두었다.
- **`chatbot_turns` 도 아직 쌓이기만 한다(V19).** 정한 보관(사용자 2026-11-14)은 「행은 두고 질문 · 답만 90일 뒤 빈 글로」지만, Pod 둘이 함께 돌지 않게 하는 잠금(ShedLock)이 없어 그 정리를 아직 켜지 않았다 — `activity_logs` 정리와 함께 켠다(`TODO.md`).
- **`spec_sources` 형식은 DB 가 아니라 API 가 본다.** DB 에 직접 쓰면 형식이 틀린 값이 들어갈 수 있다 — 그래서 운영 쓰기는 관리자 API(적재기 · 관리 화면)로만 한다.

#### 5. 검증 항목

- **빈 DB 에서 V1~V16** — 계약 시험(`contract/run-spring-local.sh v6|v3|v3-search`)이 로컬 dev DB 를 지우고 새 jar 로 처음부터 올린다. 기동 로그의 `Successfully applied` 와 계약 PASS 를 본다.
- **운영 사본에서 새 마이그레이션 하나** — 운영 덤프를 로컬에 복원하고 새 jar 를 띄워 걸린 시간 · 행 수 · FK 를 본다(리허설, 런북마다 기록).
- **스키마 대조** — `ddl-auto validate` 로 엔티티와 스키마가 맞지 않으면 기동이 실패한다.
- **롤백** — 새 스키마에 옛 이미지를 띄워 기동하는지. V4 · V5 리허설에서 옛 운영 jar(`eeffbd8`)를 V5 DB 에 띄워 `Successfully validated` 를 봤다(`catalog-v4-v5.md`).
- 운영 적용 뒤: Pod 로그 `Migrating … → Successfully applied 1 migration … vN`, 공개 API 200, 행 수(신발 · 리뷰 — 직전과 같은지).
