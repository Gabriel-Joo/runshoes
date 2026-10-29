-- V9 — 회원 탈퇴(소프트 삭제, 2026-10-30 사용자). 탈퇴하면 앱(auth/AuthService.withdraw)이 한 트랜잭션에서:
--   deleted_at 을 적고, 로그인을 막고(refresh 전부 폐기 · 비밀번호 칸을 BCrypt 가 아닌 표식으로), 리뷰는 남기되 작성자를 "탈퇴 회원"으로,
--   찜은 지운다(신발의 찜 수도 뺀다). 복구는 없다.
--   같은 이메일로 다시 가입할 수 있게 이메일 · 닉네임은 자리표시(withdrawn-<id>@runshoes.invalid · 탈퇴-<id>)로 바꾼다 — UNIQUE 를 비운다.
--   새 계정은 새 id 라 이전 리뷰는 돌아오지 않는다.
-- NULL 허용 · 기존 행은 NULL. 롤백한 옛 이미지에서도 탈퇴 회원은 로그인할 수 없다(이메일 · 비밀번호가 바뀌어 있다).
ALTER TABLE users
  ADD COLUMN deleted_at DATETIME(3) NULL;
