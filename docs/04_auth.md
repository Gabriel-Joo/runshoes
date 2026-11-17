<!--
다루는 곳: backend/src/main/java/com/kopo17/runshoes/auth/, backend/src/main/java/com/kopo17/runshoes/activity/, backend/src/main/resources/application.yml, backend/src/main/resources/db/migration/V3__auth.sql, backend/src/main/resources/db/migration/V7__demo_admin.sql, backend/src/main/resources/db/migration/V9__user_withdraw.sql, src/auth/, src/pages/Login.tsx, src/pages/Signup.tsx, src/pages/Account.tsx, tests/refreshPolicy.test.ts
읽은 커밋: 606b730
-->
> 상태: 2026-11-17 코드와 맞춰 봄. 운영에서 쓰는 중(2026-11-02 확인). 체험 로그인 켜짐, `GET /api/auth/demo-accounts` 가 31장(시드 30 + 데모 관리자)을 준다(2026-11-17 공개 API 로 다시 확인). 원천: `backend/…/auth/*`, `activity/*`, `application.yml`, `V3`, `V7`, `V9`, `src/auth/*`, `pages/Login.tsx`, `Signup.tsx`, `Account.tsx` [c:a6bf21e] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:245-248] [code:backend/src/main/resources/db/migration/V3__auth.sql:136-165] [code:backend/src/main/resources/application.yml:37] <!-- 확인 못 함: 운영에서 체험 로그인이 켜졌는지와 31장은 운영 env 와 공개 API 의 값, 저장소 기본값은 꺼짐 -->

#### 0. 한 줄 요약

이메일 가입과 로그인(JWT)이다. access token 은 프런트 메모리에만 두고 refresh 는 HttpOnly 쿠키로, 쓰기 권한과 셈하는 값(평점, 찜 수, 작성자)은 **서버가 정한다**. 비밀번호 없이 둘러볼 수 있는 체험 계정(시드 사용자 30, 읽기 전용 관리자 1)이 있고, 로그인 시도 제한과 활동 로그는 Redis 없이 MySQL 하나로 한다. [code:src/auth/session.ts:5-6] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:124-125] [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:43-60] [code:backend/src/main/resources/db/migration/V7__demo_admin.sql:9-11] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:14]

#### 1. 최종 설계

#### 1-1. 토큰

| | 값 | 저장 |
|---|---|---|
| access | JWT HS256 **15분**. `sub`(user id), `role`, `sid`(refresh family), `jti` | 프런트 **메모리**만 [code:backend/src/main/java/com/kopo17/runshoes/auth/TokenService.java:42-51] [code:backend/src/main/resources/application.yml:31] [code:src/auth/session.ts:5] |
| refresh | 불투명 256bit, **14일**, 쓸 때마다 새로 | 쿠키 `runshoes_refresh`(HttpOnly, Secure, SameSite=Strict, Path=`/api/auth`). DB 에는 SHA-256 만 [code:backend/src/main/java/com/kopo17/runshoes/auth/TokenService.java:60-65] [code:backend/src/main/resources/application.yml:32-33] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:29] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:123-125] |

- **access token 은 만료 뒤 최대 1분 더 통한다**(시계 오차 허용 60초). [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:121] [code:backend/src/main/resources/application.yml:31]
- **교체와 재사용 감지**. refresh 할 때마다 새 토큰을 주고 쓴 것은 폐기(`replaced_by`). 이미 바뀐 토큰이 다시 오면 그 family(로그인 한 번)를 전부 폐기한다. 바뀐 지 10초 안이면 탭 둘의 동시 refresh 로 보고 하나 더 준다. [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:37] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:123-143]
- 로그아웃은 family 폐기 + 쿠키 삭제. 비밀번호를 바꾸면 지금 기기(`sid`)를 뺀 모든 family 를 폐기한다. [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:148-153] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:71-76] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:215] [code:backend/src/main/java/com/kopo17/runshoes/auth/MeController.java:59]
- **CSRF**. API 는 Bearer 헤더로만 인증해 대상이 아니다. 쿠키가 붙는 `/api/auth` 만. SameSite=Strict, POST 는 Origin 이 Host 와 같아야 하고, CORS 헤더를 주지 않는다. [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:47-48] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:135-147] [code:backend/src/main/java/com/kopo17/runshoes/config/ApiHeadersFilter.java:37-39]
- **XSS**. 토큰을 localStorage 에 두지 않는다. `dangerouslySetInnerHTML` 없음. [code:src/auth/session.ts:5] [code:src/]
- 프런트는 401 이면 refresh 한 번 뒤 다시 보낸다(요청이 여럿이어도 refresh 는 한 번). 새로 고침하면 refresh 쿠키로 다시 access 를 받는다. [code:src/auth/session.ts:149-161] [code:src/auth/session.ts:178-189] [code:src/auth/session.ts:6]
- refresh 가 실패하면 **서버가 401, 403 으로 거절했을 때만** 로그아웃시킨다. 네트워크 오류, 5xx(롤링 배포 중의 502, 503 등)는 세션을 그대로 두고 1초, 3초 뒤 다시 보낸다(2026-11-17, `src/auth/refreshPolicy.ts`). 기다림 합 4초는 위 10초 창 안이다. 서버에서는 처리됐는데 응답만 사라졌을 때 다시 보내는 것이 곧 재사용이라, 10초를 넘기면 그 family 가 폐기된다. 세 번 다 닿지 못하면 로그인 상태는 두고 그 요청은 503(「서버에 연결하지 못했어요」)으로 돌려준다. 401 이 아니라 화면이 로그인으로 보내지 않는다. [code:src/auth/refreshPolicy.ts:13-39] [code:src/auth/session.ts:77] [code:src/auth/session.ts:166-171] [code:src/auth/session.ts:186-189] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:37]
- Spring Security 는 세션, 폼 로그인, CSRF 토큰 없음. Security 의 Cache-Control 은 끈다. 계약 헤더는 `ApiHeadersFilter` 가 먼저 만든다. [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:35-36] [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:47-54]
- 비밀은 Secret `runshoes-auth`(사람이 만든다): `JWT_SECRET`, `SEED_USER_PASSWORD`(시드 사용자 30명 공통), `ADMIN_PASSWORD`. 계정의 비밀번호 칸이 NULL 이면 기동할 때 이 값으로 채운다(`auth/SeedPasswords`). git 에는 평문도 해시도 없다. [code:backend/src/main/resources/application.yml:28-35] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthProperties.java:7] [code:backend/src/main/java/com/kopo17/runshoes/auth/SeedPasswords.java:38-52]
- 챗봇은 연결할 때 한 번만 확인한다 → `09_chatbot_rag.md` 1-13절

#### 1-2. 계정과 역할

| 역할 | 누구 | 할 수 있는 것 |
|---|---|---|
| `USER` | 가입자, 시드 사용자 30(`runner01~30@runshoes.test`, 가상 인물), 리뷰용 가상 사용자 170(`reviewer001~170@runshoes.test`, 비밀번호 칸 `!seed-reviewer`, 로그인 불가, 체험 카드에 없음, `01e_seed_reviews.md`) | 리뷰, 찜, 도움이 돼요, 내 정보 [code:backend/src/main/resources/db/migration/V3__auth.sql:136-165] [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:43-48] [docs:01e_seed_reviews.md] <!-- 확인 못 함: 리뷰용 가상 사용자 170명과 비밀번호 칸 표식은 저장소 코드에 넣는 곳이 없다, 운영 DB --> |
| `ADMIN` | 관리자 1 | 위 + 신발 쓰기, 리뷰 삭제, 관리 화면 [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:50-54] [code:backend/src/main/resources/db/migration/V3__auth.sql:166] |
| `DEMO_ADMIN` | 데모 관리자 1(V7) | 관리 화면을 다 **본다**(회원 이메일과 대화 원문 포함, 1-3). 모든 쓰기, 리뷰, 찜은 403 `{code:"demo_admin"}`, 회원 정보 수정(`/api/me/*`)은 403 `{error:{code:"DEMO_ADMIN", message}}` [code:backend/src/main/resources/db/migration/V7__demo_admin.sql:9-11] [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:43-60] [code:backend/src/main/java/com/kopo17/runshoes/api/ApiException.java:25-26] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:197] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:294-301] |

- 권한 판정 순서: **401 → 404 → 403**(`05_api_contract.md` 1-4). 쓰기 권한은 화면이 아니라 서버(`api/Viewer`, `SecurityConfig`)가 막는다. [docs:05_api_contract.md] [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:55-63] [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:10]
- 입력 규칙(`AuthRules`, 프런트도 같은 규칙으로 먼저 보지만 정답은 서버): [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthRules.java:8] [code:src/auth/rules.ts:1]

  | 칸 | 규칙 |
  |---|---|
  | 이메일 | 254자까지, `x@y.z` 모양 [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthRules.java:12] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthRules.java:24] |
  | 비밀번호 | 8~64자, 영문과 숫자를 함께 [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthRules.java:29-33] |
  | 닉네임 | 2~12자, 한글과 영문과 숫자만, 예약어 불가 [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthRules.java:15-16] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthRules.java:36-44] |

- 닉네임은 대소문자를 같게 본다(UNIQUE collation). 탈퇴 자리표시 `탈퇴-<id>` 는 `-` 가 있어 누구의 닉네임과도 겹치지 않는다. 바꾸면 그 사람 리뷰의 작성자 스냅샷도 같은 트랜잭션에서 바뀐다. [code:backend/src/main/resources/db/migration/V3__auth.sql:27] [code:backend/src/main/resources/db/migration/V3__auth.sql:40-42] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:235] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:168-185]
- **회원 탈퇴(V9)**. 한 트랜잭션에서: `deleted_at` 을 적고, refresh 를 모두 폐기하고 비밀번호 칸을 BCrypt 가 아닌 표식으로 바꾸고, 리뷰는 남기되 작성자 "탈퇴 회원", 찜은 지우고 신발의 찜 수를 뺀다(도움이 돼요는 남긴다, 남의 리뷰 숫자가 바뀌지 않게). 이메일과 닉네임은 자리표시(`withdrawn-<id>@runshoes.invalid`, `탈퇴-<id>`)로 바꿔 같은 이메일로 다시 가입할 수 있다(새 id, 이전 리뷰는 돌아오지 않는다). 남은 access token 은 어디서나 401. 복구는 없다. [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:225-241] [code:backend/src/main/java/com/kopo17/runshoes/domain/ReviewRepository.java:27] [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:76-83] [code:backend/src/main/resources/db/migration/V9__user_withdraw.sql:1-8]

#### 1-3. 체험 계정

```
로그인
  이메일 · 비밀번호 [로그인]
  처음이세요? 회원가입 화면으로 →
  ── 일반 회원으로 체험하기 ──   시드 계정 카드(리뷰 수 · 찜 수)가 천천히 흐른다
  ── 관리자로 체험하기 ──       "관리자 체험 계정 / 신발 관리 화면 보기"
```

- `GET /api/auth/demo-accounts` → 시드 사용자 30 + 데모 관리자. `POST /api/auth/demo {id}` → 로그인과 같은 응답과 쿠키. **풀 밖의 id(진짜 관리자, 실제 가입자)는 400.** [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:81-91] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:243-275] [code:backend/src/main/java/com/kopo17/runshoes/domain/UserRepository.java:19-21]
- 비밀번호를 화면에 두지 않는다. 시드 30명은 비밀번호 하나를 같이 쓰므로, 화면에 넣으면 30명 모두의 비밀번호가 공개된다. [code:backend/src/main/java/com/kopo17/runshoes/auth/SeedPasswords.java:16] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:249-256]
- 데모 관리자는 비밀번호로 들어갈 수 없다. 비밀번호 칸이 NULL 이 아니라 표식 `'!demo'`(NULL 이면 기동 때 시드 비밀번호가 채워진다). [code:backend/src/main/resources/db/migration/V7__demo_admin.sql:3-5] [code:backend/src/main/resources/db/migration/V7__demo_admin.sql:10] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:107] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:286-288]
- 시드 계정과 관리자는 닉네임 변경과 탈퇴가 403(체험 카드로 들어온 누구나 시드 이름을 바꾸거나 지울 수 있게 되므로). 비밀번호 변경은 지금 비밀번호를 알아야 해 그대로. [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:294-297] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:171] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:228] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:195-205]
- env `DEMO_LOGIN_ENABLED`(기본 꺼짐)로 켠다. 끄면 카드도 API(404)도 없다. 같은 IP 15분 30번이면 429. [code:backend/src/main/resources/application.yml:37] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:290-292] [code:src/auth/session.ts:112-116] [code:backend/src/main/resources/application.yml:42] [code:backend/src/main/resources/application.yml:45] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:80-87]
- 체험 안내: "누구나 함께 쓰는 체험 계정이에요. 남긴 리뷰 · 찜은 다른 사람이 바꾸거나 지울 수 있어요". [code:src/pages/Login.tsx:95]
- **체험 계정은 방문자가 바꾼 대로 둔다. 되돌리지 않는다**(2026-11-17 사용자). 시드 30명의 리뷰와 찜은 방문자 손으로 바뀐다.
- **데모 관리자는 읽기를 다 한다(2026-11-15 사용자).** 관리자 페이지의 회원 이메일과 챗봇 대화 원문까지 admin 과 같게 본다. 쓰기(숨기기, 영구 삭제, 되살리기, 잠금 풀기, 인증, 용어 추가, 문의 처리 등)는 그대로 서버가 403 `demo_admin` 으로 막는다. [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:50-60] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:47] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:77] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:105] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:122-123] [code:backend/src/main/java/com/kopo17/runshoes/api/ApiException.java:25-26]
  - 까닭: 데모 관리자는 시현용이다. 읽지 못하면 화면이 비어 시현이 안 된다. 처음(11-14)에는 카드를 누구나 쓰므로 이메일과 원문을 서버에서 뺐는데, 이 까닭으로 풀었다.
  - **실제 서비스로 가면 데모 관리자 계정을 지운다.** 그 전까지 데모 관리자 카드를 누른 누구나 가입자 이메일과 대화 원문을 읽을 수 있다. 운영에 실제 가입자가 있는지는 이 문서를 쓸 때 확인하지 않았다(운영 DB 를 직접 보지 않는다). <!-- 확인 못 함: 운영 DB 의 실제 가입자 여부, 저장소 밖 -->

#### 1-4. 시도 제한

| 대상 | 세는 것 | 허용 | 막는 시간 |
|---|---|---|---|
| 로그인(계정) | 그 이메일의 실패 | 15분에 5번 | 마지막 실패에서 15분 [code:backend/src/main/resources/application.yml:40] [code:backend/src/main/resources/application.yml:42] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:40-47] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:89-93] |
| 로그인(IP) | 그 IP 의 실패 | 15분에 20번 | 15분 [code:backend/src/main/resources/application.yml:41-42] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:63-67] |
| 비밀번호 변경의 "지금 비밀번호" 틀림 | 로그인 실패로 센다 | 위와 같음 | [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:198-207] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:23] |
| 가입 | 그 IP 의 가입 성공 | 1시간에 10건 | 가장 오래된 것에서 1시간 [code:backend/src/main/resources/application.yml:43-44] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:70-77] |
| 체험 로그인 | 그 IP 의 체험 로그인 | 15분에 30번 | 15분 [code:backend/src/main/resources/application.yml:45] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:80-87] |

- **잠긴 동안에는 맞는 비밀번호도 429**(`Retry-After` + `{error:{code:"RATE_LIMITED", message, retryAfter}}`). 화면은 문구와 남은 시간 동안 버튼을 끈다. [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:101-106] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthException.java:26-28] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthErrorHandler.java:19-27]
- **없는 이메일도 똑같이 센다**. 존재하는 계정만 잠기면 "가입된 이메일"의 단서가 된다. [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:98-102]
- 비밀번호를 검사하기 **전에** 센다. 잠겨 있으면 BCrypt 를 돌리지 않는다. 성공하면 그 계정의 실패는 리셋. 막힌 시도는 실패로 세지 않는다(잠금이 길어지지 않게). [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:101-108] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:15-17] [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:40-47]
- **관리자가 계정 잠금을 풀 수 있다**(2026-11-14, 관리자 페이지 회원 목록). 잠김 칸을 두지 않고 `admin.login.unlock` 기록을 남겨, 계정 기준 셈이 마지막 성공 또는 잠금 풀기 뒤의 실패만 본다(`RateLimiter`). 실패 기록은 지우지 않는다. IP 기준 잠금은 계정 단위로 풀 수 없다. [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:33-47] [code:backend/src/main/java/com/kopo17/runshoes/auth/LoginLocks.java:38] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:96-106]
- 세는 곳은 `activity_logs` 다(Redis 없이). 실패 기록은 `REQUIRES_NEW` 로 따로 커밋한다. 같은 트랜잭션이면 401 과 함께 사라진다. [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:14] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityLogger.java:24] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityLogger.java:37-38] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityLogger.java:56-58]
- **로그인마다 `activity_logs` 를 센다.** 세는 곳이 DB 라 Pod 가 둘이어도 맞다. 지금 규모(인덱스 `idx_activity_logs_ip`, `_event`)에서는 문제가 없다. [code:backend/src/main/java/com/kopo17/runshoes/auth/RateLimiter.java:14] [code:backend/src/main/resources/db/migration/V3__auth.sql:126-127]
- IP 는 `CF-Connecting-IP` → `X-Forwarded-For` 첫 값 → 접속 주소 순(`RequestInfo`, 터널 뒤라 접속 주소는 cloudflared 다). [code:backend/src/main/java/com/kopo17/runshoes/auth/RequestInfo.java:7] [code:backend/src/main/java/com/kopo17/runshoes/auth/RequestInfo.java:12-17]
- **IP 헤더는 꾸밀 수 있다.** 클러스터 안에서 VIP 로 바로 붙으면 `CF-Connecting-IP` 를 마음대로 보낼 수 있다. IP 기준 제한은 우회되지만 계정 기준(5번)은 남는다. 시도 제한 용도로는 받아들였다. [code:backend/src/main/java/com/kopo17/runshoes/auth/RequestInfo.java:8] [code:backend/src/main/resources/application.yml:40]

#### 1-5. 활동 로그

- 이벤트는 "영역.동작". 인증(`auth.login.success`, `.failure`, `.blocked`, `auth.signup`, `auth.demo_login`, `user.withdraw` …), 쓰기(리뷰, 찜, 도움이 돼요, 관리 화면의 신발 쓰기), 조회(`shoe.view` 30분 중복 제거, `compare.view`). [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:88] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:104] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:110] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:114] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:240] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:273] [code:backend/src/main/java/com/kopo17/runshoes/api/ReviewCollection.java:109] [code:backend/src/main/java/com/kopo17/runshoes/api/LikeController.java:43] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:107] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityController.java:27] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityController.java:56-73]
- IP 와 User-Agent 는 인증 이벤트에만 남긴다. 이메일 원문은 남기지 않는다. [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityLogger.java:25] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityLogger.java:60-66] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:29]
- `POST /api/activity`(조회 기록)는 로그인한 사람만. 입력이 맞으면 204. 30분 안 같은 기록이라 남기지 않았어도 204 라 남겼는지 말하지 않는다. type 이 없거나 모르는 값, `shoeId` 없음, `compare.view` 2~5켤레 밖은 400, 없는 신발은 404. refresh 성공과 비로그인 조회는 남기지 않는다. [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityController.java:49-76] [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:63] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:118-145]
- 보관은 인증 90일, 나머지 180일, 매일 앱이 지운다(`ActivityCleanup`). 50만 행이 넘으면 정리 job 이 WARN 을 남긴다. [code:backend/src/main/resources/application.yml:47-51] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityCleanup.java:36-39] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityCleanup.java:52] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityCleanup.java:82-88]
- 읽는 API 는 아직 없다. 사람은 DB 에서 본다. [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityController.java:49]

#### 1-6. 화면

- 로그인과 회원가입. 서로 오가는 문구 "처음이세요? 회원가입 화면으로 이동합니다", "이미 계정이 있으세요? 로그인 화면으로 이동합니다"(회원가입, 로그인 낱말이 링크). 비밀번호 칸 오른쪽 끝에 보기 단추. [code:src/pages/Login.tsx:84-86] [code:src/pages/Signup.tsx:99-101] [code:src/auth/Field.tsx:36]
- 마이페이지(`/account`). 왼쪽 목차(회원정보 수정, 내 활동(내 리뷰, 찜 목록, 도움받은 리뷰), 회원 탈퇴)와 오른쪽 본문, 맨 위 활동 요약(리뷰, 찜, 도움이 돼요, 가입일). 화면 모양은 `02_screens.md`. [code:src/pages/Account.tsx:34] [code:src/pages/Account.tsx:79-84] [code:src/pages/Account.tsx:91] [docs:02_screens.md]

#### 2. 왜 이렇게 했나

- **찜이 사람에게 묶여야 했다(2026-10-21).** 그때까지 찜은 모두가 같이 쓰는 BOOLEAN 한 칸이었고, 찜 수와 평점은 프런트가 계산해 PATCH 했다. 아무나 999 를 보낼 수 있었다. 찜한 신발을 비교하는 화면과 그 화면을 읽는 챗봇이 다음 일이라 로그인이 먼저였다.
- **토큰은 메모리 + refresh 쿠키.** localStorage 의 토큰은 XSS 한 번에 빠진다. refresh 쿠키를 `/api/auth` 에만 붙여 CSRF 대상도 그 경로로 좁혔다. [code:src/auth/session.ts:5] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:123-125]
- **401 을 404 보다 먼저.** 로그인 없이 없는 id 로 존재 여부를 떠보지 못하게. [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:55]
- **서버가 정하는 값.** 작성자, 리뷰 시각, 평점, 찜 수를 본문에서 받으면 누구나 바꿀 수 있다. 리뷰 시각도 서버 것. 실사용 후기의 "첫 리뷰 30일 뒤"가 클라이언트 시계에 흔들리면 안 된다. [code:backend/src/main/java/com/kopo17/runshoes/api/ReviewCollection.java:93-97] [code:backend/src/main/java/com/kopo17/runshoes/api/Likes.java:39]
- **시도 제한은 계정과 IP 둘 다.** IP 만이면 NAT 뒤 사람들이 같이 막히고 IP 를 바꿔 한 계정을 노리면 못 막는다. 계정만이면 한 IP 에서 계정 여럿을 두드리는 것을 못 막는다. 남이 계정을 잠그는 위험은 짧은 시간(15분)과 IP 기준(한 IP 는 20번에서 막힌다)으로 줄였다. [code:backend/src/main/resources/application.yml:40-42]
- **체험 계정은 시드 30명만(2026-10-29 사용자).** 실제 가입자를 넣으면 카드를 누른 누구나 그 사람 이름으로 리뷰를 쓸 수 있다. "남의 이름으로 리뷰가 달리면 안 된다". [code:backend/src/main/java/com/kopo17/runshoes/domain/UserRepository.java:19-21]
- **탈퇴는 소프트 삭제(2026-10-30 사용자).** 리뷰를 지우면 다른 사람이 본 평점과 리뷰 수가 바뀐다. 리뷰는 남기고 사람과의 연결만 끊는다. [code:backend/src/main/resources/db/migration/V9__user_withdraw.sql:1-5]

#### 3. 시도했던 것들

- **기존 리뷰 105건을 계정 30명으로(2026-10-21).** 리뷰-신발 짝은 그대로 두고 작성자만 나눴다. 리뷰에 담긴 성격이 어긋나지 않게 묶었다. "과내전이 심해 안정화만 신는다"는 리뷰를 쓴 사람에게 다른 신발 리뷰를 주지 않았고, "늘 반 사이즈 크게"를 쓴 4건은 한 사람에게, 발볼 "좁은 편"과 "넓다"는 섞지 않았다. 한 사람이 같은 신발에 같은 말을 두 번 쓴 #29, #81 중 #81 을 지웠다(8번 신발 평점은 다시 세어 4.4 → 4.3). [c:a6bf21e]
- **공용 찜 수를 카운터로 남겼다(2026-10-21).** `COUNT(likes)` 로 바꾸면 시드의 좋아요 수가 거의 0 이 돼 랭킹이 무너진다. 공용 찜과 공감은 admin 몫으로 옮기고 숫자는 카운터로 두었다. [code:backend/src/main/java/com/kopo17/runshoes/api/Likes.java:10] [code:backend/src/main/java/com/kopo17/runshoes/api/Likes.java:39]
- **"한 신발에 첫 리뷰 하나"를 DB 가 지킨다(2026-10-21).** MySQL 에 조건부 UNIQUE 가 없어 `IF(review_type='FIRST', shoe_id, NULL)` 생성 칸에 UNIQUE 를 걸었다. STORED 는 ERROR 1215(기준 칸의 FK 가 CASCADE)로 거절돼 VIRTUAL 로 바꿨다. [code:backend/src/main/resources/db/migration/V3__auth.sql:46-47] [code:backend/src/main/resources/db/migration/V3__auth.sql:60-61]
- **배포를 두 단계로(2026-10-21).** 1단계는 스키마(V3)와 인증 API(쓰기는 열어 둔 채), 2단계는 쓰기 권한과 화면. 2단계 배포 직전에 작성자 없는 리뷰가 0건인지 다시 봤다. [c:a6bf21e]
- **검증이 무엇을 봤는지 의심한 세 번(2026-10-21).** 만료 시험이 처음에 통과하지 않은 것은 코드가 아니라 Spring JWT 의 시계 오차 허용(60초)이었다. 내부 VIP 는 http 라 curl 이 Secure 쿠키를 저장하지 않아 첫 refresh 시험이 무효였다. 공개 https 로 다시 했다. Jenkins 빌드 완료를 `build.xml` 의 `<result>` 로 보다 빌드 중에 "SUCCESS" 로 착각했다. 로그 끝 `Finished:` 로 본다. [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:121]
- **화면 검증에서 찾은 것(2026-10-21).** `/account` 에서 로그아웃하면 세션이 먼저 지워져 가드가 로그인 화면으로 보냈다. 홈으로 먼저 옮기고 끊는다. 768px 에서 로그인하면 헤더가 넘쳤다. 닉네임 말줄임. [code:src/auth/session.ts:119-120]
- **체험 카드가 여러 번 바뀌었다(2026-10-29 → 10-30).** 무작위 3장 → 시드 전부를 슬라이드로 → 4열 × 2줄이 천천히 흐르고 끌어서 넘기는 모양. 관리자 카드는 "데모"가 가짜처럼 보여 카드에만 "관리자 체험 계정"으로 부른다(DB 닉네임은 "데모관리자"). [code:src/auth/session.ts:15-16] [code:backend/src/main/resources/db/migration/V7__demo_admin.sql:10]
- **탈퇴 뒤 남은 토큰이 통했다(2026-11-01).** 탈퇴 뒤 남은 access token(최대 15분)으로 자기 리뷰 수정과 삭제가 통과했다. 토큰을 받는 곳(`SecurityConfig` 의 JWT 변환)이 users 를 읽어 탈퇴했으면 거절하게 고쳤다. [code:backend/src/main/java/com/kopo17/runshoes/auth/SecurityConfig.java:71-83]

#### 4. 남은 한계

- **비밀번호 찾기가 없다.** 메일 발송이 없다. 잊으면 새로 가입해야 한다. 안 하는 까닭: 메일 발송 수단이 없다. [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:45-98]
- **CSP 가 없다.** 화면 검증 뒤 올리기로 하고 아직이다. 안 하는 까닭: 화면 검증 뒤 올리기로 미뤘다.

#### 5. 검증 항목

- 계약 시험 spring-v3 A01~A43(인증, 시도 제한, 조회 기록), W(쓰기 401, 403, 405, 409), spring-v6 X02~X19(체험 로그인, 데모 관리자, 체험 계정 보호), X70~X82(탈퇴, 남은 토큰 401 포함). [code:contract/scenarios.mjs:167-219] [code:contract/scenarios.mjs:224-269] [code:contract/scenarios.mjs:350-365] [code:contract/scenarios.mjs:400-417] [code:contract/]
- 운영: 로그인, refresh, 로그아웃은 공개 https 로(Secure 쿠키). `GET /api/auth/demo-accounts` 장수. <!-- 확인 못 함: 운영 공개 https 에서 하는 확인, 저장소 밖 -->
