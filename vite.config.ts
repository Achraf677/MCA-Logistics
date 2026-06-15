import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,                 // écoute sur 0.0.0.0 (accès via le port transféré du Codespace)
    allowedHosts: ['.app.github.dev'],  // autorise le domaine de forwarding GitHub Codespaces
  },
  test: { environment: 'node' },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
})
