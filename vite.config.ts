import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// `npm run dev` proxies the API paths to a running beenfard, so the browser
// sees one origin, as it does behind the reverse proxy in production.
const beenfard = process.env.BEENFARD_URL ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '^/(beenfar\\.|api/|auth/|openapi\\.json|healthz)': { target: beenfard, changeOrigin: false },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
})
