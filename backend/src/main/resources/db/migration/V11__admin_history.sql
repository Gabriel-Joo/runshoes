-- 관리 화면 보강(2026-11-01 사용자) — 최근 수정순 · 바뀐 칸 · 품번 · 영구 삭제 기록. 운영 절차는 infra runbooks/v11-admin-history.md
-- sku         품번(색상 포함, 예 1011C284-400 — 1011C284 모델 · -400 색상). 지금까지 카탈로그 파일에만 있었다. 적재기 · 관리 화면이 채운다
-- updated_at  관리자 등록 · 수정 · 숨김 · 되살리기 때만 앱이 찍는다. ON UPDATE CURRENT_TIMESTAMP 는 쓰지 않는다 — 찜 · 평점 셈이 이 행을 바꾼다.
--             적재기의 수정은 찍지 않는다(293켤레가 맨 위로 올라오면 작업 추적이 깨진다). 기존 행은 NULL — 추측한 날짜로 채우지 않는다
-- last_change 마지막 수정에서 바뀐 칸 이름(API 이름, 예 ["width","price"]) · 등록 ["created"] · 숨김 ["hidden"] · 되살리기 ["restored"]. 값은 넣지 않는다.
--             목록이 활동 로그를 294번 뒤지지 않게 행에 둔다(전체 이력은 activity_logs shoe.create · shoe.update, 180일)
-- shoe_purges 영구 삭제한 신발 — 카탈로그 가져오기(pull-admin)가 읽어 다음 적재에서 다시 넣지 않게 한다. 행이 없으니 FK 가 아니다.
--             활동 로그는 180일 뒤 지워져 이 기록으로 쓰지 않는다
-- 열 추가는 맨 뒤라 MySQL 8 INSTANT — 테이블을 다시 만들지 않는다. 옛 이미지(ddl-auto validate)는 모르는 열 · 테이블을 보지 않는다

ALTER TABLE shoes
  ADD COLUMN sku         VARCHAR(50) NULL,
  ADD COLUMN updated_at  DATETIME(3) NULL,
  ADD COLUMN last_change JSON        NULL;

CREATE TABLE shoe_purges (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  shoe_id       BIGINT       NOT NULL,
  line_key      VARCHAR(100) NULL,
  generation    INT          NULL,
  gender        VARCHAR(10)  NULL,
  brand         VARCHAR(100) NOT NULL,
  model         VARCHAR(200) NOT NULL,
  review_count  INT          NOT NULL,
  like_count    INT          NOT NULL,
  purged_at     DATETIME(3)  NOT NULL,
  purged_by     BIGINT       NULL,
  PRIMARY KEY (id),
  KEY idx_shoe_purges_purged_at (purged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
