-- V3 — 로그인: 사용자 · 사용자별 찜 · 리뷰 공감 · refresh token · 활동 로그, 그리고 실사용 후기 자리(컬럼만).
-- 설계: docs/AUTH_DESIGN.md. 추가만 한다 — 지우는 것(shoes.liked · reviews.liked, reviews.user_id NOT NULL)은 V4.
--   옛 이미지(V2 까지 아는 것)로 롤백해도 뜬다: Flyway 는 모르는 future 마이그레이션을 무시하고, ddl-auto validate 는 늘어난 테이블 · 컬럼을 문제 삼지 않는다.
-- MySQL DDL 은 트랜잭션이 아니다 — 가드(0) 뒤에서 실패하면 앞의 것은 남는다. 운영 적용 전 mysqldump 를 먼저, 실패하면 복원(런북).
-- 시간은 UTC(V1 과 같다).

-- ---------------------------------------------------------------------------------------------
-- 0. 가드 — 맨 첫 구문. 아무것도 만들지 않는 SELECT 하나라 실패해도 DB 는 V2 그대로다(실패 기록만 flyway_schema_history 에 남는다).
--    리뷰가 시드(id 1~105, 리뷰-신발 짝)와 같을 때만 진행한다 — 아래 재배분은 리뷰 id 를 고정 목록으로 쓴다.
--    다르면 ERROR 1242(Subquery returns more than 1 row)로 멈춘다 — 그 오류가 이 줄을 가리키면 "리뷰가 시드와 다르다"는 뜻. 복구는 런북.
--    지문 = SHA-256("1:1,2:1,3:2,…") — contract/baseline/node/02.json 에서 계산, 2026-10-21 운영 GET 과 같다.
--    GROUP_CONCAT 은 579바이트(기본 한도 1024 안). 리뷰가 늘어 잘리면 지문이 달라져 역시 멈춘다.
-- ---------------------------------------------------------------------------------------------
SELECT IF(
  COUNT(*) = 105
  AND SHA2(GROUP_CONCAT(CONCAT(id, ':', shoe_id) ORDER BY id SEPARATOR ','), 256) = '166db588ff3f29d0c747f7cf23ce42e9e868f1fcb04fda3f558c84bba6f180d8'
  AND (SELECT author FROM reviews WHERE id = 81) = '회복주전용'
  AND (SELECT author FROM reviews WHERE id = 29) = '회복주전용',
  'v3 guard ok',
  (SELECT 'v3 guard: reviews differ from seed' UNION ALL SELECT 'v3 guard: reviews differ from seed')
) AS v3_guard
FROM reviews;

-- ---------------------------------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------------------------------
-- users — json-server 계약 밖이라 id 는 AUTO_INCREMENT. 닉네임 UNIQUE 는 collation(utf8mb4_unicode_ci)이 대소문자를 같게 본다.
-- password_hash NULL = 아직 비밀번호 없음(로그인 불가). V3 가 넣은 계정은 기동 때 Secret runshoes-auth 의 값으로 채운다(auth/SeedPasswords).
CREATE TABLE users (
  id             BIGINT        NOT NULL AUTO_INCREMENT,
  email          VARCHAR(254)  NOT NULL,            -- 소문자로 저장
  password_hash  VARCHAR(100)  NULL,                -- BCrypt
  nickname       VARCHAR(20)   NOT NULL,            -- 앱 규칙은 2~12자(auth/AuthRules). 칸은 여유 있게
  role           VARCHAR(10)   NOT NULL DEFAULT 'USER',
  created_at     DATETIME(3)   NOT NULL,
  updated_at     DATETIME(3)   NOT NULL,
  last_login_at  DATETIME(3)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  UNIQUE KEY uk_users_nickname (nickname),
  CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- reviews — 작성자 · 실사용 후기(FOLLOWUP) · 인증.
--   author 는 닉네임 스냅샷으로 남긴다(응답 · 화면이 그대로). 닉네임을 바꾸면 앱이 같은 트랜잭션에서 고친다.
--   한 사람이 한 신발에 첫 리뷰(FIRST)는 하나 — first_shoe_id 는 FIRST 일 때만 값이 있어 FOLLOWUP 은 제한에 걸리지 않는다.
--     VIRTUAL 이어야 한다: shoe_id 의 FK 가 ON DELETE CASCADE 라 STORED 생성 컬럼은 만들 수 없다(ERROR 1215).
--   FOLLOWUP 규칙(같은 사람 · 같은 신발의 FIRST 를 가리킨다, 첫 리뷰 30일 뒤부터, 평점에 넣을지)은 앱이 본다.
--     parent_review_id 를 CHECK 에 쓰지 않는 것은 MySQL 이 CASCADE FK 컬럼을 CHECK 에 못 쓰게 해서다.
--   평점 · 리뷰 수는 FIRST 만으로 센다(실사용 후기를 넣을지는 UI 때 정한다 — 계산식만 바꾸면 된다).
ALTER TABLE reviews
  ADD COLUMN user_id           BIGINT        NULL AFTER shoe_id,                 -- V4 에서 NOT NULL. 지금 NULL 인 것은 옛 이미지로 롤백했을 때 POST 가 되게
  ADD COLUMN review_type       VARCHAR(10)   NOT NULL DEFAULT 'FIRST',
  ADD COLUMN parent_review_id  BIGINT        NULL,                               -- FOLLOWUP 이 가리키는 첫 리뷰(FIRST 면 NULL)
  ADD COLUMN distance_km       DOUBLE        NULL,                               -- 누적 거리(선택). 숫자는 V1 처럼 DOUBLE
  ADD COLUMN proof_image_url   VARCHAR(500)  NULL,                               -- 기록 앱 스크린샷(올리기는 아직 없다)
  ADD COLUMN verified          BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN verified_at       DATETIME(3)   NULL,
  ADD COLUMN verified_by       BIGINT        NULL,                               -- 인증한 admin
  ADD COLUMN first_shoe_id     BIGINT        GENERATED ALWAYS AS (IF(review_type = 'FIRST', shoe_id, NULL)) VIRTUAL,
  ADD UNIQUE KEY uk_reviews_user_first_shoe (user_id, first_shoe_id),
  ADD KEY idx_reviews_parent (parent_review_id),
  ADD CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id),
  ADD CONSTRAINT fk_reviews_parent FOREIGN KEY (parent_review_id) REFERENCES reviews (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_reviews_verified_by FOREIGN KEY (verified_by) REFERENCES users (id),
  ADD CONSTRAINT ck_reviews_type CHECK (review_type IN ('FIRST', 'FOLLOWUP')),
  ADD CONSTRAINT ck_reviews_distance CHECK (distance_km IS NULL OR distance_km >= 0);

-- 찜 · 리뷰 공감 — 사용자별. shoes.like_count · reviews.like_count 는 카운터로 남긴다(시드 값이 기준, 누르면 같은 트랜잭션에서 ±1)
CREATE TABLE likes (
  user_id     BIGINT       NOT NULL,
  shoe_id     BIGINT       NOT NULL,
  created_at  DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id, shoe_id),
  KEY idx_likes_shoe (shoe_id),
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_shoe FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE review_likes (
  user_id     BIGINT       NOT NULL,
  review_id   BIGINT       NOT NULL,
  created_at  DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id, review_id),
  KEY idx_review_likes_review (review_id),
  CONSTRAINT fk_review_likes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_review_likes_review FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- refresh token — 원문은 쿠키에만, 여기는 SHA-256. 쓸 때마다 새 토큰(replaced_by), 같은 family 의 바뀐 토큰이 다시 오면 family 전부 폐기
CREATE TABLE refresh_tokens (
  id           BIGINT        NOT NULL AUTO_INCREMENT,
  user_id      BIGINT        NOT NULL,
  token_hash   CHAR(64)      NOT NULL,
  family_id    CHAR(36)      NOT NULL,           -- 로그인 한 번 = family 하나
  issued_at    DATETIME(3)   NOT NULL,
  expires_at   DATETIME(3)   NOT NULL,
  revoked_at   DATETIME(3)   NULL,
  replaced_by  BIGINT        NULL,               -- 이 토큰으로 refresh 해서 새로 준 토큰
  ip           VARCHAR(45)   NULL,
  user_agent   VARCHAR(255)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id),
  KEY idx_refresh_tokens_family (family_id),
  KEY idx_refresh_tokens_expires (expires_at),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 활동 로그 — 인증 이력 · 리뷰 · 찜 쓰기 · 신발 조회 · 비교. 챗봇이 읽는다.
--   event 는 "영역.동작"(auth.login.success …), 시간은 UTC ms, request_id 로 나중의 Loki 로그(같은 필드 이름의 JSON 한 줄)와 잇는다
--   로그인 · 가입 시도 제한도 여기서 센다(Redis 없이) — idx_activity_logs_ip · idx_activity_logs_event
CREATE TABLE activity_logs (
  id           BIGINT        NOT NULL AUTO_INCREMENT,
  occurred_at  DATETIME(3)   NOT NULL,
  user_id      BIGINT        NULL,               -- 로그인 실패 · 비로그인은 NULL
  event        VARCHAR(50)   NOT NULL,
  target_type  VARCHAR(20)   NULL,               -- shoe · review · user
  target_id    BIGINT        NULL,
  meta         JSON          NULL,               -- 예: {"shoeIds":[2,16]}, 로그인 실패의 {"email":"…"}
  ip           VARCHAR(45)   NULL,
  user_agent   VARCHAR(255)  NULL,
  request_id   VARCHAR(64)   NULL,
  PRIMARY KEY (id),
  KEY idx_activity_logs_user (user_id, occurred_at),
  KEY idx_activity_logs_event (event, occurred_at),
  KEY idx_activity_logs_ip (ip, occurred_at),
  CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------------------------
-- 2. 데이터
-- ---------------------------------------------------------------------------------------------
-- 사용자 30명(리뷰 작성자) + admin. 이메일은 닉네임과 상관없이 번호로(.test 는 메일이 나가지 않는 예약 도메인)
INSERT INTO users (id, email, nickname, role, created_at, updated_at) VALUES
  (1, 'runner01@runshoes.test', '산길10년차', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (2, 'runner02@runshoes.test', '산악울트라', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (3, 'runner03@runshoes.test', '트레일새내기', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (4, 'runner04@runshoes.test', '빗길러너', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (5, 'runner05@runshoes.test', '주말산행런', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (6, 'runner06@runshoes.test', '로드에서산으로', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (7, 'runner07@runshoes.test', '서브3향해', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (8, 'runner08@runshoes.test', '하프PB도전', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (9, 'runner09@runshoes.test', '10K기록단축', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (10, 'runner10@runshoes.test', '서브4가목표', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (11, 'runner11@runshoes.test', '템포는못참지', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (12, 'runner12@runshoes.test', '트랙한바퀴', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (13, 'runner13@runshoes.test', '인터벌입문', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (14, 'runner14@runshoes.test', '페이스업', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (15, 'runner15@runshoes.test', '발볼4E', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (16, 'runner16@runshoes.test', '반사이즈업', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (17, 'runner17@runshoes.test', '넓은발고민', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (18, 'runner18@runshoes.test', '과내전주의', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (19, 'runner19@runshoes.test', '무릎소중', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (20, 'runner20@runshoes.test', '평발러너', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (21, 'runner21@runshoes.test', '한우물러너', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (22, 'runner22@runshoes.test', '20년차러너', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (23, 'runner23@runshoes.test', '삼선러버', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (24, 'runner24@runshoes.test', '룩북러너', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (25, 'runner25@runshoes.test', '가성비탐험가', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (26, 'runner26@runshoes.test', '런린이일기', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (27, 'runner27@runshoes.test', '퇴근후한바퀴', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (28, 'runner28@runshoes.test', '회복주는천천히', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (29, 'runner29@runshoes.test', '매일5K', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (30, 'runner30@runshoes.test', '느긋한LSD', 'USER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (31, 'admin@runshoes.test', '관리자', 'ADMIN', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));

-- 회복주전용이 8번 신발에 쓴 두 건 중 #81 을 지운다 — #29(300g · 쿠션 · 회복주)가 말하는 것을 정보를 덜 담아 되풀이한다
DELETE FROM reviews WHERE id = 81;

-- 작성자 재배분 — 리뷰-신발 짝은 그대로, 작성자만. 성격(뒤의 주석)이 리뷰 내용과 어긋나지 않게 묶었다. 한 사람이 같은 신발에 두 번 가지 않는다(uk_reviews_user_first_shoe 가 지킨다)
UPDATE reviews SET user_id = 1 WHERE id IN (61, 65, 68);   -- 산길10년차: 트레일 경력이 길고 세대 비교를 한다
UPDATE reviews SET user_id = 2 WHERE id IN (63, 60, 8);   -- 산악울트라: 50K 트레일 · 진흙길 · 로드 장거리
UPDATE reviews SET user_id = 3 WHERE id IN (96, 98, 101);   -- 트레일새내기: 산길 입문
UPDATE reviews SET user_id = 4 WHERE id IN (64, 59, 42, 99);   -- 빗길러너: 젖은 노면 · 바위 접지를 따진다
UPDATE reviews SET user_id = 5 WHERE id IN (97, 100, 66);   -- 주말산행런: 주말 산길, 발볼 좁은 편
UPDATE reviews SET user_id = 6 WHERE id IN (67, 62, 103);   -- 로드에서산으로: 로드에서 트레일로 옮기는 중, 아쉬운 점을 솔직히 쓴다
UPDATE reviews SET user_id = 7 WHERE id IN (23, 93, 57, 18);   -- 서브3향해: 풀코스 서브3 · 카본 레이스화
UPDATE reviews SET user_id = 8 WHERE id IN (53, 34, 40, 94);   -- 하프PB도전: 하프 기록 · 레이스와 훈련 겸용
UPDATE reviews SET user_id = 9 WHERE id IN (75, 56, 58, 74);   -- 10K기록단축: 10K 기록 · 카본 비교
UPDATE reviews SET user_id = 10 WHERE id IN (11, 71, 90, 79);   -- 서브4가목표: 대회 준비 중인 마라토너
UPDATE reviews SET user_id = 11 WHERE id IN (21, 33, 87, 37);   -- 템포는못참지: 템포런 · 반발을 좋아하고 물렁한 신발을 싫어한다
UPDATE reviews SET user_id = 12 WHERE id IN (22, 84, 85);   -- 트랙한바퀴: 인터벌 · 트랙 훈련
UPDATE reviews SET user_id = 13 WHERE id IN (9, 24, 36);   -- 인터벌입문: 템포 입문 → 첫 카본이 버거웠고 → 카본 전 단계를 알게 됨(날짜 순)
UPDATE reviews SET user_id = 14 WHERE id IN (10, 27, 7, 44);   -- 페이스업: 조깅화도 페이스를 올려 보고 판단한다
UPDATE reviews SET user_id = 15 WHERE id IN (2, 25, 19, 39);   -- 발볼4E: 와이드(4E)를 찾는다
UPDATE reviews SET user_id = 16 WHERE id IN (55, 35, 76, 102);   -- 반사이즈업: 발볼이 넓어 늘 반 사이즈 크게 산다
UPDATE reviews SET user_id = 17 WHERE id IN (78, 52, 49, 41);   -- 넓은발고민: 발볼 넓은 편 · 사이즈 조언
UPDATE reviews SET user_id = 18 WHERE id IN (12);   -- 과내전주의: 과내전이 심해 안정화만 신는다(안정화는 카야노뿐 → 한 건)
UPDATE reviews SET user_id = 19 WHERE id IN (72, 6, 46, 51);   -- 무릎소중: 무릎 · 체중 부담, 쿠션과 안정감 위주
UPDATE reviews SET user_id = 20 WHERE id IN (1, 16, 91);   -- 평발러너: 평발 · 족저근막염, 안정감
UPDATE reviews SET user_id = 21 WHERE id IN (15, 54);   -- 한우물러너: 한 모델을 오래 신는다(나이키)
UPDATE reviews SET user_id = 22 WHERE id IN (50, 45, 28, 32);   -- 20년차러너: 오래 달려 이전 세대와 비교한다
UPDATE reviews SET user_id = 23 WHERE id IN (82, 95, 89);   -- 삼선러버: 아디다스를 좋아한다
UPDATE reviews SET user_id = 24 WHERE id IN (31, 69, 86, 70);   -- 룩북러너: 디자인을 먼저 본다, 짧고 들뜬 후기
UPDATE reviews SET user_id = 25 WHERE id IN (38, 47, 80, 104);   -- 가성비탐험가: 가격 · 무게 · 내구성을 따진다
UPDATE reviews SET user_id = 26 WHERE id IN (14, 17, 105);   -- 런린이일기: 첫 러닝화부터 몇 달째, 들뜬 후기
UPDATE reviews SET user_id = 27 WHERE id IN (20, 83, 26, 3);   -- 퇴근후한바퀴: 출퇴근 · 일상 겸용
UPDATE reviews SET user_id = 28 WHERE id IN (5, 29, 13, 88);   -- 회복주는천천히: 회복주 · 느린 장거리
UPDATE reviews SET user_id = 29 WHERE id IN (77, 48, 4, 30);   -- 매일5K: 매일 짧게, 무게에 민감
UPDATE reviews SET user_id = 30 WHERE id IN (73, 92, 43);   -- 느긋한LSD: 느린 장거리
UPDATE reviews r JOIN users u ON u.id = r.user_id SET r.author = u.nickname;

-- 8번 신발 — 숫자를 박지 않고 남은 리뷰로 다시 센다(#81 이 빠져 5건 · 4.4 → 4건 · 4.3이 나온다).
--   지금까지 평점은 프런트가 계산해 PATCH 했다(ShoeList · Best · Recommend). 2단계에서 서버 계산(리뷰를 쓸 때마다 FIRST 만, 소수 한 자리)으로 바꾼다 —
--   여기와 같은 식이어야 한다: AVG(INT) 는 DECIMAL 이라 ROUND 가 0.5 를 올린다(프런트의 Math.round(x*10)/10 과 같다)
UPDATE shoes s
  JOIN (SELECT shoe_id, COUNT(*) AS n, ROUND(AVG(rating), 1) AS avg_rating FROM reviews WHERE review_type = 'FIRST' AND shoe_id = 8 GROUP BY shoe_id) x
    ON x.shoe_id = s.id
   SET s.review_count = x.n, s.rating = x.avg_rating;

-- 지금의 공용 찜 · 공감(한 칸 BOOLEAN)은 admin 몫으로. 숫자(like_count)는 이미 들어 있으니 그대로
INSERT INTO likes (user_id, shoe_id, created_at)
SELECT 31, id, UTC_TIMESTAMP(3) FROM shoes WHERE liked = TRUE;
INSERT INTO review_likes (user_id, review_id, created_at)
SELECT 31, id, UTC_TIMESTAMP(3) FROM reviews WHERE liked = TRUE;

-- 끝 가드 — 리뷰 104건 모두 작성자가 정해졌는지. 여기서 멈추면 위의 것은 이미 바뀌었다 — 백업에서 복원(런북)
SELECT IF(COUNT(*) = 104 AND SUM(user_id IS NULL) = 0, 'v3 end guard ok',
  (SELECT 'v3 end guard: review without user' UNION ALL SELECT 'v3 end guard: review without user')) AS v3_end_guard
FROM reviews;
