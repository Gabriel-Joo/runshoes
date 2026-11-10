**답변은 항상 한국어로 한다. 코드·명령어·경로·로그는 원문 그대로 둔다.**

# RUNSHOES — 이 프로젝트에서만 쓰는 규칙

## 알림(텔레그램)

텔레그램 알림은 FOREMAN 브리지가 턴이 끝날 때 보낸다(Stop hook, 접두어 `[런슈즈]`, 2026-11-02부터). 이 세션에서 직접 보내지 않는다 — `scripts/notify-telegram.sh`는 지웠다.
규칙은 `~/AI_programming/foreman/config/notify.toml`.

## 서브에이전트 모델

서브에이전트 기본 모델은 sonnet이다(`.claude/settings.json`의 `CLAUDE_CODE_SUBAGENT_MODEL`, 2026-11-09). 이 변수는 기본 제공 Explore에는 듣지 않아, 같은 이름의 `.claude/agents/Explore.md`(`model: sonnet`, 읽기 전용)로 덮어썼다(2026-11-09).
판단이 결과를 좌우하는 일 — 데이터 검증 · 판정, 여러 파일에 걸친 설계 변경, 코드 리뷰 — 은 서브에이전트를 부를 때 `model: "opus"`를 준다. 파일 찾기 · 목록 만들기 · 형식 바꾸기 같은 기계적인 일은 기본(sonnet) 그대로 둔다.

## 운영 DB · 클러스터

Claude는 운영 DB에 직접 접근하지 않는다 — `kubectl exec … mysql` 금지(2026-11-10 사용자). 숫자는 공개 API로 세고, DB에서만 보이는 것이 필요하면 사용자에게 말한다. 운영 DB · 클러스터에 쓰는 명령은 사람이 친다.
