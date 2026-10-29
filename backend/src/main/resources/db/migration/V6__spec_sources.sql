-- V6 — 스펙 출처: 칸마다 어디서 읽었는지(docs/ADMIN_DEMO_DESIGN.md 6.1, 2026-10-29 사용자 — JSON 칸 하나).
--   {"weight":{"code":"BITR","url":"https://…"},"drop":{"code":"RSG"},"stackHeight":{…},"midsole":{…},"width":{…},"wideAvailable":{…}}
--   code: BITR · RSG · STORE · PR · WEB · MAN(관리 화면에서 고른다) · DB · SX(기존 값에만 — 고를 수 없다). url 은 WEB 은 필수, 나머지는 선택
--   출처로 검색할 일이 없다 — 화면 표시 · 수정 용도. 칸이 늘어도 마이그레이션이 없다. 형식은 API 가 본다(400)
-- 한 마이그레이션에 한 목적 — V4 · V5 머리말이 "V6"이라 적은 옛 칸 정리는 V10 으로 밀린다(V7 데모 관리자 · V8 신발 숨김 · V9 회원 탈퇴가 먼저).
-- NULL 허용 — 옛 이미지로 롤백해도 ddl-auto validate 는 늘어난 컬럼을 문제 삼지 않는다. 값은 적재기(catalog/load.mjs)가 채운다.
ALTER TABLE shoes
  ADD COLUMN spec_sources JSON NULL AFTER price_kind;
