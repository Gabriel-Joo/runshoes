-- V4 — 신발 세대 구조: 같은 라인을 묶는 line_key, 세대 번호 generation, 현행 여부 is_current,
--   발볼(width) · 와이드(wide_available) NULL 허용, 성별 gender(남녀를 별도 행으로 — 2026-10-21),
--   스펙을 제조사 공시값(official_*)과 실측값(measured_*)으로 나눈다(2026-10-23),
--   발볼을 토박스 너비(toebox_width)로 판정한다(2026-10-23 — 힐 · 미드풋 서술은 쓰지 않는다. 옛 width 는 V6 에서 지운다).
--
-- 공시 · 실측 분리는 "추가 + 복사"다. 옛 weight · drop_mm · stack_height 는 V6 에서 지운다(V4 · V5 가 운영에서 안정된 뒤).
--   RENAME 하지 않는 이유: 옛 이미지로 롤백하면 ddl-auto validate 가 옛 컬럼을 찾는다 — 이름을 바꾸면 기동이 실패한다(V3 때와 같은 이유).
--   V4 뒤 앱(Shoe 엔티티)은 official_* 를 읽고, 쓸 때는 옛 컬럼에도 같은 값을 쓴다 — 롤백하면 옛 이미지가 최신 값을 그대로 본다.
--   적재기(catalog)도 V6 전까지는 두 쪽 모두 쓴다.
-- 설계: docs/CATALOG_PIPELINE.md 3장. 리뷰는 지금처럼 세대별 신발(shoes.id)에 단다 — 이 마이그레이션은 reviews 를 건드리지 않는다.
-- V3 머리말이 "V4"로 미뤄 둔 정리(shoes.liked · reviews.liked 삭제, reviews.user_id NOT NULL)는 V6 으로 간다 — V5 는 정가 메타만 담는다(한 마이그레이션에 한 목적). V3 는 적용돼 고칠 수 없다.
--
-- 세 컬럼 모두 NULL 을 허용한다 — 지금 앱(Shoe 엔티티 · POST /api/shoes)은 이 컬럼을 모른다.
--   NOT NULL 이면 관리 화면의 신발 등록이 INSERT 에서 실패한다. 엔티티 · API 가 세 값을 받게 된 뒤 V6 에서 NOT NULL 로 조인다.
--   옛 이미지(V3 까지 아는 것)로 롤백해도 뜬다: ddl-auto validate 는 늘어난 컬럼을 문제 삼지 않고, 옛 POST 는 NULL 을 넣는다.
-- line_key 는 수집기가 라인 단위로 돌며 별칭 표(catalog/aliases.yaml)에서 붙인다. 모델명을 파싱해 만들지 않는다.
--   아래 20켤레 값도 사람이 정한 표다(파싱 아님).
-- is_current 는 "지금 출시돼 팔리는 가장 새 세대"다(2026-10-21 점검, CATALOG_PIPELINE 부록 A). 새 세대를 넣는 적재기가 옛 행을 FALSE 로 바꾼다.
-- MySQL DDL 은 트랜잭션이 아니다 — 운영 적용 전 mysqldump 를 먼저(런북).

-- ---------------------------------------------------------------------------------------------
-- 0. 가드 — 맨 첫 구문. 신발 20켤레가 시드(id 1~20 의 브랜드 · 모델)와 같을 때만 진행한다.
--    아래 채우기는 id 로 고정 값을 쓴다. 다르면 ERROR 1242(Subquery returns more than 1 row)로 멈추고 DB 는 V3 그대로다.
-- ---------------------------------------------------------------------------------------------
SELECT IF(
  (SELECT COUNT(*) FROM shoes) = 20
  AND (SELECT COUNT(*) FROM shoes WHERE (id, brand, model) IN (
        (1, '아식스', '젤 카야노 32'), (2, '나이키', '페가수스 42'), (3, '호카', '클리프톤 10'), (4, '호카', '본디 9'),
        (5, '아식스', '노바블라스트 5'), (6, '나이키', '알파플라이 3'), (7, '브룩스', '고스트 17'),
        (8, '뉴발란스', '프레시폼 X 880 v15'), (9, '아디다스', '울트라부스트 5'), (10, '사우코니', '엔돌핀 스피드 4'),
        (11, '온', '클라우드몬스터 2'), (12, '아디다스', '아디제로 보스턴 13'), (13, '아식스', '젤 님버스 27'),
        (14, '아디다스', '슈퍼노바 라이즈 3'), (15, '미즈노', '웨이브 라이더 29'), (16, '나이키', '베이퍼플라이 4'),
        (17, '아디다스', '아디제로 아디오스 프로 4'), (18, '살로몬', '스피드크로스 6'), (19, '호카', '스피드고트 6'),
        (20, '아식스', '젤 트라부코 13'))) = 20,
  'v4 guard ok',
  (SELECT 'v4 guard: shoes differ from seed' UNION ALL SELECT 'v4 guard: shoes differ from seed')
) AS v4_guard;

-- ---------------------------------------------------------------------------------------------
-- 1. 컬럼 · 키
--    (line_key, generation) UNIQUE — 한 라인의 한 세대는 한 행. NULL 은 UNIQUE 에서 서로 다르게 취급되므로 아직 값이 없는 행은 막지 않는다.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE shoes
  ADD COLUMN line_key    VARCHAR(100) NULL AFTER model,       -- '<brand>:<line>' 소문자 영문 슬러그(asics:gel-kayano)
  ADD COLUMN generation  INT          NULL AFTER line_key,    -- 세대 번호(v15 → 15). 번호 없이 나온 첫 모델(메가블라스트 등)은 1
  ADD COLUMN is_current  BOOLEAN      NULL AFTER generation,
  -- 성별: 'men' · 'women' · 'unisex'. 같은 라인 · 세대라도 남녀는 스택 · 드롭 · 라스트가 다를 수 있어 별도 행이다.
  --   line_key 는 남녀가 같다(라인을 묶는 키). 이전 · 다음 세대와 is_current 는 같은 성별 안에서 판단한다
  ADD COLUMN gender      VARCHAR(10)  NULL AFTER generation,
  -- 제조사 공시값(2026-10-23) — 지금 수집한 스펙은 모두 여기다. 출처 우선순위 공식몰 · 보도자료 → BITR → RSG(docs/CATALOG_PIPELINE.md)
  --   official_weight_size: 그 무게의 기준 사이즈 'M9' · 'M10.5' · 'W7.5'. NULL = 출처가 사이즈를 밝히지 않음. 비교는 M9 끼리만 한다
  --   official_spec_size  : 스택 · 드롭의 기준 사이즈. 제조사가 거의 밝히지 않아 대부분 NULL 이다 — M9 라고 단정하지 않는다
  --   포어풋 스택은 두지 않는다(힐 - 드롭)
  ADD COLUMN official_weight_g    DOUBLE      NULL AFTER stack_height,
  ADD COLUMN official_weight_size VARCHAR(10) NULL AFTER official_weight_g,
  ADD COLUMN official_heel_mm     DOUBLE      NULL AFTER official_weight_size,
  ADD COLUMN official_drop_mm     DOUBLE      NULL AFTER official_heel_mm,
  ADD COLUMN official_spec_size   VARCHAR(10) NULL AFTER official_drop_mm,
  -- 실측값 — 지금은 쓰지 않는다(모두 NULL). 리뷰어 · 커뮤니티가 잰 값이 들어올 자리
  ADD COLUMN measured_weight_g    DOUBLE       NULL AFTER official_spec_size,
  ADD COLUMN measured_weight_size VARCHAR(10)  NULL AFTER measured_weight_g,
  ADD COLUMN measured_heel_mm     DOUBLE       NULL AFTER measured_weight_size,
  ADD COLUMN measured_drop_mm     DOUBLE       NULL AFTER measured_heel_mm,
  ADD COLUMN measured_source      VARCHAR(255) NULL AFTER measured_drop_mm,
  ADD COLUMN measured_count       INT          NULL AFTER measured_source,
  -- 토박스 너비: '좁음' · '보통' · '넓음', NULL = 근거 없음. 리뷰의 토박스 · 포어풋 서술만 근거다(미드풋은 끈으로 조절되고, 힐은 발볼과 무관하다).
  --   와이드 판(2E · 4E) 여부는 wide_available 이다 — 토박스 근거가 아니다
  ADD COLUMN toebox_width         VARCHAR(50)  NULL AFTER width,
  ADD UNIQUE KEY uk_shoes_line_generation_gender (line_key, generation, gender),
  -- 발볼 · 와이드 판 여부는 모를 수 있다(2026-10-21): NULL = "정보 없음". 기본값('보통' / FALSE)으로 메우지 않는다.
  --   와이드 FALSE 는 리뷰의 "no wide" 명시나 브랜드 글로벌 라인업 확인만 — 국내 공식몰에 없다는 것은 근거가 아니다(2026-10-24, 침묵으로 증명하지 않는다)
  MODIFY COLUMN width          VARCHAR(50) NULL,
  MODIFY COLUMN wide_available BOOLEAN     NULL,
  -- 카본도 모를 수 있다(2026-10-24): NULL = 정보 없음. 출처 면제 항목이지만 근거 없이 FALSE 로 메우지 않는다.
  --   옛 이미지(V3)는 Boolean 으로 읽어 NULL 이어도 뜬다(화면은 카본 배지를 true 일 때만 그린다)
  MODIFY COLUMN carbon         BOOLEAN     NULL;

-- ---------------------------------------------------------------------------------------------
-- 2. 기존 20켤레 채우기 — 지난 세대 12켤레는 is_current = FALSE(새 세대를 새 행으로 넣는다, 리뷰는 그대로 옛 행에 남는다).
--    기존 20켤레는 남성(다나와 남성 기준으로 입력한 값 — 사용자 확인 2026-10-21).
--    스피드크로스 6 은 TRUE: 7 은 가격비교 목록 한 곳에만 보이고 살로몬 공식 확인이 없다(수집 때 다시 본다).
-- ---------------------------------------------------------------------------------------------
UPDATE shoes s
JOIN (
            SELECT  1 AS id, 'asics:gel-kayano'          AS line_key, 32 AS generation, FALSE AS is_current
  UNION ALL SELECT  2, 'nike:pegasus',                42, TRUE
  UNION ALL SELECT  3, 'hoka:clifton',                10, FALSE
  UNION ALL SELECT  4, 'hoka:bondi',                   9, TRUE
  UNION ALL SELECT  5, 'asics:novablast',              5, FALSE
  UNION ALL SELECT  6, 'nike:alphafly',                3, FALSE
  UNION ALL SELECT  7, 'brooks:ghost',                17, FALSE
  UNION ALL SELECT  8, 'newbalance:880',              15, TRUE
  UNION ALL SELECT  9, 'adidas:ultraboost',            5, TRUE
  UNION ALL SELECT 10, 'saucony:endorphin-speed',      4, FALSE
  UNION ALL SELECT 11, 'on:cloudmonster',              2, FALSE
  UNION ALL SELECT 12, 'adidas:adizero-boston',       13, TRUE
  UNION ALL SELECT 13, 'asics:gel-nimbus',            27, FALSE
  UNION ALL SELECT 14, 'adidas:supernova-rise',        3, TRUE
  UNION ALL SELECT 15, 'mizuno:wave-rider',           29, FALSE
  UNION ALL SELECT 16, 'nike:vaporfly',                4, TRUE
  UNION ALL SELECT 17, 'adidas:adizero-adios-pro',     4, FALSE
  UNION ALL SELECT 18, 'salomon:speedcross',           6, TRUE
  UNION ALL SELECT 19, 'hoka:speedgoat',               6, FALSE
  UNION ALL SELECT 20, 'asics:gel-trabuco',           13, FALSE
) v ON v.id = s.id
SET s.line_key = v.line_key, s.generation = v.generation, s.is_current = v.is_current, s.gender = 'men';

-- ---------------------------------------------------------------------------------------------
-- 3. 공시값 복사 — 지금 값을 official_* 로. 기존 20켤레는 다나와를 보며 넣은 값이라 무게 기준 사이즈를 모른다(official_weight_size NULL).
--    출처로 확인한 값으로 바꾸는 것은 적재기 몫이다(catalog — decisions.json 의 사람 판단 포함).
-- ---------------------------------------------------------------------------------------------
UPDATE shoes SET official_weight_g = weight, official_heel_mm = stack_height, official_drop_mm = drop_mm, toebox_width = width;
