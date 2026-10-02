import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The API proxy is shared by the dev server and `vite preview` so E2E can run
// against a static production build when the dev server is not stable.
const apiProxy = {
  '/api': {
    target: 'http://localhost:5171',
    changeOrigin: true,
  },
  // ADR-0036 conductor Hub (negotiate POST + WebSocket).
  '/hubs': {
    target: 'http://localhost:5171',
    changeOrigin: true,
    ws: true,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    proxy: apiProxy,
  },
})
