-- V8 — 신발 숨김(소프트 삭제, 2026-10-30 사용자). 관리 화면의 삭제는 행을 지우지 않고 deleted_at 을 적는다.
--   목록 · 상세 · 찜 · 리뷰 쓰기에서 빠진다(domain/Shoe 의 @SQLRestriction). 리뷰 · 찜 행은 DB 에 남는다 — 화면에는 신발과 함께 안 보인다
--   되살리면(관리 화면) 리뷰 · 찜도 그대로 돌아온다. id 는 숨긴 행이 계속 가진다(새 신발은 숨긴 것까지 포함한 max+1).
--   한 라인 · 세대 · 성별 UNIQUE(uk_shoes_line_generation_gender)는 숨긴 행에도 걸린다 — 같은 세대는 새로 넣지 말고 되살린다(409).
-- NULL 허용 · 기존 행은 NULL(보인다). 옛 이미지로 롤백하면 숨긴 신발이 다시 보인다(지워지지는 않는다 — 런북).
ALTER TABLE shoes
  ADD COLUMN deleted_at DATETIME(3) NULL;
