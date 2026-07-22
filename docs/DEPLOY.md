# 배포 가이드 — 폴리텍 aisw-lab 웹 터미널

Vite + React + json-server 프로젝트를 교내 배포판(`aisw-apps.kopoctc.kr`)에 올리는 절차.
RUNSHOES 배포 과정에서 겪은 시행착오를 정리한 문서로, 다른 프로젝트에도 그대로 적용할 수 있다.

---

## 1. 환경 파악

### 웹 터미널

```
https://aisw-lab.kopoctc.kr/
```

code-server(브라우저 VS Code) 기반. 홈 디렉터리는 `/home/<학번ID>`.

```bash
node -v     # v20.20.2
npm -v      # 10.8.2
             # yarn 없음 → npm 사용
```

인터넷 접속 가능(`npm install` 정상 동작).

### 서비스 공개 규칙

- 홈 디렉터리의 **폴더 이름이 곧 URL 경로**가 된다
  `~/project-runshoes` → `/g/<ID>/project-runshoes/`
- 폴더 안에 **`server.port` 파일이 있으면 플랫폼이 자동 감지**해 외부에 연결한다
- 공개 도메인은 **`aisw-apps.kopoctc.kr`** (작업 도메인 `aisw-lab`과 다름)
- 마이페이지 → **내 공유 앱 → 외부 공개 체크 → 변경사항 저장**을 해야 실제로 열린다

```
최종 주소: https://aisw-apps.kopoctc.kr/g/<ID>/<폴더명>/
```

---

## 2. 프로젝트에 미리 넣어둘 파일

### `vite.config.ts` — base 경로

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/g/kopo17/project-runshoes/" : "/",
}));
```

> `process.env.NODE_ENV === 'production'` 방식은 Vite 빌드에서 안 잡힐 수 있다.
> `command === 'build'`가 확실하다.

### `src/main.tsx` — 라우터 basename

```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
  <App />
</BrowserRouter>
```

### `src/api.ts` — API 주소 + 정적 자산 경로

```ts
const isDev = import.meta.env.DEV;

export const API = isDev
  ? "http://localhost:3000"
  : `${import.meta.env.BASE_URL}api`;

export const asset = (p: string) =>
  p.startsWith("/") ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}${p}` : p;
```

> **`asset()`이 핵심.** Vite는 빌드 시 JS·CSS 경로에만 base를 붙인다.
> `db.json`이나 코드 안의 `"/images/x.png"` 같은 **런타임 문자열은 손대지 않으므로**
> 이미지가 배포 환경에서 404가 난다. 렌더할 때 `asset()`으로 감싸야 한다.

적용 위치: `<img src={asset(경로)} />`가 있는 모든 컴포넌트.

### `server.cjs` — 프론트 + API 통합 서버

```js
const express = require("express");
const jsonServer = require("json-server");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = "/g/kopo17/project-runshoes";

// API — 프리픽스 유무 양쪽 대응
app.use("/api", jsonServer.defaults(), jsonServer.router("db.json"));
app.use(`${BASE}/api`, jsonServer.defaults(), jsonServer.router("db.json"));

// 정적 파일 — 프리픽스 유무 양쪽 대응
app.use(express.static(path.join(__dirname, "dist")));
app.use(BASE, express.static(path.join(__dirname, "dist")));

// SPA 폴백 (새로고침 대응)
app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
```

**확장자가 `.cjs`인 이유**
Vite 프로젝트의 `package.json`에는 `"type": "module"`이 있어서
`.js` 파일이 ES 모듈로 취급된다. `require`를 쓰려면 `.cjs`여야 한다.

**`/*splat`인 이유**
Express 5는 `path-to-regexp` 최신 버전을 써서 이름 없는 와일드카드(`/*`)를 거부한다.
`PathError: Missing parameter name` 에러가 나면 이 문제다.
Express 4를 쓰면 `/*` 그대로 가능하다.

**프리픽스 유무를 둘 다 받는 이유**
플랫폼 프록시가 경로 앞부분을 잘라서 전달할 수 있다.
서버 단독 `curl`은 200인데 브라우저는 404인 상황이면 이 문제다.

### `start_server.sh`

```bash
#!/bin/bash
cd "$(dirname "$0")"
if [ -f server.pid ] && kill -0 "$(cat server.pid)" 2>/dev/null && [ -f server.port ]; then
  echo "이미 실행 중 (포트 $(cat server.port))"; exit 0
fi
rm -f server.pid
PORT=$(python3 -c "import socket,random
def free(p):
 s=socket.socket();r=s.connect_ex(('127.0.0.1',p));s.close();return r!=0
for p in random.sample(range(10000,20000),100):
 if free(p): print(p); break")
PORT=$PORT setsid node server.cjs > server.log 2>&1 &
echo $! > server.pid; echo "$PORT" > server.port; sleep 1
echo "서버 실행됨 (포트 $PORT)."
```

10000~20000 사이 빈 포트를 잡아 백그라운드로 실행하고 `server.port`에 기록한다.

### `package.json`

`express`와 `json-server`가 **`dependencies`에 있어야 한다.**
`devDependencies`에 있으면 프로덕션 설치에서 빠질 수 있다.

```bash
yarn add express json-server@0.17.4
```

### `.gitignore`

```
server.pid
server.port
server.log
```

`dist`도 무시 대상이다. 서버에서 직접 빌드하므로 커밋하지 않는다.

---

## 3. 배포 절차

### 최초 1회

```bash
cd ~
git clone <레포주소> project-runshoes
cd project-runshoes
npm install
npm run build
chmod +x start_server.sh
bash start_server.sh
cat server.log        # listening on <포트> 확인
```

그다음 마이페이지 → 내 공유 앱 → **외부 공개 체크 → 변경사항 저장**

### 이후 갱신

```bash
cd ~/project-runshoes
git pull
npm run build
rm -f server.pid server.port
bash start_server.sh
```

브라우저에서 **Ctrl+Shift+R**(캐시 무시 새로고침).

---

## 4. 문제 해결

| 증상                                        | 원인                                | 해결                                                 |
| ------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `require is not defined in ES module scope` | `package.json`에 `"type": "module"` | 파일 확장자를 `.cjs`로                               |
| `PathError: Missing parameter name`         | Express 5의 와일드카드 문법         | `/*` → `/*splat`                                     |
| `server.log`가 비어 있고 프로세스가 없음    | 즉시 종료됨                         | `PORT=13000 node server.cjs`로 직접 실행해 에러 확인 |
| JS·CSS가 404                                | `base` 미설정                       | `grep script dist/index.html`로 경로 확인            |
| 이미지만 404                                | 런타임 경로에 base 미적용           | `asset()` 헬퍼 적용                                  |
| `curl`은 200인데 브라우저는 404             | 프록시가 프리픽스를 자름            | 서버가 양쪽 경로를 모두 받게                         |
| "현재 비공개 상태입니다"                    | 외부 공개 미설정                    | 마이페이지에서 공개 전환                             |
| 마이페이지 목록에 프로젝트가 없음           | 서버가 죽어 있음                    | `ps aux \| grep server.cjs` 확인 후 재시작           |
| `git pull` 충돌                             | 서버에서 파일을 직접 수정함         | `git checkout -- <파일>` 후 pull                     |

### 유용한 진단 명령

```bash
ps aux | grep server.cjs                 # 프로세스 생존 확인
cat server.log                           # 서버 로그
cat server.port                          # 할당된 포트
curl -I http://localhost:$(cat server.port)/g/<ID>/<폴더>/       # HTML 응답
curl -I http://localhost:$(cat server.port)/g/<ID>/<폴더>/api/shoes  # API 응답
grep script dist/index.html              # 빌드 base 경로 확인
tail -f server.log                       # 실시간 요청 로그
```

---

## 5. 운영 시 주의

### 데이터가 바뀐다

배포된 사이트는 **로그인이 없어서 누구나 데이터를 수정할 수 있다.**
리뷰 등록·삭제는 물론 관리 페이지에서 항목 삭제까지 가능하다.
키오스크 등 공개 환경에서는 실제로 데이터가 변경된다.

**알림은 오지 않는다.** 요청 기록은 `server.log`에만 남는다.

### 복구

`db.json`이 git에 포함되어 있으므로 언제든 되돌릴 수 있다.

```bash
cd ~/project-runshoes
git checkout -- db.json
rm -f server.pid server.port
bash start_server.sh
```

시연이나 채점 전에 한 번 돌려두면 깨끗한 상태로 시작할 수 있다.

### 서버 중지

마이페이지의 **서버 중지** 버튼, 또는

```bash
kill $(cat server.pid)
rm -f server.pid server.port
```

---

## 6. 배포판 등록

교내 프로젝트 배포판(키오스크)에 등록하려면:

```
본인 ID       kopo17
프로젝트 이름  RUNSHOES
진행상황      최종 테스트
링크         https://aisw-apps.kopoctc.kr/g/kopo17/project-runshoes/
```

`Insert`로 신규 등록, `정보 수정`으로 변경. 같은 ID로 여러 프로젝트를 등록할 수 있다.

---

## 7. 다른 프로젝트에 적용할 때

바꿔야 할 것은 **경로 문자열 두 곳뿐**이다.

1. `vite.config.ts`의 `base`
2. `server.cjs`의 `BASE`

둘 다 `/g/<학번ID>/<폴더명>/` 형식으로 맞추고,
웹 터미널의 폴더 이름을 동일하게 만들면 된다.

나머지 파일(`start_server.sh`, `api.ts`의 `asset()`)은 그대로 재사용할 수 있다.
