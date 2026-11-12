-- 챗봇이 찾지 못한 신발 · 용어(2026-11-12 사용자, 작업 5-1 — 09_chatbot_rag.md 9절 "없는 신발 문의는 로그로 남겨 관리 화면에").
-- 다음에 무엇을 수집할지 알려 주는 자료다. Pod 로그는 재시작하면 사라져 쌓이지 않으므로 표에 둔다.
--   kind       'shoe'(등록되지 않은 신발) · 'term'(사전에 없는 용어)
--   query      챗봇이 문장에서 뽑은 이름 · 용어 — 관리 화면이 이것으로 묶어 센다
--   message    사용자가 보낸 원문(그대로, 300자에서 자른다)
--   created_at 받은 때(UTC)
-- 쓰는 길은 챗봇 사이드카의 내부 POST 하나뿐이다(같은 Pod 의 127.0.0.1 — api/ChatbotMissController). 누가 물었는지는 남기지 않는다.

CREATE TABLE chatbot_misses (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  kind       VARCHAR(8)   NOT NULL,
  query      VARCHAR(100) NOT NULL,
  message    VARCHAR(300) NOT NULL,
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_chatbot_misses_created (created_at),
  CONSTRAINT chk_chatbot_misses_kind CHECK (kind IN ('shoe', 'term'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
