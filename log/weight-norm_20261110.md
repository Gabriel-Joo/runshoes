# 작업 2 — 무게 270mm 환산(V15 · V16) — 2026-11-10

세션: worktree `cc/runshoes-3`. 설계 `docs/09_chatbot_rag.md` 4절, 규칙 `docs/01a_catalog_sources.md` 1-3a, 화면 `docs/08_compare.md` 1-3 · 1-7.

## 결과

- **운영 적용 끝(07:04:43 UTC).** 이미지 `40586d6eb722`(infra `4ebbb11`), `Successfully applied 2 migrations … v16`(54ms), 자동 Sync 다시 켬. 실행 기록은 infra `apps/runshoes/runbooks/v15-weight-norm.md` 5절(`23ee9d8`).
- 공개 API: 신발 310 · `weightNorm270` 있음 281 · null 29 · 식과 다름 0. 무게 용어 설명 새 문구, terms 13(id 12 둘 그대로).
- 덤프 `~/k8s-cluster/backup/2026-11-10-runshoes-v15/runshoes-before-v15-20261110T070200Z.sql`(복원 지문 `5b90995f…` 운영과 같음).

## 앱 커밋(모두 `main` 에 fast-forward 로 들어감)

| 커밋 | 내용 |
|---|---|
| `0c40cf9` | V14 뒤 낡은 줄 셋(08:161 · 05:116 · 09:158) · CLAUDE.md 「운영 DB · 클러스터」 |
| `1ba998b` | V15 생성 컬럼 · API `weightNorm270` · 비교하기(환산 배지 · 아래 문구 · 그래프 281) · 계약 X136~X146 · 문서 |
| `83213c2` | 그래프 본문 B — 값은 제목에만 |
| `40586d6` | V16 무게 용어 설명(가드) · 비슷한 신발 거리에서만 기준 모름은 원값(`distWeight`) |
| `ef5d3d3` | 07 · 09 운영 적용 반영 |

## 정한 것(사용자)

- 생성 컬럼(VIRTUAL). 기준 사이즈 검증은 넣지 않는다(다섯 값 밖 → null).
- 8g 규칙은 화면에 넣지 않는다 — 챗봇(5단계)에서.
- 툴팁 240g · 300g 은 업계 통념 — docs 에 출처로 적지 않는다.
- id 12 중복은 이번에 고치지 않는다(5단계에서).
- 자동 채우기: 기준 모름 29켤레는 거리 계산 안에서만 원값. 환산 전 대비 바뀐 켤레 71, 무게 차 중앙값 19.0 → 13.9g.

## 계약(로컬)

v6 109/0 · v3 100/12(R03 — 무게 용어 설명, 의도한 차이) · v3-search 24 · v4 21 · v14-summary 20.

## 남은 것

- 요약 CronJob 첫 정기 회차(11-11 03:30 KST) 확인 → V14 런북 8절 "8 첫 정기 회차" 줄.
- 관리 화면 "다시 만들 것 0"(사용자 확인 대기).
