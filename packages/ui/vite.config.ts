import { serwist } from '@serwist/vite'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  resolve: {
    // Mirrors tsconfig "@/*": ["./*"] — "@" maps to the ui/ root.
    alias: { '@': path.resolve(import.meta.dirname, '.') },
    // Deduplicate React so Bun's .bun symlink cache doesn't load a second copy
    // (19.2.5 from the cache vs 19.2.7 from packages/ui/node_modules) during SSR.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-i18next', 'i18next'],
  },
  ssr: {
    // Force Vite to bundle these for SSR so their react import goes through
    // Vite's resolver (which respects dedupe) rather than Node's native resolution
    // following Bun's .bun symlinks to a mismatched React version.
    noExternal: ['react-i18next', 'i18next'],
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
    tailwindcss(),
    tanstackStart(),
    react(),
    ...serwist({
      type: 'module',
      swSrc: 'src/sw.ts',
      swDest: 'client/sw.js',
      globDirectory: 'dist/client',
    }),
  ],
})
