import { defineConfig } from "vite"

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist/client",
    lib: {
      entry: "src/sw.ts",
      formats: ["es"],
      fileName: () => "sw.js",
    },
    rollupOptions: {
      output: {
        entryFileNames: "sw.js",
      },
    },
  },
})
