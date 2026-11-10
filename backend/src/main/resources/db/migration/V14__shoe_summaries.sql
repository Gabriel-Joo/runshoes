-- 리뷰 요약을 DB 에 둔다(2026-11-10 사용자, docs/09_chatbot_rag.md 5절). 조회는 이 표만 읽고 Ollama 를 부르지 않는다.
-- 만드는 것은 하루 한 번 CronJob(batch 프로필) — is_stale 인 행만 다시 만든다(summary/SummaryBatch).
--   positive     NULL = 자격(리뷰 3건 이상)은 되지만 아직 만들지 않은 행. 조회는 빈 응답
--   negative     모델이 "없다"고 하면 NULL
--   review_count 만들 때 입력으로 쓴 리뷰 수 — 재생성 조건(±10%)의 기준
--   avg_rating   만들 때 입력으로 쓴 리뷰의 평균 별점, 반올림 전(DOUBLE) — 재생성 조건(±0.3)이 반올림 때문에 흔들리지 않게
--   is_stale     다시 만들어야 한다 — 리뷰 쓰기(summary/SummaryStore.judge) · 배치 시작의 전체 재판단이 세운다
--   generated_at 만든 때(UTC). 30일이 지나면 배치가 stale 로 세운다
-- 리뷰가 3건 미만이 되면 행을 지운다. 신발을 영구 삭제(V11)하면 같이 지워진다(CASCADE).
-- 지금 리뷰가 3건 이상인 보이는 신발은 "아직 만들지 않은" 행으로 넣는다 — 첫 전체 생성이 평소 배치와 같은 길로 돈다.

CREATE TABLE shoe_summaries (
  shoe_id      BIGINT      NOT NULL,
  positive     TEXT        NULL,
  negative     TEXT        NULL,
  review_count INT         NULL,
  avg_rating   DOUBLE      NULL,
  is_stale     BOOLEAN     NOT NULL DEFAULT TRUE,
  generated_at DATETIME(3) NULL,
  PRIMARY KEY (shoe_id),
  KEY idx_shoe_summaries_stale (is_stale),
  CONSTRAINT fk_shoe_summaries_shoe FOREIGN KEY (shoe_id) REFERENCES shoes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO shoe_summaries (shoe_id, is_stale)
SELECT s.id, TRUE
FROM shoes s
WHERE s.deleted_at IS NULL
  AND (SELECT COUNT(*) FROM reviews r WHERE r.shoe_id = s.id) >= 3;
