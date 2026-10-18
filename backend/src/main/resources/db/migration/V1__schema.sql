-- RUNSHOES 스키마 — db.json(json-server 0.17.4)의 shoes · reviews · terms 를 그대로 옮긴다.
-- 정답은 contract/baseline/node(실제 응답)다. 계획서(docs/SPRING_MIGRATION_PLAN.md 2.1)와 다른 곳은 이유를 적었다.
-- 적용된 뒤에는 이 파일을 고치지 않는다(Flyway checksum) — 바꿀 것은 V3 부터.
--
-- id 에 AUTO_INCREMENT 가 없다: json-server 는 새 id 를 "지금 남은 최대값 + 1"로 매긴다 — 마지막 행을 지우면 그 id 를 다시 쓴다
--   (contract 시나리오 48 → 51: 21 을 지우고 다시 POST 하면 21). InnoDB AUTO_INCREMENT 는 지운 값을 다시 쓰지 않으므로 앱이 매긴다.
-- 숫자 스펙(weight · drop · stack_height · price · rating)이 DOUBLE 이다: 등록·수정 폼이 Number(입력값)을 그대로 보내고
--   json-server 는 받은 JSON 숫자를 그대로 저장한다 — INT/DECIMAL 이면 250.5 · 38.55 가 잘려 돌아간다. JSON 숫자와 같은 표현이 DOUBLE 이다.
-- 시간은 UTC. created_at 은 DATETIME(3) — 프런트가 보내는 toISOString()(ms + Z)을 ms 까지 돌려줘야 Date.parse 가 같다.

CREATE TABLE shoes (
  id              BIGINT        NOT NULL,
  brand           VARCHAR(100)  NOT NULL,
  model           VARCHAR(200)  NOT NULL,
  purpose         VARCHAR(50)   NOT NULL,
  stability       VARCHAR(50)   NOT NULL,
  midsole         VARCHAR(100)  NULL,            -- 호카처럼 공개하지 않는 브랜드(id 4)
  weight          DOUBLE        NULL,
  drop_mm         DOUBLE        NULL,            -- JSON 필드 drop — DROP 은 예약어
  stack_height    DOUBLE        NULL,            -- 41.5 등 소수, null 2건
  width           VARCHAR(50)   NOT NULL,
  wide_available  BOOLEAN       NOT NULL,
  carbon          BOOLEAN       NOT NULL,
  price           DOUBLE        NULL,
  image           VARCHAR(500)  NOT NULL,
  images          JSON          NOT NULL,        -- 문자열 배열
  summary         VARCHAR(500)  NOT NULL,
  description     TEXT          NOT NULL,
  rating          DOUBLE        NOT NULL,        -- 프런트가 소수 한 자리로 맞춰 PATCH 한다(4 · 4.6)
  review_count    INT           NOT NULL,
  like_count      INT           NOT NULL,
  liked           BOOLEAN       NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reviews (
  id          BIGINT        NOT NULL,
  shoe_id     BIGINT        NOT NULL,
  author      VARCHAR(100)  NOT NULL,
  rating      INT           NOT NULL,             -- 별점 1~5(화면이 정수만 보낸다)
  content     TEXT          NOT NULL,
  created_at  DATETIME(3)   NOT NULL,             -- UTC. 시드 69건은 날짜만 → 그날 00:00:00.000
  like_count  INT           NULL,                 -- 시드 2건 · 새 리뷰(POST)는 키가 없다 → NULL, 응답에서도 키를 뺀다
  liked       BOOLEAN       NOT NULL DEFAULT FALSE,  -- 시드 92건은 키가 없다 — contract diff 는 없음 = false 로 본다
  PRIMARY KEY (id),
  KEY idx_reviews_shoe_id (shoe_id),
  -- shoe 를 지우면 리뷰도 지운다(json-server getRemovable 과 같다)
  CONSTRAINT fk_reviews_shoe FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- terms: 시드에 id 12 가 둘이다(weight, outsole). 응답(contract 시나리오 03)이 둘 다 id 12 로 나온다 — 그대로 재현한다.
-- 그래서 id 는 키가 아니고, 순서와 키는 row_no 가 맡는다. 계획서는 13 으로 재번호화했지만 기준선과 달라진다.
-- 프런트는 term.key 로만 찾으므로 어느 쪽이든 화면은 같다. 용어는 읽기 전용(프런트에 쓰기 없음).
CREATE TABLE terms (
  row_no       INT           NOT NULL AUTO_INCREMENT,
  id           BIGINT        NOT NULL,
  term_key     VARCHAR(50)   NOT NULL,            -- JSON 필드 key — KEY 는 예약어
  name         VARCHAR(100)  NOT NULL,
  short        VARCHAR(200)  NOT NULL,
  description  TEXT          NOT NULL,
  PRIMARY KEY (row_no),
  KEY idx_terms_id (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
