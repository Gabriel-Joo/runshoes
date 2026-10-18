# RUNSHOES — Spring Boot 3 + MySQL 8 전환 계획

> **작성일: 2026-09-22**
>
> **이 계획을 시작하기 전에 먼저 확인할 것:**
> - 실제 quota 여유 (student-quota, 정확한 값 확인 불가 — vcluster에서 조회 안 됨,
>   MySQL 배포 시 실제 시도하며 확인 필요)
>
> 이 문서는 실행하지 않고 보존하는 계획서다. 실제 구현 시작 시 Phase 0부터 순서대로 진행한다.
> 배경이 되는 설계 논의는 README 12장(데이터 계층 이관과 무중단 배포)을 참고.
>
> **2026-10-18 갱신 — 자체 클러스터 이주 뒤.** 학교 환경(vcluster · std-harbor · GitLab gitops · ollama 터널)에서
> 자체 kubeadm 클러스터로 옮겼다(docs/INFRA.md 11장).
> - **Phase 0 완료** — 응답 기준선을 녹화했다(`contract/`). 계획서와 실제 응답이 다른 곳이 있다 — `contract/README.md` "계획서와 다른 점"이 이 문서보다 우선한다
>   (`/api/*` Cache-Control 은 `no-cache`, DELETE 본문은 `{}`, OPTIONS 는 204)
> - **Phase 5 는 새 환경 기준으로 다시 썼다**(ronanlab-infra, local-path, 사람이 만드는 Secret, 수동 Sync, Ollama 직접 연결)
> - 아직 학교 기준인 곳 — 고칠 때 Phase 5 를 따른다: 상단 quota 확인, 0장 정정 2(gitops 경로), 1장 아키텍처(`nfs-std-1`, ollama 터널),
>   2.3·2.5의 CF Access 헤더(직접 연결이라 필요 없다), Phase 4(kaniko → BuildKit, 이미지는 지금도 둘), Phase 6, 부록 경로

---

## 0. 탐색 결과 — 확정된 사실 정정 (중요)

설계 전제 중 2가지가 실제 코드 검증 결과와 다르다. 구현 전 반드시 반영할 것.

### 정정 1: PATCH는 "null-ignore"가 아니라 "존재하는 키 덮어쓰기(present-key merge)"다

`json-server@0.17.4`의 PATCH는 `lodash-id`의 `updateById`를 사용한다:

- `node_modules/lodash-id/src/index.js` `updateById` → `this.assign(doc, attrs, {id: doc.id})`
- `assign`은 `Object.assign` 계열 — **body에 존재하는 키는 값이 null이어도 덮어씀**, body에 없는 키만 건드리지 않음.

프론트가 이를 의존한다: `src/pages/ShoeForm.tsx`의 PATCH는 빈 입력을 `null`로 보낸다
(`midsole: null`, `weight: null`, `price: null`, `stackHeight: null`).
Spring이 null을 무시하면 "수정 폼에서 항목을 비우고 저장"이 조용히 실패한다.
**Spring PATCH는 "body에 key가 존재하면(null 포함) set, 없으면 skip"** 으로 구현해야 한다.

### 정정 2: gitops 로컬 클론 존재, 구조 확인됨

`/home/ubuntu/workspaces/gitops/apps/runshoes/` — `kustomization.yaml`, `deployment.yaml`,
`pvc.yaml`, `service.yaml`, `ingress.yaml`. 주요 확인 사항:

- `kustomization.yaml`의 `images:`는 **이미 2개** (`runshoes`, `runshoes-chatbot`, 모두 `newTag: "58"`).
  Jenkins의 `sed "s|newTag:.*|newTag: \"${TAG}\"|"`는 두 줄 모두 교체(이미 매 빌드마다 chatbot도
  같은 태그로 재지정되고 있음). **이미지명이 그대로면 sed는 계속 동작 — seed-db 제거와 무관**
  (sed는 kustomization.yaml의 newTag 줄만 고침).
- `deployment.yaml`은: `strategy: Recreate`, initContainer `seed-db`(`runshoes:v1` — kustomize
  images transformer가 이것도 재태그함), app 컨테이너 env에 이미
  `OLLAMA_URL=https://ollama.ronanlab.dev` + `CF_ACCESS_CLIENT_ID/SECRET`
  (secret `cf-access-credentials`), `/data` PVC 마운트, readiness `/api/shoes`, liveness `/`,
  리소스 50m/128Mi req · 500m/512Mi limit. chatbot 사이드카(8766) 포함.
- `service.yaml`(http:80, ws:8766), `ingress.yaml`(`/ws/chat` → ws, `/` → http, traefik TLS) — **불변 유지**.

### 기타 검증된 데이터/계약 사실

| 항목 | 검증 결과 |
|---|---|
| shoes | 20행. null 허용 필요: `midsole`(id 4), `stackHeight`(id 3,6). `stackHeight`에 **소수(41.5, 40.5, 43.5, 34.5)** → DECIMAL(4,1). `rating` 3.7~4.8 → DECIMAL(2,1). `price/weight/drop`은 시드에 null 없지만 폼에서 null 가능 → 컬럼 nullable |
| reviews | 105행. `createdAt`: 69건 date-only, 36건 ISO-Z. **`likeCount` 2건 부재, `liked` 92건 부재**(13건만 true). 신규 POST는 likeCount/liked 미포함 → `like_count` NULL 허용 |
| terms | 13행, **id 12 중복**(weight / outsole). 프론트는 `term.key`로만 조인(`id` 미사용) → 재번호화 안전 |
| id 최대값 | shoes 20, reviews 105, terms 12(→13) → AUTO_INCREMENT 21 / 106 / 14 |
| 리스트 필터 | `plural.js`: 컬렉션에 존재하는 필드만 필터, **존재하지 않는 쿼리 파라미터는 무시**. 비교는 `elementValue.toString() === value` (문자열 등가). `_sort`는 lodash `orderBy` = **stable sort** → SQL에서 `ORDER BY x DESC, id ASC`로 재현해야 타이 순서 일치 |
| 404 | 미존재 id, 미존재 컬렉션 모두 최종 미들웨어에서 `res.status(404)` + `{}` (`router/index.js:81`) |
| DELETE | `destroy()`가 삭제된 entity를 응답(200). **`getRemovable`이 FK가 깨진 행을 추가 삭제** → shoe 삭제 시 reviews cascade 필요 |
| POST | `createId` = max+1 (`mixins.js`), 201 + Location 헤더 + `Access-Control-Expose-Headers: Location` |
| `/api/db` | json-server가 DB 전체 상태를 노출 — 프론트 미사용. 재현 생략(계약 이탈로 문서화만) |
| createdAt 표시 | `src/utils/date.ts`가 `new Date(iso)`로 상대시간 계산. **직렬화 시 인스턴스(오프셋)를 잃으면 KST에서 신규 리뷰가 "9시간 전"으로 표시되는 버그 발생** — UTC 저장 + `Z` 포함 직렬화 필수 |
| 로컬 툴체인 | Java 17.0.19 + Maven 3.8.7 + Docker 29 + Compose v5.1.3 사용 가능 → **Java 17 타깃 확정** |

---

## 1. 최종 아키텍처 (확정)

```
[같은 Pod]  runshoes(Spring Boot 3, :3000, 정적 SPA + /api/* + /actuator/health)
            chatbot(python ws, :8766 — 완전 불변)
[별도 Pod]  runshoes-mysql-0 (MySQL 8 StatefulSet, nfs-std-1 PVC)
[외부]      https://ollama.ronanlab.dev (CF Access 헤더, 기존 패턴 그대로)
```

- 단일 컨테이너가 API + SPA 서빙 (`/opt/app/static`에 Vite dist 복사, `file:` 리소스 핸들러).
- 이미지명 `std-harbor.kopoctc.kr/kopo17/runshoes` 유지 → Service/Ingress/Jenkins sed 무변경.
- 데이터 시드는 Flyway(V2)가 앱 부팅 시 적용 — seed-db initContainer 제거.

**전제 조건 (설계 기본값):**
1. Spring 프로젝트는 같은 레포 `backend/` 디렉터리 (Maven, Java 17)
2. 스프링 단일 컨테이너가 API + SPA 서빙 (이미지명·Service·Ingress 무변경, 챗봇 불변)
3. 요약 LLM은 ollama.ronanlab.dev + CF Access 유지 (Gemini는 향후 대안)
4. 이번 라운드는 users/인증 없음 — `liked` 전역 플래그 유지 (wire 형식 무변경)

---

## 2. 백엔드 파일 트리 (구체적 명세)

```
backend/
├─ pom.xml                          # Spring Boot 3.3.x, Java 17
│                                   # deps: web, data-jpa, validation(선택), flyway-core+flyway-mysql,
│                                   #       mysql-connector-j, actuator. (restclient은 spring-web에 포함)
└─ src/main/java/com/kopo17/runshoes/
   ├─ RunshoesApplication.java
   ├─ config/
   │  ├─ WebConfig.java            # CORS(모든 origin/method/header, credentials=false) +
   │  │                            # /api/** 응답에 Cache-Control: no-store 인터셉터 +
   │  │                            # static 리소스 핸들러(file:${app.static-path}, cache 1h)
   │  ├─ JacksonConfig.java        # LocalDateTime 유연 역직렬화(4패턴) / Z-리터럴 직렬화.
   │  │                            # ※ 글로벌 NON_NULL 금지 — shoe 4의 midsole:null은 반드시 출력됨
   │  └─ HttpClientConfig.java     # RestClient + timeouts(connect 5s, read 40s)
   ├─ domain/
   │  ├─ Shoe.java                 # 아래 매핑 표 참조
   │  ├─ Review.java
   │  └─ Term.java
   ├─ repository/
   │  ├─ ShoeRepository.java       # List<Shoe> findAllByOrderByIdAsc();
   │  ├─ ReviewRepository.java     # findByShoeIdOrderByIdAsc(Long), deleteByShoeId(Long)
   │  └─ TermRepository.java
   ├─ api/
   │  ├─ ShoeController.java       # GET/POST/PATCH/PUT/DELETE + /{id}/summary
   │  ├─ ReviewController.java
   │  ├─ TermController.java
   │  ├─ dto/SummaryResponse.java  # {summary:{positive,negative|null}|null, reason?:String}
   │  └─ support/JsonMerger.java   # JsonNode → "존재하는 키만" entity 반영 (정정 1의 핵심 유틸)
   └─ web/
      ├─ SpaForwardExceptionResolver.java  # NoResourceFoundException → /api면 404 {}, 아니면 GET이면 index.html forward
      └─ ApiErrorHandler.java      # /api/** 내 모든 미처리 경로 → 404 + {}
resources/
   ├─ application.yml              # 아래 참조
   └─ db/migration/
      ├─ V1__schema.sql
      └─ V2__seed_data.sql         # scripts/gen-seed-sql.mjs가 생성 (커밋된 산출물)
```

### 2.1 엔티티 JPA 매핑 (정확한 명세)

**Shoe** (`table shoes`)

| 필드 | 매핑 | 비고 |
|---|---|---|
| id | `@Id @GeneratedValue(strategy=IDENTITY)` `BIGINT` | |
| brand, model, purpose, stability, width, image, summary, description | `VARCHAR(100~1000) NOT NULL` | description 최대 186자(시드) → `VARCHAR(1000)` |
| midsole | `VARCHAR(100) NULL` | |
| weight, `drop`, price | `INT NULL` | 폼에서 null 가능 |
| stackHeight | `DECIMAL(4,1) NULL` `BigDecimal` | 41.5 존재 |
| wideAvailable, carbon, liked | `BOOLEAN NOT NULL` | |
| images | `List<String>` + `@JdbcTypeCode(SqlTypes.JSON)` `@Column(columnDefinition="json")` | Hibernate 6 네이티브 지원. (문제 시 `AttributeConverter<String↔JSON>` 폴백) |
| rating | `DECIMAL(2,1) NOT NULL` | |
| reviewCount, likeCount | `INT NOT NULL` | |

**Review** (`table reviews`): id IDENTITY, `shoe_id BIGINT NOT NULL` +
`FK → shoes(id) ON DELETE CASCADE` + 인덱스, author `VARCHAR(50)`, rating `INT`,
content `VARCHAR(1000)`, `created_at DATETIME NOT NULL`(UTC),
`like_count INT NULL` + `@JsonInclude(NON_NULL)`(부재 시 미출력 = 구서버 완전 일치),
`liked BOOLEAN NOT NULL DEFAULT FALSE`(항상 출력 — 프론트상 `undefined`와 `false` 동등, 무해).

**Term** (`table terms`): id IDENTITY, `key` `VARCHAR(50)`, name, short `VARCHAR(200) NULL`,
description `TEXT`. **`key`는 MySQL 예약어 → 컬럼명 `term_key`로 하고 `@Column(name="term_key")`**
(wire의 JSON 필드명 `key`는 그대로).

### 2.2 컨트롤러 계약 구현 핵심

- **공통**: `@GetMapping` 리스트는 `List<Entity>` 그대로 반환 (bare array, 절대 래핑 금지).
- **id 파라미터는 `String`으로 받아 직접 parse** — `Long` 바인딩이면 비숫자 id에서 400이 아닌
  404 `{}`가 나와야 함(json-server `getById`의 toString 비교와 동일).
- **GET 리스트 쿼리**: `shoeId`(숫자 등가, reviews만 의미 있음), `_sort`/`_order`
  (화이트리스트: rating/reviewCount/likeCount/price/weight 등 실제 컬럼만; `_order` 기본 asc).
  SQL: `ORDER BY {col} {dir}, id ASC`(stable sort 재현). 그 외 모든 쿼리 파라미터은 **무시**
  (json-server가 컬렉션에 없는 필드를 버리는 것과 동일).
- **POST**: body → entity 저장, `201` + `Location: {요청절대URL}/{newId}` 헤더 +
  `Access-Control-Expose-Headers: Location`. 클라이언트가 보낸 id는 무시(자동증가).
- **PATCH**: `@RequestBody JsonNode` → `JsonMerger.apply(entity, node, 허용필드셋)`:
  **필드가 node에 존재하면(null이어도) set, 없으면 skip.** 알 수 없는 필드는 무시.
  응답은 저장 후 전체 entity, 200. 대상 없으면 404 `{}`.
- **PUT**: 동일 경로, body 전체로 치환(id만 보존). 프론트 미사용, harness용.
- **DELETE**: 삭제 전 entity를 읽어 **그 객체를 body로 200 반환**.
  shoe 삭제는 `@Transactional`에서 `deleteByShoeId` 선행 → FK CASCADE와 이중 안전.
  대상 없으면 404 `{}`.
- **404 `{}`**: `@RestControllerAdvice` + `/api/**` catch-all(`/api/{*path}` 미매칭 → 404 `{}`),
  Content-Type `application/json`.
- **헤더**: 인터셉터에서 `/api/**`에 `Cache-Control: no-store`; CORS `*`는 `WebConfig`에서 전 경로.

### 2.3 SummaryService (Ollama)

- `GET /api/shoes/{id}/summary` — **항상 200**.
- 로직(`server.cjs` 29–91 라인 이식): 리뷰 수 < 3 → `{"summary":null,"reason":"리뷰가 3개 미만입니다"}`.
  캐시 `ConcurrentHashMap<Long, CachedSummary{summary, reviewCount}>` — reviewCount 동일하면 재사용.
  프롬프트는 **기존 텍스트를 그대로 복사**(공감 가중 · 의견 분열 병기 · 존댓말 · JSON 강제).
- `RestClient`(Boot 3.2+) POST `${OLLAMA_URL}/api/generate`
  `{model:"gemma4:e4b", prompt, stream:false}`, 헤더 `CF-Access-Client-Id/Secret`(값 있을 때만).
  timeout 40s.
- 응답 파싱: `data.response`에서 `\{[\s\S]*\}` 추출 → JSON parse → `{positive, negative}`;
  실패 시 `{positive: raw.trim(), negative: null}`.
- LLM 실패/타임아웃 → `{"summary":null,"reason":"요약을 불러오지 못했습니다"}` (200 유지, 로그만).
- 설정: `app.ollama.{url,model,timeout-ms,cf-client-id,cf-client-secret}` — 모두 env 오버라이드.

### 2.4 SPA 서빙 + BASE_PATH

- 정적 리소스: `spring.web.resources.static-locations: file:${app.static-path:/opt/app/static/}` —
  이미지 ENV `APP_STATIC=/opt/app/static`.
- 폴백: `NoResourceFoundException` 핸들러 — `/api`(및 `/actuator`)로 시작하면 404 `{}`,
  그 외 GET이면 `forward:/index.html`, 비-GET이면 404. (API catch-all이 먼저 매칭되므로 순서 충돌 없음.)
- **BASE_PATH는 `server.servlet.context-path: ${BASE_PATH:}`로 해결** — 웹터미널(`/g/kopo17/...`)
  백업 배포 지원용. 공백 기본값이면 루트. K8s는 미설정 → 루트 (기존과 동일).

### 2.5 application.yml

```yaml
server:
  port: ${SERVER_PORT:${PORT:3000}}          # 기존 매니페스트의 PORT env와 호환
  servlet.context-path: ${BASE_PATH:}
  compression.enabled: true
spring:
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:mysql://localhost:3306/runshoes?useSSL=false&allowPublicKeyRetrieval=true&connectionTimeZone=UTC}
    username: ${SPRING_DATASOURCE_USERNAME:runshoes}
    password: ${SPRING_DATASOURCE_PASSWORD:runshoes}
    hikari: { maximum-pool-size: 5, minimum-idle: 2 }
  flyway: { enabled: true, locations: classpath:db/migration }
  jpa:
    hibernate.ddl-auto: validate             # Flyway이 스키마 소유
    open-in-view: false
app:
  static-path: ${APP_STATIC:classpath:/static/}
  ollama: { url: ${OLLAMA_URL:http://localhost:5012}, model: gemma4:e4b, timeout-ms: 40000,
            cf-client-id: ${CF_ACCESS_CLIENT_ID:}, cf-client-secret: ${CF_ACCESS_CLIENT_SECRET:} }
management:
  endpoints.web.exposure.include: health
  endpoint.health.probes.enabled: true        # /actuator/health/liveness|readiness
  endpoint.health.group.readiness.include: readinessState,db   # 이게 있어야 readiness 가 DB 를 본다(기본은 readinessState 만)
```

### 2.6 Jackson 시간 규칙 (createdAt)

- 저장: **세션/서버 전부 UTC** (JDBC `connectionTimeZone=UTC`, 컨테이너 `TZ=UTC`,
  MySQL `default-time-zone=+00:00`).
- 역직렬화(유연): `yyyy-MM-dd` / `yyyy-MM-dd'T'HH:mm:ss` / `...SSS` / 오프셋 `X|XX|XXX` 포함
  모두 수용 — 오프셋 있으면 UTC로 정규화해 `LocalDateTime` 저장 (프론트 POST의
  `toISOString()` = ms+Z 대응).
- 직렬화: pattern `yyyy-MM-dd'T'HH:mm:ss'Z'` (값이 이미 UTC이므로 리터럴 Z) —
  **KST "9시간 전" 버그 방지**, `new Date(str)`이 정확한 인스턴스 복원.

---

## 3. db.json → SQL 변환

- **스크립트**: `scripts/gen-seed-sql.mjs` (Node ESM, 의존성 0). db.json 읽어
  `backend/src/main/resources/db/migration/V2__seed_data.sql` 생성 후 **산출물을 커밋**
  (일회성, 재실행 금지 — Flyway checksum).
- 변환 규칙:
  1. **terms 재번호화**: 12 중복 → 뒤의 `outsole`행을 13으로. 이후 id 1..13 연속. `AUTO_INCREMENT=14`.
  2. **createdAt 정규화**: `YYYY-MM-DD` → `'YYYY-MM-DD 00:00:00'`(UTC 자정);
     ISO-Z → UTC로 변환해 `'YYYY-MM-DD HH:MM:SS'`.
  3. **images**: `JSON.stringify(arr)` → `JSON` 컬럼에 INSERT (utf8mb4, 한글 그대로).
  4. **이스케이프**: 작은따옴표 `'` → `''`, 백슬래시 처리(JSON 문자열 내).
  5. **명시적 id INSERT + `ALTER TABLE ... AUTO_INCREMENT`**: shoes 21, reviews 106, terms 14
     (json-server `max+1`과 동일한 다음 id 보장).
  6. **reviews**: likeCount 부재 → NULL, liked 부재 → 0.
- **V1__schema.sql**: 위 2.1 표 그대로 + `CREATE INDEX idx_reviews_shoe_id` + FK CASCADE +
  `utf8mb4/utf8mb4_unicode_ci`.
- **검증 게이트**: 로컬 MySQL에서 row count 20/105/13, terms id 단일성, shoes id=4
  midsole NULL, reviews date-only/ISO 혼합 정규화 스팟체크.

---

## 4. Phase 구성 (게이트 포함)

### Phase 0 — 기준선 캡처 (반나절) — ✅ 2026-10-18 완료
> 산출물은 `contract/`(scenarios · record · diff · mock-ollama, 기준선 `contract/baseline/node` 50건 + `node-summary` 9건).
> 본 녹화는 운영 Pod(`runshoes:781be0832c14`)에서 시드 db.json 으로 시작해 떴고, 끝난 뒤 db.json 을 되돌렸다.
> 요약(시나리오 14)은 GPU 를 쓰지 않으려고 로컬 server.cjs + mock-ollama 로 떴다. 사용법은 `contract/README.md`.

**산출물**: `scripts/mock-ollama.mjs`(고정 응답 LLM stub, 20줄), `scripts/contract-diff.mjs` 골격.
**게이트**: 구서버(`PORT=3101 DB_PATH=<임시복사본> NODE_ENV=production OLLAMA_URL=http://localhost:3109
node server.cjs`) 기준 응답 녹화 — 아래 Phase 2의 전체 시나리오 목록이 이 시점에 확정됨.

### Phase 1 — 스키마 + 시드 + 로컬 MySQL (1일)
**산출물**: `docker-compose.yml`(루트; mysql:8.0 — utf8mb4, UTC, named volume, healthcheck
`mysqladmin ping`), `backend/pom.xml` + `V1/V2` + `gen-seed-sql.mjs`.
**게이트**: `docker compose up -d` → `mvn spring-boot:run`(3개 컨트롤러 없이 Flyway만) 부팅
로그에서 `Successfully applied 2 migrations`, SQL 검증(0장 검증 표 항목).

### Phase 2 — API 패리티 (2–3일, 핵심)
**산출물**: 엔티티/리포지토리/컨트롤러/JsonMerger/에러 핸들러/CORS·no-store/Jackson.
`scripts/contract-diff.mjs` 완성.
**harness 시나리오**(구/신 동시 구동, 동일 시퀀스 투입, 상태코드+JSON+헤더 비교):
1. `GET /api/shoes|reviews|terms` — bare array, **순서까지 완전 일치**(id ASC)
2. `GET /api/shoes/4` — `midsole:null` 출력 확인 / `GET /api/shoes/9999` → 404 + `{}` (body 정확히 `{}`)
3. `GET /api/foo`(미존재 컬렉션) → 404 `{}`; `GET /api/shoes/abc`(비숫자) → 404 `{}`
4. `GET /api/reviews?shoeId=3` / `?shoeId=9999`(빈 배열) / `?shoeId=3&junk=1`(junk 무시)
5. `GET /api/shoes?_sort=rating|reviewCount|likeCount&_order=desc` — **타이 순서까지 id ASC로 일치**
6. `POST /api/shoes`(전체 필드) → 201 + Location 헤더 + 본문 id = 기존 max+1
7. `POST /api/reviews`(likeCount 미포함 — 실제 프론트 형태) → 201, 응답에 likeCount 부재(NON_NULL)
8. `PATCH /api/shoes/{id}` `{liked, likeCount}` 2필드 — **나머지 필드 불변**
9. `PATCH /api/shoes/{id}` `{midsole:null, price:null}` — **null이 실제로 반영**
   (정정 1 검증, 구현 실패 시 즉시 수정)
10. `PATCH /api/reviews/{id}` `{rating, content}` / `PATCH /api/shoes/9999` → 404 `{}`
11. `DELETE /api/reviews/{id}` → 200 + 삭제된 entity 본문
12. `DELETE /api/shoes/{id}` → 200 + 본문 + 해당 shoeId reviews 전부 소멸(cascade)
13. headers: `/api/*` 응답 `Cache-Control: no-store` + `Access-Control-Allow-Origin: *`;
    OPTIONS preflight 200
14. summary(mock-ollama): 리뷰<3 케이스, ≥3 정상 케이스, mock이 500 →
    `{"summary":null,"reason":"요약을 불러오지 못했습니다"}`, 캐시 히트(2회째 mock 미호출 검증)
- **정규화 규칙**(실질 동등 허용): createdAt은 `Date.parse` 등가, 숫자는 epsilon,
  `liked` 부재 = `false`, decimal `4` ≡ `4.0`. 그 외는 엄격 diff.
**게이트**: 시나리오 1–13 전부 green(14는 Phase 3).

### Phase 3 — SPA 서빙 + summary 실연 (1일)
**산출물**: SpaForward + BASE_PATH(context-path) + 압축.
`backend/src/main/resources/static` 없이 `APP_STATIC` 경로 테스트.
**로컬 e2e 클릭 리스트**(`yarn dev` 5173 → Spring 3000 → compose MySQL; 챗봇은
`python chatbot_server.py` 선택):
- 홈/추천/베스트/소개/관리 페이지 렌더, 이미지·스크린샷 로드
- 정렬 버튼 4개(기본/평점/리뷰/좋아요) 결과 순서 육안 비교
- 신발 좋아요 토글(하트+카운트), "찜한 것만 보기"
- 리뷰 등록 → 말줄임/상대시간("방금 전" — **9시간 전 나오면 직렬화 버그**), 별점 수정, 삭제
- 리뷰 공감 토글, 베스트 리뷰 표시
- **요약 위젯**: 리뷰 3개 미만 신발 → 숨김 / 5개 신발 → 정상 요약
  (실제 ollama.ronanlab.dev + CF 자격 증명 사용 시)
- 관리자: 신규 등록(POST) → 수정(빈 필드 null 반영 = 정정 1의 UI 검증) →
  삭제(리뷰 동반 소멸)
- 새로고침 임의 URL(`/best`, `/admin`) 직접 접속 → SPA 폴백 200
- 챗봇 WS 연결/발화(선택)
**게이트**: harness 1–14 전부 green + 위 클릭 리스트 통과 + `yarn build` 프론트 무변경 확인.

### Phase 4 — 컨테이너 + Jenkins (1일)
**산출물**: 루트 `Dockerfile` 교체(멀티스테이지 3단), `.dockerignore` 갱신, Jenkinsfile(옵션 조정).
**Dockerfile**:
```dockerfile
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN yarn build                                   # → /app/dist

FROM maven:3.9-eclipse-temurin-17 AS server
WORKDIR /build
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline              # 캐시 레이어(kaniko 무캐시여도 가독성·로컬 유용)
COPY backend/src ./src
ENV MAVEN_OPTS=-Xmx1024m
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:17-jre-alpine
WORKDIR /opt/app
COPY --from=server /build/target/*.jar app.jar
COPY --from=web /app/dist ./static
ENV TZ=UTC APP_STATIC=/opt/app/static SERVER_PORT=3000
EXPOSE 3000
ENTRYPOINT ["java","-XX:MaxRAMPercentage=65","-jar","app.jar"]
```
- `.dockerignore` 추가: `backend/target`, `.claude`, `.bkit`, `.omc`, `scripts`(이미지 불필요),
  `gitops`(Jenkins 워크스페이스 잔재 방지). **유지: `db.json`(레퍼런스용, 57KB), `public/`
  (Vite 빌드 입력), `server.cjs`(롤백·웹터미널). 기존 `dist` 제외 유지(node 스테이지가 재빌드).**
- **Jenkinsfile**: 구조 무변경 가능(같은 `--dockerfile=${WORKSPACE}/Dockerfile`).
  유일 필수 검토: kaniko limit 2Gi 내 mvn `-Xmx1024m` 적합(검증 게이트 참조).
  kaniko 3번째 컨테이너 불필요(이미지 1개 그대로). `--snapshot-mode=redo --single-snapshot`
  유지 시 매 빌드 Maven Central 의존성 재다운로드(2–4분) — 변형: kaniko
  `--cache --cache-repo ${IMAGE}-cache`(선택 최적화).
**게이트**: `docker build` 로컬 성공 + 이미지 400MB 이하 확인 +
`docker run -p 3000:3000 --network host`(compose MySQL)로 **harness 전 시나리오 재실행 green**
(컨테이너 환경 패리티).

### Phase 5 — 매니페스트 + cutover (1–2일) — 자체 클러스터 기준 (2026-10-18 다시 씀)

> 전 판(학교 vcluster · `nfs-std-1` · gitops 레포에 stringData Secret · ollama 터널)을 바꿨다. 지금 배포의 사실은
> ronanlab-infra `apps/runshoes/README.md` · docs/INFRA.md 8·9장.

**지금(전환 전) 상태** — ronanlab-infra `apps/runshoes/`:

```
kustomization.yaml   images 2개(runshoes, runshoes-chatbot) — Jenkins sed 가 두 newTag 를 같은 커밋 해시 12자리로
app/pvc.yaml         runshoes-data (local-path 1Gi, RWO) — db.json
app/deployment.yaml  replicas 1 · Recreate · seed-db initContainer · runshoes(:3000) + chatbot(:8766)
                     OLLAMA_URL=http://192.168.122.1:11434 (CF_ACCESS_* 없음) · root 실행
app/service.yaml     http 80→3000 · chatbot 8766
app/ingress.yaml     ingress-nginx, runshoes.ronanlab.dev — / → http, /ws/chat → chatbot
scripts/create-secrets.sh   harbor-pull (사람이 돌린다)
```

ArgoCD Application `runshoes`(`platform/argocd/applications/runshoes.yaml`)는 **수동 Sync**(2026-10-18 자동을 껐다), prune · finalizer 없음,
Namespace 는 사람이 만든다. 이미지 태그는 Jenkins `runshoes-app` 이 커밋하지만 **Sync 를 누르기 전에는 배포되지 않는다** — 이것을 cutover 에 쓴다.

#### 5.1 MySQL — 결정: runshoes 네임스페이스에 자기 인스턴스

같은 클러스터의 petmint 가 MySQL StatefulSet(`petmint/mysql`, 데이터베이스를 앱별로 나누는 구조, 주석에 "나중에 runshoes")을 이미 운영한다.

| | A. 자기 인스턴스 (기본값) | B. petmint MySQL 에 데이터베이스 추가 |
|---|---|---|
| 격리 | 네임스페이스 · Secret · PVC 가 runshoes 안에 | petmint 네임스페이스의 StatefulSet · root 비밀번호에 기댄다 |
| 메모리 | +512Mi requests | 거의 0 |
| 바꿀 곳 | `apps/runshoes/` 만 | petmint 초기화 Job(`BOOTSTRAP_APPS`)과 Secret — petmint 를 건드린다 |
| 롤백 · 실험 | 혼자 지우고 다시 만든다 | petmint 와 같이 산다 |

→ **A**. 학습 목표(StatefulSet 직접 운영)와 맞고, 다른 프로젝트를 건드리지 않는다. 메모리가 모자라면 B 를 다시 본다(5.4).
설정은 petmint MySQL 과 맞춘다(같은 클러스터에서 검증된 값).

#### 5.2 ronanlab-infra 신규 · 수정 파일 (`apps/runshoes/`)

1. **`mysql/statefulset.yaml`** — `runshoes-mysql`, `replicas: 1`, `serviceName: runshoes-mysql`
   - image `mysql:8.0.46`(petmint 와 같은 고정 태그). **kustomization `images:` 에 넣지 않는다** — Jenkins sed 가 이 줄까지 바꾼다
   - args `--innodb-buffer-pool-size=256M --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --default-time-zone=+00:00 --performance-schema=OFF`
     (local-path 는 노드 디스크라 NFS 때의 `innodb_flush_method=fsync` 강제는 필요 없다)
   - env `MYSQL_ROOT_PASSWORD` · `MYSQL_DATABASE=runshoes` · `MYSQL_USER=runshoes` · `MYSQL_PASSWORD` — 전부 Secret `runshoes-mysql`
     (빈 데이터 디렉터리에서 처음 뜰 때 이미지가 DB · 계정을 만든다 — petmint 처럼 bootstrap Job 을 두지 않는다. 스키마 · 시드는 Flyway)
   - readiness/liveness `exec: mysqladmin ping -h 127.0.0.1 --silent`(비밀번호를 인자에 남기지 않는다), liveness `initialDelaySeconds: 60`
   - `terminationGracePeriodSeconds: 60`, `fsGroup: 999`
   - `volumeClaimTemplates` **local-path 2Gi**, `persistentVolumeClaimRetentionPolicy: Retain/Retain`
     (local-path StorageClass 의 reclaimPolicy 는 Delete — PVC 를 지우면 데이터도 사라진다. StatefulSet 을 지워도 PVC 는 남게)
   - resources req **200m/512Mi** · limit mem **1Gi**(petmint 와 같다)
2. **`mysql/service.yaml`** — headless(`clusterIP: None`) `runshoes-mysql:3306`
3. **`scripts/create-secrets.sh`** 확장 — `runshoes-mysql`(키 `MYSQL_ROOT_PASSWORD` · `MYSQL_PASSWORD`, 무작위)를 **없을 때만** 만든다.
   **평문은 git 에 두지 않는다**(전 판의 stringData 커밋을 버린다 — ronanlab-infra 의 다른 앱 · platform 과 같은 규칙).
   root 비밀번호는 데이터 디렉터리를 처음 만들 때만 쓰이므로 이미 있는 Secret 은 건드리지 않는다
4. **`app/deployment.yaml`** 수정
   - initContainer `seed-db`, `/data` 볼륨 마운트, **Pod 의 `volumes:` 항목까지** 제거 — 선언이 남으면 마운트하지 않아도 새 Pod 가
     local-path PV 에 붙어 그 노드에 묶인다. 롤백용으로는 PVC 오브젝트(`app/pvc.yaml`)만 남긴다(5.2-6)
   - `strategy: RollingUpdate {maxUnavailable: 0, maxSurge: 1}` — 앱이 무상태가 됐다. replicas 는 1 로 시작(늘리는 것은 따로)
   - runshoes env: `SPRING_DATASOURCE_URL=jdbc:mysql://runshoes-mysql:3306/runshoes?useSSL=false&allowPublicKeyRetrieval=true&connectionTimeZone=UTC`,
     `SPRING_DATASOURCE_USERNAME=runshoes`, `SPRING_DATASOURCE_PASSWORD`(Secret `runshoes-mysql` `MYSQL_PASSWORD`), `TZ=UTC`,
     `OLLAMA_URL=http://192.168.122.1:11434` 그대로. **`CF_ACCESS_*` 는 넣지 않는다**(사설망 직접 연결 — Access 를 거치지 않는다).
     `DB_PATH` 는 뺀다
   - probes: **startup** `/actuator/health`(period 2s, failureThreshold 60 — Flyway 첫 부팅), **readiness** `/actuator/health/readiness`,
     **liveness** `/actuator/health/liveness`. readiness 그룹은 기본으로 `readinessState` 만 본다 — DB 에 못 붙은 Pod 에 트래픽이 가지 않게
     application.yml 에 `management.endpoint.health.group.readiness.include: readinessState,db`(2.5 의 "DB SELECT 1 포함"은 이 설정이 있어야 맞다)
   - resources runshoes req 200m/512Mi · limit mem 1Gi. **chatbot 컨테이너는 그대로**(이미지 · 태그 · env)
   - 이미지는 root 로 돌던 Node 와 달리 Spring 이미지에서 `USER` 를 둔다면 `securityContext.runAsNonRoot` 를 이때 켠다(Phase 4 Dockerfile 과 같이 정한다)
5. **`kustomization.yaml`** — `resources:` 에 `mysql/service.yaml` · `mysql/statefulset.yaml` 추가. **`images:` 는 2개 그대로**
6. **`app/pvc.yaml`(`runshoes-data`)** — 유지(롤백 때 db.json). 관찰 기간 뒤 별도 커밋으로 지운다 — prune 이 없으니 클러스터에서도 손으로
7. **`README.md`** — MySQL · Secret · 데이터 · 롤백 절을 고친다

#### 5.3 Ollama

`OLLAMA_URL=http://192.168.122.1:11434` — Pod 가 VM 사설망(libvirt 192.168.122.0/24)으로 GPU 호스트에 바로 닿는다(petmint 도 같은 길).
`ollama.ronanlab.dev`(ollama-tunnel + Access Service Token)는 쓰지 않는다 — 2.3 · 2.5 의 `cf-client-id/secret` 설정은 빈 값이면 헤더를 보내지 않으므로 그대로 두거나 지운다.
**GPU 를 다른 프로젝트가 쓰는 동안에는 요약 실호출을 시험하지 않는다** — 5.6 smoke 에서 요약은 리뷰 3개 미만(Ollama 안 부름)만, 실호출은 GPU 가 빌 때.

#### 5.4 자원 계산

노드: 워커 3대 + control-plane, 각 메모리 약 3.9GiB(2026-10-18). 같은 노드에 Jenkins · Harbor · ArgoCD · ingress-nginx · cloudflared ·
petmint(앱 2 · MySQL)가 함께 산다. 학교 때와 달리 namespace quota 는 없다 — 대신 **노드 메모리가 상한**이다.

| | CPU req | MEM req | MEM limit |
|---|---|---|---|
| runshoes(Spring) | 200m | 512Mi | 1Gi |
| chatbot | 10m | 48Mi | 256Mi |
| runshoes-mysql | 200m | 512Mi | 1Gi |
| **상시 합계(지금 Node 50m/128Mi + 10m/48Mi 대비)** | **410m** | **~1.05Gi (+~900Mi)** | |
| CI 빌드 Pod(BuildKit — 웹 · Maven 두 스테이지) | +500m | +1.5Gi | 3Gi |

- 노드 하나에 MySQL · Spring · 빌드 Pod 가 겹치면 requests 만 ~2.5Gi — 스케줄러는 다른 노드로 보내지만, **limits 합이 노드 용량을 넘는 노드가 생긴다**
  (모니터링 README 실측: w3 limits 이미 89%). 적용 전에 `kubectl describe nodes` 의 Allocated resources 를 다시 보고,
  모자라면 VM 메모리 증설(모니터링과 같이 4096 → 8192) 또는 5.1 B 를 택한다
- Maven 빌드가 BuildKit limit 3Gi 안에 드는지(Node 스테이지 힙 1536Mi + `MAVEN_OPTS=-Xmx1024m`, 스테이지는 차례로 돈다) — Phase 4 게이트에서 확인

#### 5.5 Cutover 순서

수동 Sync 라 **앱 이미지와 매니페스트를 한 번의 Sync 로 같이 바꿀 수 있다** — 전 판의 "새 이미지가 DB env 없이 CrashLoopBackOff 하는 창"이 없다.

1. **MySQL 먼저** — ronanlab-infra 커밋 A: `mysql/` 2파일 + kustomization `resources` + `create-secrets.sh` 확장 → push
   → 사람이 `apps/runshoes/scripts/create-secrets.sh`(Secret `runshoes-mysql`) → **ArgoCD Sync(사람)**
   → `runshoes-mysql-0` Running/Ready, `kubectl -n runshoes exec runshoes-mysql-0 -- mysql -urunshoes -p… -e 'select 1' runshoes` (빈 DB)
   — 이 Sync 는 앱 Deployment 를 바꾸지 않는다(Node 그대로 서비스)
2. **앱 이미지** — 앱 레포 main 에 Spring 코드 + Dockerfile push → Jenkins 빌드 → 태그 커밋(newTag=N). **Sync 하지 않는다**(배포 안 됨, 이 상태로 둬도 된다)
3. **매니페스트** — ronanlab-infra 커밋 B: `app/deployment.yaml`(5.2-4) → push. ArgoCD 화면에 OutOfSync 로 Deployment 변경이 보인다 — diff 를 읽고
4. **Sync(사람) 한 번** — 이미지 N + 새 Deployment 가 같이 나간다 → Spring 기동 → Flyway V1/V2(데이터 이관) → readiness 통과 →
   옛 Node Pod 종료(RollingUpdate, maxUnavailable 0 — 끊김 없이 넘어가야 한다. 첫 배포만 Recreate → RollingUpdate 전환이라 확인한다)
5. **계약 확인** — 운영에서는 읽기만:
   `node contract/record.mjs --read-only --base http://192.168.122.240 --host runshoes.ronanlab.dev --out contract/run/prod-spring`
   → `node contract/diff.mjs --read-only contract/baseline/node contract/run/prod-spring` 가 PASS
   (쓰기 시나리오는 Phase 2 · 4 에서 로컬 · 컨테이너로 이미 green 이어야 한다 — 운영 MySQL 은 되돌리기가 db.json 보다 어렵다)
6. **이후** — 배포는 push → Jenkins → 태그 커밋 → Sync(사람). 자동 Sync 를 다시 켤지는 관찰 기간 뒤 정한다(`runshoes.yaml` 에 `automated` + `kubectl apply`)

#### 5.6 Prod smoke

- `https://runshoes.ronanlab.dev` — 홈 · 추천 · 베스트 · 관리, 이미지 로드, 임의 경로(`/best`, `/admin`) 새로고침(SPA 폴백 200)
- `/api/shoes` · `/api/reviews?shoeId=1` · `/api/terms` — 배열 · 개수(20/105/13) · 필드, 헤더는 **기준선과 같게**(`Cache-Control: no-cache`, `Access-Control-Allow-Origin: *`)
- 좋아요 토글, 리뷰 등록 → "방금 전"(9시간 전이면 직렬화 버그) → 수정 → 삭제, 관리 화면 등록 → 수정(빈 칸 null) → 삭제
  — 검증용으로 만든 것은 끝나면 지운다(MySQL 이라 db.json 처럼 파일을 되돌릴 수 없다)
- 요약 — 리뷰 3개 미만인 새 신발에서 숨김 확인. 실호출(리뷰 5개 신발)은 **GPU 가 빌 때만**
- 챗봇 `wss://runshoes.ronanlab.dev/ws/chat` 연결 · 환영 메시지(불변 확인). 질문은 GPU 가 빌 때
- `kubectl -n runshoes get pods` — runshoes-mysql-0 · runshoes(2/2) Ready, 로그에 Flyway `Successfully applied 2 migrations` 한 번(재시작 뒤 `up to date`)
- ArgoCD `runshoes` Synced/Healthy

#### 5.7 롤백

ronanlab-infra 에서 커밋 B 와 태그 커밋 N 을 revert → push → **Sync(사람)** → Node 배포가 돌아온다
(옛 이미지 태그는 Harbor 에 있고, `runshoes-data` PVC 의 db.json 도 그대로 — seed-db 는 파일이 있으면 건드리지 않는다).
**전환 뒤 MySQL 에 쓴 데이터는 롤백하면 안 보인다**(Node 는 db.json 을 읽는다) — 전환 직후 관찰 기간을 둔다.
MySQL StatefulSet · PVC 는 롤백해도 그대로 둔다(prune 없음).

### Phase 6 — 문서화·정리 (반나절)
- README 12장 "설계" → "완료"로 갱신(구현·검증 결과, 정정 1 패치 의미론 등),
  `docs/INFRA.md` 6/8/11장 갱신(요약 기능 이제 K8s에서 동작, RollingUpdate,
  MySQL StatefulSet 추가), `DEPLOY.md` 웹터미널 백업 배포 안내(context-path BASE_PATH).
- `server.cjs`/`db.json`/express·json-server 의존성은 **레포에 유지**
  (웹터미널 백업 배포 + harness 기준선 + 이미지에서만 자연 배제됨).

---

## 5. 리스크 · 갇힐 지점 (Top 10)

1. **PATCH null 의미론**(정정 1): JsonNode 기반 "키 존재" 병합으로만 구현.
   Map→DTO 변환 후 null-skip copy 쓰면 관리자 폼이 조용히 고장 — Phase 2 시나리오 9에서 강제 검증.
2. **kaniko 2Gi 내 Maven**: `MAVEN_OPTS=-Xmx1024m` + `-DskipTests`.
   부족 시 증상은 OOMKilled(빌드 Pod exit 137) — 이때 `dependency:go-offline` 분리·`-T1` 제거·
   테스트 완전 분리 순으로 조정. 회피 불가 시에도 limit 2Gi는 LimitRange 상한이라 상향 불가.
3. **Flyway 매 부팅**: checksum 불일치로 기동 실패 방지 — **적용된 V1/V2 절대 수정 금지**
   (변경은 V3+). 재생성 필요 시 `flyway repair` 절차 문서화. 첫 부팅 전 MySQL 미기동이면
   CrashLoopBackOff 후 자체 회복(startupProbe 관대하게).
4. **NFS + MySQL**: `innodb_flush_method=fsync` 강제(기본 O_DIRECT 계열이면 NFS에서
   크래시/에러), `performance_schema=OFF`, 심볼릭 링크 비활성. NFS 지연으로 mysqladmin ping
   probes에 완충(period 10s, failureThreshold 6).
5. **createdAt 타임존**: UTC 통일(세션·컨테이너·MySQL) + `Z` 리터럴 직렬화.
   어느 한 곳(KST JVM 기본 등) 새면 "9시간 전" 버그. JDBC URL에 `connectionTimeZone=UTC`
   누락이 최대 원인.
6. **sed 스코프**: kustomization `images:`에 runshoes/runshoes-chatbot 외 이미지 추가 금지.
   MySQL 이미지는 StatefulSet에 리터럴 태그.
7. **stable sort**: SQL `ORDER BY col DESC`만 쓰면 타이 순서가 구서버(삽입순=id순)와
   어긋나 리스트 깜빡임처럼 보임 → 항상 `, id ASC` 타이브레이커.
8. **쿼터**: 신규 상시 +500m/896Mi. 다른 학생 앱과 공유 시 공지. CI 빌드 중에도 피크 ~850m —
   안권이지만 mysql req를 512Mi→384Mi로 낮출 여지. (실제 quota 값은 배포 시 확인)
9. **JSON 컬럼 매핑**: Hibernate 6 `@JdbcTypeCode(SqlTypes.JSON)`이 버전에 따라
   `List<String>` 직렬화를 다르게 할 수 있음 → Phase 2 시나리오 1에서 images 배열 형태
   정확 비교. 문제 시 `AttributeConverter` 폴백.
10. **롤백 데이터 유실**: 전환 후 MySQL에 쓴 데이터는 구 앱 롤백 시 안 보임 —
    cutover 직후 관찰 기간 + 필요 시 MySQL→db.json 역내보내기 스크립트(선택) 확보.

---

## 6. 변형 옵션 (기록용)

- **Java 21 / Boot 3.5**: 로컬 툴체인이 17이라 17 확정. Docker 빌드 스테이지에서 21 사용
  가능하나 로컬 재현성 우선.
- **Gemini 요약 전환**: README 11장 방향. `SummaryService`의 LLM 호출부만 교체 가능하도록
  인터페이스 분리(`SummaryClient`)해 두면 이후 전환이 1파일 변경 — 권장(선택).
- **Jenkins에 maven 테스트 스테이지 추가**: 에이전트에 maven 컨테이너 추가(쿼터 소모) vs
  Dockerfile 내 `mvn test` vs 로컬 사전 검증 — 기본은 "로컬 사전 검증 + 이미지 `-DskipTests`".
- **review_likes/users 테이블**: 이번 라운드 제외(liked 전역 컬럼 유지).
  V1에 미리 만들지 않음(README 12.3과 달리) — 스키마 단순성 우선, 추후 V3로 추가.

---

## 부록 — 구현 시 참조할 핵심 파일

- `/home/ubuntu/workspaces/project/runshoes/Dockerfile` (교체 대상)
- `/home/ubuntu/workspaces/project/runshoes/Jenkinsfile` (옵션 검토)
- `/home/ubuntu/workspaces/gitops/apps/runshoes/deployment.yaml` (수정 대상)
- `/home/ubuntu/workspaces/gitops/apps/runshoes/kustomization.yaml` (resources에 mysql 추가)
- `/home/ubuntu/workspaces/project/runshoes/server.cjs` (계약 기준선 — JsonMerger/SummaryService 이식 소스)
