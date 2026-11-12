-- 아웃솔 용어의 id 를 12 → 13 으로(2026-11-12 사용자, 작업 5-1 — 09_chatbot_rag.md 8절).
-- 시드(V2)에 id 12 가 둘이었다(weight · outsole). json-server 응답을 재현하려고 그대로 두었는데(V1 · 07_database.md 4절),
-- 챗봇이 용어를 id 로 참조하면 둘이 섞인다. 키는 여전히 row_no 다 — id 는 응답에 나가는 값만 바뀐다.
-- 화면은 용어를 term_key 로 찾으므로 바뀌는 것이 없다. /api/terms 응답이 바뀌어 계약 기준(spring-v3 R03)을 다시 녹화했다.

-- ---------------------------------------------------------------------------------------------
-- 0. 가드 — 맨 첫 구문. 아웃솔이 id 12 인 행이 정확히 하나이고, id 13 이 비어 있을 때만 진행한다.
--    누가 먼저 고쳤으면 ERROR 1242(Subquery returns more than 1 row)로 멈추고 아무것도 바꾸지 않는다.
-- ---------------------------------------------------------------------------------------------
SELECT IF(
  (SELECT COUNT(*) FROM terms WHERE term_key = 'outsole') = 1
  AND (SELECT COUNT(*) FROM terms WHERE term_key = 'outsole' AND id = 12) = 1
  AND (SELECT COUNT(*) FROM terms WHERE id = 13) = 0,
  'v17 guard ok',
  (SELECT 'v17 guard: outsole id is not the seed 12' UNION ALL SELECT 'v17 guard: outsole id is not the seed 12')
) AS v17_guard;

-- ---------------------------------------------------------------------------------------------
-- 1. id 만 바꾼다 — 순서(row_no) · 이름 · 설명은 그대로
-- ---------------------------------------------------------------------------------------------
UPDATE terms
   SET id = 13
 WHERE term_key = 'outsole' AND id = 12;
