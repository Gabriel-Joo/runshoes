-- 무게를 270mm(US M9)로 맞춘 값(2026-11-10 사용자, 09_chatbot_rag.md 4절 · 환산 규칙 01a_catalog_sources.md 1-3a).
-- 공시 무게의 기준 사이즈가 신발마다 달라(M8.5 · M9 · M9.5 · M10 · M10.5) 비교하기가 M9 만 줄 세웠다 — 이 값으로 줄 세운다.
-- 반 사이즈당 2.6%(RunRepeat 실측 중앙값). 공시값(official_weight_g)에서만 — 실측(measured_weight_g)은 넣지 않는다.
-- 기준이 비었거나 다섯 값 밖이면 NULL(= 기준 모름). 반올림하지 않는다 — 화면이 반올림한다.
-- 생성 컬럼인 까닭: 무게가 바뀌는 길이 셋(관리 화면 · 적재기 · SQL)이라, 따로 저장하면 한 길만 빠뜨려도 어긋난다.
-- VIRTUAL 이라 행을 다시 쓰지 않는다(맨 뒤 추가 — MySQL 8 INSTANT).

ALTER TABLE shoes
  ADD COLUMN weight_norm_270 DOUBLE GENERATED ALWAYS AS (
    CASE official_weight_size
      WHEN 'M8.5'  THEN official_weight_g * 1.026
      WHEN 'M9'    THEN official_weight_g
      WHEN 'M9.5'  THEN official_weight_g / 1.026
      WHEN 'M10'   THEN official_weight_g / (1.026 * 1.026)
      WHEN 'M10.5' THEN official_weight_g / (1.026 * 1.026 * 1.026)
    END) VIRTUAL;
