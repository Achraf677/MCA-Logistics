import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'node' },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
})
