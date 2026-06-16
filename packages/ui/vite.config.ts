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
  // Exclude postal-mime from Vite's esbuild pre-optimisation so the dev server
  // serves its native ESM source directly instead of wrapping it in a
  // __commonJS/__toESM shim.  The production build handles the interop in
  // lib/queries.ts via an explicit typeof guard on the dynamic import result.
  optimizeDeps: {
    exclude: ['postal-mime'],
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
  plugins: [
    // Plugin order is load-bearing: Cloudflare before TanStack Start.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
})
