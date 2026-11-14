-- 대시보드(Grafana)가 비교 조합 순위를 세는 뷰(2026-11-14 사용자, 관측 작업 B — docs/07_database.md 1-6절).
-- 비교한 신발 번호는 activity_logs.meta 의 shoeIds 에만 있다. 그런데 meta 에는 다른 이벤트의 닉네임 변경 전후 · 모델 이름 · 바뀐 칸도
-- 들어 있어, 대시보드 읽기 계정(grafana_ro)에 meta 칸을 줄 수 없다. 그래서 compare.view 행의 shoeIds 하나만 꺼낸 뷰를 두고
-- 계정에는 이 뷰의 SELECT 만 준다.
--   id · occurred_at · user_id  activity_logs 그대로(대시보드에 이미 주는 칸)
--   shoe_ids                    meta.shoeIds 만 글로(예: "[2, 16]"). 비교하기는 2~5켤레라 200자 안이다(api/ActivityController)
-- SQL SECURITY DEFINER — 뷰를 만든 계정(Flyway 를 돌리는 앱 계정 runshoes)의 권한으로 밑 표를 읽는다. 그래서 grafana_ro 는
-- activity_logs.meta 권한 없이 이 뷰만 읽는다. 복제본에도 runshoes 계정이 있다(복제본은 mysql 스키마까지 옮겨 채운다 —
-- infra docs/runbooks/mysql-replica.md 2절). 계정이 없으면 뷰를 읽을 때 ERROR 1449 가 난다.
-- 뷰는 행을 담지 않는다 — 표를 바꾸지 않고, 옛 이미지로 롤백해도 그대로 둬도 된다(앱은 이 뷰를 읽지 않는다).

CREATE SQL SECURITY DEFINER VIEW grafana_compare_views AS
SELECT id,
       occurred_at,
       user_id,
       CAST(JSON_EXTRACT(meta, '$.shoeIds') AS CHAR(200)) AS shoe_ids
FROM activity_logs
WHERE event = 'compare.view';
