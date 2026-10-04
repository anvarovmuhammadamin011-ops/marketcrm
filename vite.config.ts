import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Kassa kompyuterida noto'g'ri manzilda ochilsa ham ilova ishlashi uchun
  // serverni 0.0.0.0 da ochamiz (lokal tarmoqdan planshet bilan ochish ham mumkin)
  server: {
    host: true,
    port: 5173,
  },
})
