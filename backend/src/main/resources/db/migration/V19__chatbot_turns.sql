-- 챗봇 대화 한 턴에 한 줄(2026-11-14 사용자, 관측 바닥 깔기 A-1 — docs/09_chatbot_rag.md 18절).
-- 챗봇이 어떻게 쓰이고 얼마나 걸리는지를 대시보드(Grafana)가 읽으려고 둔다. Pod 로그는 재시작하면 사라진다.
--   turn_id        한 줄의 id
--   conn_id        한 대화를 묶는 id — 웹소켓 연결마다 챗봇이 만드는 무작위 값(uuid4 32자). 토큰 · 계정에서 만들지 않는다
--   user_id        로그인 확인(GET /api/me)의 계정 id. 계정이지 사람이 아니다 — 체험 계정 31개를 여러 사람이 함께 쓴다.
--                  FK 를 두지 않는다(기록이 계정 행 때문에 실패하지 않게, 계정은 지우지 않고 숨긴다 — V9)
--   created_at     턴이 끝나 기록을 받은 때(UTC)
--   question       사용자가 보낸 글(챗봇이 500자에서 자른다)
--   answer         챗봇이 보낸 답 글. 턴이 예외로 끝났으면 빈 글(branch 'error')
--     question · answer 는 대시보드 읽기 계정에 주지 않는다 — 컬럼 단위 권한으로 가른다(A-3). 그래서 같은 테이블에 둔다
--   branch         갈래 — term · spec · compare · recommend · explain · experience · out_of_scope · greeting(라우터),
--                  choose(같은 이름이 여러 라인이라 되물음) · no_shoe(등록되지 않은 신발) · error(턴이 예외로 끝남).
--                  CHECK 를 두지 않는다 — 챗봇에 갈래가 늘 때 기록이 실패하지 않게(값은 Spring 이 길이만 본다)
--   by_rule        규칙이 갈래를 정했나(거짓이면 라우터 LLM). 라우터를 거치지 않은 턴(되물은 뒤 "네")은 NULL
--   llm_ok         라우터 LLM 이 제대로 된 JSON 을 줬나. 라우터를 거치지 않은 턴은 NULL
--   health         통증 · 몸 이야기 질문인가(전문의 안내를 붙였나)
--   fallback_used  생성 검사에 걸려 코드가 쓴 답을 냈나
--   shoe_count     답에 버튼을 붙인 신발 수
--   latency_ms     챗봇이 턴을 받아 답을 만들기까지(웹소켓 전송 제외)
--   router_ms · search_ms · gen_ms  라우터 · 검색(임베딩 · 색인) · 생성 LLM 단계
--   catalog_ms · compare_ms · recommend_ms · review_ms · summary_ms  Spring API 읽기 — 카탈로그(/api/shoes · /api/terms) · 비교 ·
--                  추천 · 리뷰 · 요약. 어느 API 가 느린지 보려고 API 마다 칸을 둔다(사용자 2026-11-14)
--     그 턴에 쓰지 않은 단계는 0. 단계 칸을 모두 더하면 latency_ms 와 몇 ms 안에서 맞는다 — 남는 것은 이름 찾기 · 검사 같은
--     파이썬 코드뿐이라 칸을 두지 않는다(chatbot/timing.py)
-- 쓰는 길은 챗봇 사이드카의 내부 POST 하나뿐이다(같은 Pod 의 127.0.0.1 — api/ChatbotTurnController, V18 과 같은 방식).
-- 보관(사용자 2026-11-14): 행은 지우지 않는다. 숫자 칸은 계속 두고, question · answer 만 90일 뒤 빈 글로 바꾼다.
-- 그 정리는 아직 켜지 않는다 — Pod 둘이 함께 돌지 않게 하는 잠금(ShedLock)이 없어서다(activity_logs 정리와 같은 까닭).
-- ShedLock 을 붙일 때 함께 켠다(docs/TODO.md). created_at 색인은 그 정리가 쓴다.

CREATE TABLE chatbot_turns (
  turn_id       BIGINT       NOT NULL AUTO_INCREMENT,
  conn_id       CHAR(32)     NOT NULL,
  user_id       BIGINT       NULL,
  created_at    DATETIME(3)  NOT NULL,
  question      VARCHAR(500) NOT NULL,
  answer        TEXT         NOT NULL,
  branch        VARCHAR(20)  NOT NULL,
  by_rule       BOOLEAN      NULL,
  llm_ok        BOOLEAN      NULL,
  health        BOOLEAN      NULL,
  fallback_used BOOLEAN      NOT NULL,
  shoe_count    SMALLINT     NOT NULL,
  latency_ms    INT          NOT NULL,
  router_ms     INT          NOT NULL,
  search_ms     INT          NOT NULL,
  gen_ms        INT          NOT NULL,
  catalog_ms    INT          NOT NULL,
  compare_ms    INT          NOT NULL,
  recommend_ms  INT          NOT NULL,
  review_ms     INT          NOT NULL,
  summary_ms    INT          NOT NULL,
  PRIMARY KEY (turn_id),
  KEY idx_chatbot_turns_created (created_at),
  KEY idx_chatbot_turns_conn (conn_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
