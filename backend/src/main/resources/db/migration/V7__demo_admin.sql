-- V7 — 데모 관리자(docs/ADMIN_DEMO_DESIGN.md 8.2, 2026-10-29 사용자 — 읽기 전용, 리뷰 · 찜도 막는다).
--   role DEMO_ADMIN(VARCHAR(10)에 꼭 맞다): 관리 화면은 다 보이고 저장 · 삭제 · 리뷰 · 찜은 서버가 403(api/Viewer).
--   계정 하나 — 로그인 화면의 체험 카드(POST /api/auth/demo)로만 들어간다. 비밀번호로는 들어갈 수 없다:
--   password_hash 는 NULL 이 아니라 BCrypt 가 아닌 표식('!demo') — NULL 이면 기동 때 SeedPasswords 가 시드 비밀번호를 채운다
--   (옛 이미지로 롤백해도 그 이미지의 SeedPasswords 가 이 계정을 건드리지 않게).
ALTER TABLE users DROP CHECK ck_users_role;
ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN', 'DEMO_ADMIN'));

INSERT INTO users (email, password_hash, nickname, role, created_at, updated_at)
SELECT 'demo-admin@runshoes.test', '!demo', '데모관리자', 'DEMO_ADMIN', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo-admin@runshoes.test');
