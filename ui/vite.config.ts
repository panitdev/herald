import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
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
  },
  plugins: [
    // Plugin order is load-bearing: Cloudflare before TanStack Start.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
})
