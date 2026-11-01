-- 와이드 모델 넷으로(2026-11-02 사용자) — 있음 · 국외에만 있음 · 없음 · 정보 없음.
-- wide_scope  와이드가 있을 때(wide_available = TRUE) 어디에 나오나: 'domestic' 국내에 나온다 · 'overseas' 해외에만 있다(국내 미출시).
--             wide_available 은 그대로 둔다(와이드가 어디에든 있으면 TRUE) — 추천의 "와이드 모델이 따로 있어요"와 계약 시험이 참 · 거짓을 쓴다.
--             FALSE(없음) · NULL(정보 없음)이면 이 칸도 NULL. 기존 행은 NULL — 국내인지 해외인지 추측해 채우지 않는다(재조사가 채운다)
-- 열 추가는 맨 뒤라 MySQL 8 INSTANT — 테이블을 다시 만들지 않는다. 옛 이미지(ddl-auto validate)는 모르는 열을 보지 않는다

ALTER TABLE shoes
  ADD COLUMN wide_scope VARCHAR(10) NULL;
