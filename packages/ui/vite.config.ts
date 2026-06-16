import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  resolve: {
    // Mirrors tsconfig "@/*": ["./*"] — "@" maps to the ui/ root.
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
  server: {
    // Keep AGENTS.md's https://localhost.panit.dev browser-testing flow working.
    host: true,
    port: 3000,
    allowedHosts: ['localhost.panit.dev'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  plugins: [tailwindcss(), tanstackStart(), react()],
})
