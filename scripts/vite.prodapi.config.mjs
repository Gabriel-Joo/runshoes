// 화면 점검용 — 화면은 로컬 코드, /api 는 다른 서버로(docs/08_compare.md 5절 "화면 점검 방식")
//   운영 공개 API(읽기만):  npx vite --config scripts/vite.prodapi.config.mjs              → http://localhost:5179
//   로컬 Spring(로그인):    API_TARGET=http://localhost:3000 PORT=5180 npx vite --config scripts/vite.prodapi.config.mjs
// 운영에 붙인 화면에서는 쓰기(찜 · 리뷰 · 관리)를 하지 않는다. 상세 모달은 열어도 된다 — AI 요약은 DB 만 읽는다(V14).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = process.env.API_TARGET || 'https://runshoes.ronanlab.dev'
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5179,
    strictPort: true,
    // 운영은 Host 를 바꿔야 ingress 가 받는다. 로컬 Spring 은 그대로(쿠키 도메인)
    proxy: { '/api': { target, changeOrigin: !process.env.API_TARGET, secure: true } },
  },
})
