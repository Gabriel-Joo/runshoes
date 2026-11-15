-- 챗봇 문의의 처리 사유(2026-11-15 사용자, 관리자 마이페이지 화면 수정 — docs/03_admin.md 1-6).
-- 「무시」한 뒤 같은 이름으로 새 질문이 오면 묶음이 다시 「처리 안 함」으로 돌아오는데, 그때 왜 무시했는지 알 수 없었다.
--   decided_note  처리함 · 무시를 고를 때 적은 사유(선택, 200자 안 — 앱이 400 으로 막는다). 묶음의 줄 전부에 같은 값.
--                 되돌리기(처리 안 함)는 status · decided_at · decided_by 와 함께 비운다
-- 기존 행은 모두 NULL — 추측해 채우지 않는다. 열 추가는 맨 뒤라 MySQL 8 INSTANT(V23 과 같은 꼴).
-- 옛 이미지로 롤백하면 이 칸을 읽지도 쓰지도 않는다(지워지지는 않는다).

ALTER TABLE chatbot_misses
  ADD COLUMN decided_note VARCHAR(200) NULL;
