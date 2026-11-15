-- 챗봇 문의의 처리 상태(2026-11-14 사용자, 관리자 마이페이지 4 — docs/03_admin.md 1-6). 없으면 목록이 쌓이기만 한다.
-- chatbot_misses(V18)는 질문 한 번에 한 줄이고 관리 화면은 (kind, query)로 묶어 본다. 처리는 묶음 단위로 하되 줄마다 적는다 —
-- 처리한 뒤 같은 이름으로 새 질문이 오면 그 줄은 NULL(새로 옴)이라 묶음이 다시 「처리 안 함」으로 보인다.
--   status      NULL 처리 안 함 · 'done' 처리함(등록 · 사전 추가 · 신발 수정) · 'ignored' 무시. 값은 앱이 본다
--               (CHECK 를 더하면 표를 다시 쓴다 — INSTANT 로 끝내려고 두지 않는다)
--   decided_at  처리 · 무시를 고른 때(UTC)
--   decided_by  고른 관리자 users.id. FK 를 두지 않는다(V19 user_id 와 같다 — 기록이 계정 행 때문에 실패하지 않게)
-- 기존 행은 모두 NULL(처리 안 함) — 추측해 채우지 않는다. 열 추가는 맨 뒤라 MySQL 8 INSTANT.
-- 옛 이미지로 롤백하면 상태를 보지 않고 모든 묶음을 예전처럼 보인다(지워지지는 않는다).

ALTER TABLE chatbot_misses
  ADD COLUMN status     VARCHAR(10) NULL,
  ADD COLUMN decided_at DATETIME(3) NULL,
  ADD COLUMN decided_by BIGINT      NULL;
