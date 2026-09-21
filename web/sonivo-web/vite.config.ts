import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
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
    },
  },
})
