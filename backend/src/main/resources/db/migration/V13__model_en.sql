-- 영어 이름 · 검색용 다른 표기(2026-11-03 사용자) — 공식몰은 "SC 페이서"라 쓰는데 우리는 "슈퍼컴프 페이서"라 검색이 안 됐다.
-- model_en     화면에 작게 보이는 영어 이름 하나 — 공식몰 상품명의 전체 이름(예: FuelCell SuperComp Elite v6). 못 찾으면 카탈로그의 영어 라인 이름
-- model_alias  검색에만 쓰는 다른 표기, 쉼표로 나눈다(예: SC Elite v6, 퓨어셀). 화면에 보이지 않는다 — 규칙으로 만든다(catalog 01c)
-- 기존 행은 NULL — 적재가 채운다. 열 추가는 맨 뒤라 MySQL 8 INSTANT(V12 와 같다)

ALTER TABLE shoes
  ADD COLUMN model_en VARCHAR(100) NULL,
  ADD COLUMN model_alias VARCHAR(255) NULL;
