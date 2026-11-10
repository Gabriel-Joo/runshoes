# 작업 3 — 비교 · 추천 계산을 서버 API 로 — 2026-11-10

세션: worktree `cc/runshoes-3`. 설계 `docs/09_chatbot_rag.md` 3절 · 13절, 화면 `docs/08_compare.md` 1-7 · 3절, `docs/02_screens.md` 1-4, API `docs/05_api_contract.md`.

## 결과

- **운영 적용 끝.** 1차(서버 API 만) 이미지 `ddb4496d5e90`, 2차(화면 전환) 이미지 `9a563cfa090c`. 스키마 변경 없음 — 자동 Sync.
- `GET /api/compare?ids=` · `?pick=`, `GET /api/recommend?…` — GET 인 까닭: 보안 설정이 "GET 은 누구나, 그 밖은 로그인"(사용자 결정).
- 전수 대조 `node scripts/parity/check.mjs --base <주소>` — 로컬(운영 스냅숏 310켤레) · 운영 모두 불일치 0(비교 pick 310 · ids 62 · 추천 960). 얼린 사본을 일부러 바꾸면 2,998곳 · exit 1(스크립트가 차이를 잡는지 확인).
- 화면: 전(운영, 브라우저 계산) · 후(로컬, 서버 계산) · 배포 뒤 운영 — 20쌍씩 픽셀 차이 0(1440 · 390px).
- 응답: 서버 약 16ms(내부 VIP, /api/terms 6ms). 운영 브라우저 왕복 — 비교 배지 약 250ms, 추천 결과 약 265ms.

## 커밋

| 커밋 | 내용 |
|---|---|
| `126617d` | 1차 — compare/ComparePolicy · RecommendPolicy · CompareController, scripts/parity, 계약 X147~X153 |
| `ddb4496` | 09 3절 GET |
| `9a563cf` | 2차 — 화면 전환, 지운 계산 목록은 커밋 메시지 |
| `1fc1b93` | 09 · 08 운영 적용 |

## 이관으로 달라진 점

- 추천 이유의 가격 표기가 한국 표기(`199,000원`)로 고정 — 전에는 브라우저 언어를 따랐다.

## 남은 작업(09 13절)

- 쿠션 문구가 거꾸로(low 인데 35~39.5mm → "얇아요") · 조건 문구("다른 조건이 잘 맞아요") — 따로 고친다.
- 추천이 옛 세대도 후보로 — 고칠지부터 논의.
