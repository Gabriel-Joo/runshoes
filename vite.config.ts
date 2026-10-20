import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => ({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  // dev 에서도 같은 출처의 /api — 로그인 refresh 쿠키(Path=/api/auth)가 운영과 같게 붙는다. /api/auth 는 CORS 를 열지 않는다
  server: { proxy: { '/api': 'http://localhost:3000' } },
}))