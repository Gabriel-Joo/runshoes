-- 요약 배치(매일 CronJob, summary/SummaryBatch)의 실행 기록(2026-11-14 사용자, 관측 작업 — docs/09_chatbot_rag.md 5절 「실행 기록」).
-- 몇 분 걸렸는지 · 몇 켤레 만들었는지 · 실패했는지가 지금은 Pod 로그 한 줄에만 있어, CronJob Pod 가 지워지면 아무도 모른다.
-- shoe_summaries.generated_at 은 켤레마다 마지막으로 만든 때 하나라 다시 만들면 덮이고, 실패한 시각 · 까닭은 남지 않는다.
-- 배치(Spring, 같은 DB)가 바로 쓴다. 기록이 실패해도 배치(요약 만들기)는 끝까지 돈다 — summary/BatchRunLog.
--
-- summary_batch_runs  한 실행 한 줄. 시작할 때 넣고(result 'running') 끝날 때 고친다
--   result       running(도는 중 — 끝나지 않고 남았으면 프로세스가 중간에 죽은 것) · ran(돌았다) ·
--                skipped(다른 요약 배치가 돌고 있어 하지 않음) · error(배치가 예외로 멈춤)
--   started_at · finished_at  UTC
--   target       만들 신발 수(stale) · ok 만든 수(다시 stale 포함) · failed 실패 수 ·
--   restaled     만든 직후 리뷰가 바뀌어 다시 stale 이 된 수 · gone 그 사이 리뷰가 3건 미만이 되어 지운 수. ran 일 때만 값이 있다
--   duration_ms  시작부터 끝까지
--   error        error 일 때 까닭(500자에서 자른다)
-- summary_batch_failures  만들지 못한 켤레 한 줄(그 켤레는 stale 로 남아 다음 회차가 다시 만든다)
--   shoe_id 에 FK 를 두지 않는다 — 신발을 영구 삭제해도(V11) 지난 실패 기록은 남긴다
--   reason   실패 까닭(Ollama 연결 · 시간 초과 · 응답 형식 …, 300자에서 자른다)
-- 지우는 일은 없다 — 하루 한 줄 + 실패 몇 줄이라 쌓여도 작다.

CREATE TABLE summary_batch_runs (
  run_id      BIGINT       NOT NULL AUTO_INCREMENT,
  started_at  DATETIME(3)  NOT NULL,
  finished_at DATETIME(3)  NULL,
  result      VARCHAR(10)  NOT NULL,
  target      INT          NULL,
  ok          INT          NULL,
  failed      INT          NULL,
  restaled    INT          NULL,
  gone        INT          NULL,
  duration_ms BIGINT       NULL,
  error       VARCHAR(500) NULL,
  PRIMARY KEY (run_id),
  KEY idx_summary_batch_runs_started (started_at),
  CONSTRAINT chk_summary_batch_runs_result CHECK (result IN ('running', 'ran', 'skipped', 'error'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE summary_batch_failures (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  run_id     BIGINT       NOT NULL,
  shoe_id    BIGINT       NOT NULL,
  reason     VARCHAR(300) NOT NULL,
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_summary_batch_failures_shoe (shoe_id),
  CONSTRAINT fk_summary_batch_failures_run FOREIGN KEY (run_id) REFERENCES summary_batch_runs (run_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
