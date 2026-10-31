-- 새 리뷰 · 신발 id 를 DB 가 매긴다(AUTO_INCREMENT, 2026-11-01 사용자) — 앱의 "max + 1"(V1 주석)을 그만둔다.
-- 왜: max + 1 은 JVM 안의 쓰기 잠금으로만 안전했다. 롤링 배포(maxSurge 1)로 Pod 가 둘 겹치는 순간 두 Pod 가 같은 id 를 매겨
--   PK 충돌이 났고, 리뷰는 그 오류가 409 "이미 리뷰를 썼다"로 잘못 보였다.
-- 계약에서 바뀌는 것(의도한 변경, docs/API_CONTRACT.md 1.1):
--   리뷰 — 마지막 행을 지우고 다시 쓰면 지운 id 를 다시 쓰지 않는다(json-server 와 다르다. spring-v3 W46 · W47 이 하나씩 커진다).
--   신발 — 숨김(V8) 뒤로는 행을 지우지 않으므로 max + 1 과 같다. INSERT 가 실패하면 그 번호는 건너뛴다(빈 번호가 생길 수 있다).
--   POST 본문의 id(신발)는 그대로 쓴다 — AUTO_INCREMENT 칸에도 값을 넣을 수 있고, 다음 번호는 그보다 커진다.
-- 다음 번호는 지금 있는 최대값 + 1 에서 시작한다(InnoDB 가 MODIFY 때 정한다). 예전 이미지(max + 1 로 id 를 넣는다)도 그대로 돈다.
-- reviews.id · shoes.id 는 FK(review_likes · likes · reviews.shoe_id · reviews.parent_review_id)가 가리켜 MODIFY 동안만 FK 검사를 끈다 — 타입은 그대로(BIGINT NOT NULL)

SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE reviews MODIFY id BIGINT NOT NULL AUTO_INCREMENT;
ALTER TABLE shoes MODIFY id BIGINT NOT NULL AUTO_INCREMENT;
SET FOREIGN_KEY_CHECKS = 1;
