# RUNSHOES — 로그인 설계

찜을 사용자에 묶는 것이 전제인 비교 페이지(찜한 신발 2개를 레이더 차트로)와, 그 화면 맥락을 읽는 챗봇을 위해 먼저 만든다.
범위: 가입 · 로그인(JWT), 리뷰 · 찜 · 리뷰 공감을 사용자에 묶기, 내 리뷰만 수정 · 삭제(백엔드에서 막는다), 관리 화면은 admin 만, 활동 로그.
범위 밖: 소셜 로그인, 비밀번호 찾기, 세세한 클릭 · HTTP 로그(나중에 Loki), 실사용 후기 UI.

## 1. 토큰

| | 값 | 저장 |
|---|---|---|
| access | JWT HS256 **15분**. 클레임 `iss=runshoes` · `sub`(user id) · `role` · `sid`(refresh family) · `iat` · `exp` · `jti` | 프런트 **메모리**만 |
| refresh | 불투명 256bit, **14일**(쓸 때마다 새로) | 쿠키 `runshoes_refresh` — HttpOnly · Secure · SameSite=Strict · Path=`/api/auth`. DB 에는 SHA-256 만 |

- **교체 · 재사용 감지**: refresh 할 때마다 새 토큰을 주고 쓴 것은 폐기(`replaced_by`). 이미 바뀐 토큰이 다시 오면 그 family(로그인 한 번)를 전부 폐기한다.
  바뀐 지 10초 안이면 탭 둘의 동시 refresh 로 보고 family 에 하나 더 준다.
- **로그아웃**: family 폐기 + 쿠키 삭제. **비밀번호 변경**: 지금 기기(`sid`)를 뺀 그 사용자의 family 전부 폐기.
- **CSRF**: API 는 Bearer 헤더로만 인증해 대상이 아니다. 쿠키가 붙는 `/api/auth` 만 — SameSite=Strict, POST 는 Origin 이 Host 와 같아야 하고(`Sec-Fetch-Site: cross-site` 거절), CORS 헤더를 주지 않는다.
  (다른 `/api` 는 json-server 계약대로 Origin 을 돌려주고 credentials 를 허용한다 — 쿠키가 없으니 상관없다)
- **XSS**: 토큰을 localStorage 에 두지 않는다. React 이스케이프 · `dangerouslySetInnerHTML` 없음. CSP 는 프런트 단계에서.
- **Spring Security**: 세션 · 폼 로그인 · CSRF 토큰 없음. Security 의 Cache-Control 은 끈다 — 계약 헤더는 `ApiHeadersFilter` 가 Security 보다 먼저.
- 시도 제한(Redis 없이 `activity_logs` 로): 로그인 실패 같은 이메일 · IP 15분 5회 → 429, 가입 같은 IP 1시간 10건.
- 챗봇(같은 Pod 의 사이드카): 연결 뒤 첫 프레임 `{type:"auth", token}`, 챗봇이 `GET 127.0.0.1:3000/api/me` 로 확인한다. URL 쿼리에 토큰을 넣지 않는다.

Secret `runshoes-auth`(사람이 만든다): `JWT_SECRET`(32바이트 이상, `openssl rand -base64 48`) · `SEED_USER_PASSWORD`(V3 사용자 30명 공통) · `ADMIN_PASSWORD`.
V3 는 계정의 비밀번호 해시를 NULL 로 넣고, 앱이 기동할 때 비어 있는 계정만 이 값으로 채운다(`auth/SeedPasswords`). git 에는 평문도 해시도 없다.

## 2. 권한

순서: 401(토큰 없음 · 틀림 · 만료) → 404(대상 없음) → 403(권한 없음).

| 경로 | 누가 |
|---|---|
| 모든 GET(신발 · 리뷰 · 용어 · 브랜드 · 요약) | 누구나. `liked` 는 요청한 사람 기준(비로그인은 false) |
| `POST /api/reviews` | 로그인. author · user_id 는 토큰에서. 한 신발에 첫 리뷰 하나(409) |
| `PATCH` · `DELETE /api/reviews/{id}` | 작성자. PATCH 는 rating · content 만. DELETE 는 admin 도 |
| `PUT` · `DELETE /api/shoes/{id}/like`, `/api/reviews/{id}/like` | 로그인. 멱등, 숫자는 서버가 센다. 내 리뷰에는 공감 불가 |
| 신발 쓰기(POST · PATCH · PUT · DELETE) | ADMIN |
| `POST /api/activity` | 로그인. `shoe.view` · `compare.view` 만 |
| `/api/auth/*` | signup · login · refresh · logout · nickname-available |
| `/api/me` | GET 나, `PATCH /nickname`, `PUT /password` |

리뷰를 쓰고 · 고치고 · 지우면 서버가 신발의 rating · reviewCount 를 다시 센다(FIRST 만, 소수 한 자리 반올림). 프런트가 하던 PATCH 는 없앤다.

## 3. 스키마 (V3 는 추가만, 지우는 것은 V4)

옛 이미지로 롤백해도 뜨게 — Flyway 는 모르는 future 마이그레이션을 무시하고 `ddl-auto: validate` 는 늘어난 것을 문제 삼지 않는다.
V4(안정된 뒤): `reviews.user_id` NOT NULL, `shoes.liked` · `reviews.liked` 삭제.

| 테이블 | 내용 |
|---|---|
| `users` | email UNIQUE(소문자) · password_hash(NULL = 로그인 불가) · nickname UNIQUE · role USER/ADMIN |
| `reviews` + | `user_id` · `review_type`(FIRST/FOLLOWUP) · `parent_review_id` · `distance_km` · `proof_image_url` · `verified` · `verified_at` · `verified_by`. `UNIQUE(user_id, first_shoe_id)` — first_shoe_id 는 FIRST 일 때만 값이 있는 VIRTUAL 생성 컬럼 |
| `likes` · `review_likes` | PK(user, 대상). `shoes.like_count` · `reviews.like_count` 는 카운터로 남긴다(시드 값이 기준, ±1) |
| `refresh_tokens` | token_hash · family_id · expires_at · revoked_at · replaced_by |
| `activity_logs` | occurred_at(UTC ms) · user_id · event · target · meta JSON · ip · user_agent · request_id |

실사용 후기(FOLLOWUP)는 컬럼만. 같은 사람 · 같은 신발의 FIRST 를 가리키고 첫 리뷰 30일 뒤부터 — 앱이 본다(MySQL 은 CASCADE FK 컬럼을 CHECK 에 못 쓴다).
평점에 넣을지는 UI 때 정한다 — 그때까지 평점 · 리뷰 수는 FIRST 만.
증빙 사진 올리기를 만들 때: 기록 앱 스크린샷의 경로 지도 · EXIF 를 지운다.

### 기존 데이터

리뷰 105건(닉네임 101종) → 사용자 30명 + admin. 리뷰-신발 짝은 그대로, 작성자만 바꾼다. 같은 사람이 같은 신발에 두 번 가지 않고, 닉네임 성격이 리뷰 내용과 어긋나지 않게 묶었다(`V3__auth.sql` 의 주석).
- 회복주전용이 8번 신발에 쓴 두 건 중 **#81 삭제**(#29 를 정보를 덜 담아 되풀이) → 8번 신발 5건 · 4.4 → 4건 · 4.3
- 이메일 `runner01@runshoes.test` ~ `runner30@runshoes.test`, `admin@runshoes.test`(닉네임 관리자)
- 지금의 공용 찜(신발 2 · 6 · 16)과 공감 5건은 admin 몫으로. 숫자는 그대로
- V3 는 리뷰가 시드(105건, 짝 지문)와 다르면 시작하지 않는다 — 배포 전에 새 리뷰가 생기면 그때 정한다

## 4. 화면

검증은 서버가 정답이고 프런트는 같은 규칙으로 먼저 본다. 오류 본문 `{error:{code, field, message}}` — message 를 그대로 보여 준다.
로그인이 필요한 곳은 `/login?returnTo=<같은 사이트 경로>`(`/` 로 시작하는 것만).

| 화면 | 입력 · 규칙 | 오류 | 성공 |
|---|---|---|---|
| 가입 `/signup` | 이메일(형식, 254자) · 비밀번호(8~64자, 영문+숫자) · 확인 · 닉네임(2~12자, 한글 완성형 · 영문 · 숫자, 중복 · 예약어 불가) | "이메일 형식이 아닙니다." "이미 가입된 이메일입니다." "비밀번호는 8자 이상이어야 합니다." "영문과 숫자를 함께 써 주세요." "비밀번호가 서로 다릅니다." "닉네임은 2~12자로 써 주세요." "한글, 영문, 숫자만 쓸 수 있어요." "이미 쓰는 닉네임입니다." "쓸 수 없는 닉네임입니다." | 바로 로그인 → returnTo(없으면 `/`), "{닉네임}님, 환영해요" |
| 로그인 `/login` | 이메일 · 비밀번호 | "이메일과 비밀번호를 입력해 주세요." "이메일 또는 비밀번호가 맞지 않습니다." (429) "로그인 시도가 너무 많아요. 15분 뒤에 다시 해 주세요." | returnTo(없으면 `/`) |
| 회원 정보 `/account` | 이메일(보기만) · 닉네임 · 비밀번호(지금 · 새 · 확인) — 따로 저장 | "지금 닉네임과 같아요." "지금 비밀번호가 맞지 않습니다." "지금 비밀번호와 다른 비밀번호를 써 주세요." | 닉네임: 헤더 · 지난 리뷰 작성자까지 바뀜. 비밀번호: 다른 기기 로그아웃 안내 |
| 리뷰 작성(상세 모달) | 닉네임 칸 없음("{닉네임}(으)로 작성") · 별점 1~5 · 내용 10~1,000자 | "내용을 10자 이상 써 주세요." 이미 썼으면 폼 대신 "이 신발에는 이미 리뷰를 썼어요." | 목록 · 평점을 서버 값으로. 쓰던 중 로그인이 끝나면 내용을 남겨 두고 다시 로그인 |

헤더: 비로그인 "로그인", 로그인 닉네임 메뉴(회원 정보 수정 · 로그아웃), admin 만 등록·관리. 찜 · 공감은 비로그인이면 로그인으로. 관리 화면은 admin 이 아니면 `/`.

## 5. 활동 로그

이벤트는 `영역.동작`: `auth.signup` · `auth.login.success` · `auth.login.failure` · `auth.refresh` · `auth.refresh.reuse` · `auth.logout` · `auth.password.change` · `user.nickname.change` ·
`review.create` · `review.update` · `review.delete` · `like.add` · `like.remove` · `review_like.add` · `review_like.remove` · `shoe.view`(같은 사람 · 같은 신발 30분에 한 번) · `compare.view`({shoeIds}).
나중에 Loki 로 보낼 때 같은 필드 이름의 JSON 한 줄로 — `request_id` 로 DB 행과 잇는다. 라벨은 app · env · level 처럼 값 종류가 적은 것만(user_id 는 본문).

## 6. 계약

리뷰 응답 전부(작성자 · 새 키), 8번 신발, 사용자별 `liked`, 쓰기의 토큰이 계약을 바꾼다 — 의도한 변경이라 `contract/baseline/spring-v3` 로 다시 녹화한다(구현 마지막 단계).
Node 기준선(`baseline/node`)은 이력으로 둔다.
