> 상태: 운영에서 쓰는 중(2026-11-02). 운영 MySQL 은 V13 까지 적용됐다(11-03) — 신발 310켤레 · 리뷰 1,800건(2026-11-09 시드 리뷰 다시 만들기 — `01e_seed_reviews.md`, 공개 API `GET /api/shoes` · `/api/reviews` 로 센 수). 원천: `backend/src/main/resources/db/migration/V1~V13` · `domain/*.java` · 로컬 dev DB(V1~V13)의 `information_schema`

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
| `terms` | 6 | 용어 설명(읽기 전용). `row_no` 가 키 — 시드에 `id 12` 가 둘이다 |

- 키 · 제약
  - `uk_shoes_line_generation_gender(line_key, generation, gender)` — 한 라인의 한 세대 · 한 성별은 한 행. 숨긴 행에도 걸린다(같은 세대는 새로 넣지 않고 되살린다, 409).
  - `uk_reviews_user_first_shoe(user_id, first_shoe_id)` — 한 사람이 한 신발에 첫 리뷰는 하나. `first_shoe_id` 는 FIRST 일 때만 값이 있는 VIRTUAL 생성 칸이라 FOLLOWUP 은 걸리지 않는다.
  - `uk_users_email` · `uk_users_nickname`(collation 이 대소문자를 같게 본다) · `uk_refresh_tokens_hash`.
  - FK 10개. 신발 · 리뷰를 가리키는 것(`likes` · `review_likes` · `reviews.shoe_id` · `reviews.parent_review_id`)은 `ON DELETE CASCADE` — 영구 삭제 때 함께 지워진다. `activity_logs.user_id` 는 `SET NULL`, `reviews.user_id` 는 막는다(탈퇴는 행을 지우지 않는다).
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

#### 1-4. 마이그레이션 V1~V13

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

운영 적용 날짜는 KST 다(런북 실행 기록의 시각은 UTC). 걸린 시간은 infra 런북의 실행 기록(`auth-v3.md` · `catalog-v4-v5.md` · `admin-demo-v6-v9.md` · `v10-auto-increment.md` · `v11-admin-history.md` · `v12-wide-scope.md` · `v13-model-en.md`)에 있다. 절차는 `06_deployment.md`.

#### 1-5. 마이그레이션을 쓰는 규칙

- **적용된 파일은 한 글자도 고치지 않는다** — Flyway 체크섬이 달라져 앱이 뜨지 않는다. 주석이 틀렸어도 다음 번호에서 바로잡는다.
- **추가만 한다.** 칸 이름을 바꾸거나 지우지 않는다. 새 칸은 NULL 허용으로, 맨 뒤에 붙인다(MySQL 8 INSTANT — 테이블을 다시 만들지 않는다).
  - 옛 이미지로 롤백해도 뜬다: Flyway 는 모르는 새 마이그레이션을 무시하고, `ddl-auto validate` 는 늘어난 칸 · 테이블을 문제 삼지 않는다.
- **한 마이그레이션에 한 목적.**
- **기존 행을 추측으로 채우지 않는다.** 새 칸의 기존 값은 NULL 로 두고 적재기 · 관리 화면이 채운다(V5 · V6 · V11 · V12).
- 기존 데이터를 고정 값으로 고치는 마이그레이션(V3 · V4)은 **맨 첫 구문에 가드**를 둔다 — 운영 데이터가 시드와 같을 때만 진행하고, 다르면 `ERROR 1242` 로 아무것도 바꾸기 전에 멈춘다.
- MySQL DDL 은 트랜잭션이 아니다 — 운영 적용 전에 `mysqldump` 를 먼저 뜬다(런북).

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
- **`terms.id` 가 키가 아니다.** 시드의 중복(`id 12` 둘)을 재현하려고 `row_no` 를 키로 썼다. 용어는 읽기 전용이라 실제 문제는 없다.
- **`spec_sources` 형식은 DB 가 아니라 API 가 본다.** DB 에 직접 쓰면 형식이 틀린 값이 들어갈 수 있다 — 그래서 운영 쓰기는 관리자 API(적재기 · 관리 화면)로만 한다.

#### 5. 검증 항목

- **빈 DB 에서 V1~V13** — 계약 시험(`contract/run-spring-local.sh v6|v3|v3-search`)이 로컬 dev DB 를 지우고 새 jar 로 처음부터 올린다. 기동 로그의 `Successfully applied` 와 계약 PASS 를 본다.
- **운영 사본에서 새 마이그레이션 하나** — 운영 덤프를 로컬에 복원하고 새 jar 를 띄워 걸린 시간 · 행 수 · FK 를 본다(리허설, 런북마다 기록).
- **스키마 대조** — `ddl-auto validate` 로 엔티티와 스키마가 맞지 않으면 기동이 실패한다.
- **롤백** — 새 스키마에 옛 이미지를 띄워 기동하는지. V4 · V5 리허설에서 옛 운영 jar(`eeffbd8`)를 V5 DB 에 띄워 `Successfully validated` 를 봤다(`catalog-v4-v5.md`).
- 운영 적용 뒤: Pod 로그 `Migrating … → Successfully applied 1 migration … vN`, 공개 API 200, 행 수(신발 · 리뷰 — 직전과 같은지).

#### 다음에 할 일

- 옛 칸 정리 마이그레이션 — 롤백 지점을 정한 뒤 옛 칸 삭제 · `liked` 삭제 · NOT NULL 조이기를 한 번에. 엔티티의 `legacy*` 와 주석도 같이 지운다.
- **`terms` 의 `id 12` 중복(무게 · 아웃솔)** — 다음 V14 에 같이 고친다(2026-11-03 사용자). 화면 영향은 없지만 이상하다. 아웃솔에 새 id 를 주면 `/api/terms` 응답이 바뀌니 계약 기준 응답(`contract/baseline`)도 다시 녹화한다. 같은 때 화면이 직접 가진 와이드 모델 용어(`ShoeModal WIDE_TERM`)를 `terms` 로 옮길지 정한다.
