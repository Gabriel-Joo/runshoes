-- V5 — 가격 메타: price 는 정가만 담는다(2026-10-28 사용자 — 할인가 · 최저가는 어느 소스에서든 쓰지 않는다).
--   price 는 그대로 두고, 그 정가를 어디서 · 언제 읽었는지를 옆에 둔다.
--   price_source     : '공식몰'(국내 공식 온라인몰) · 'ABC마트'(상품 페이지 메인 표시가). 시드 20켤레처럼 읽은 곳 기록이 없으면 NULL
--   price_checked_at : 읽은 날
--   price_kind       : '정가'(지금은 늘 정가). 다른 값을 받지 않는다
-- 한 마이그레이션에 한 목적(V3 원칙) — V4 가 미뤄 둔 정리(옛 weight · drop_mm · stack_height · width 삭제, line_key · generation · is_current NOT NULL,
--   shoes.liked · reviews.liked 삭제, reviews.user_id NOT NULL)는 여기 넣지 않는다. V4 · V5 가 운영에서 안정된 뒤 V6 으로 간다.
-- 세 컬럼 모두 NULL 허용 — 옛 이미지로 롤백해도 ddl-auto validate 는 늘어난 컬럼을 문제 삼지 않고, 관리 화면 등록은 NULL 을 넣는다.
-- 값은 이 마이그레이션이 채우지 않는다(적재기 catalog/load.mjs 가 쓴다). 기존 price 값도 건드리지 않는다.
ALTER TABLE shoes
  ADD COLUMN price_source     VARCHAR(10) NULL AFTER price,
  ADD COLUMN price_checked_at DATE        NULL AFTER price_source,
  ADD COLUMN price_kind       VARCHAR(10) NULL AFTER price_checked_at;
