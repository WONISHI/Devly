import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'database-worker': resolve('src/main/data/database-worker.ts'),
          'data-client': resolve('src/main/data/client.ts'),
          vault: resolve('src/main/data/vault.ts'),
          'data-service': resolve('src/main/data/service.ts'),
          'chat-runtime': resolve('src/main/chat/runtime.ts'),
          'patch-worker': resolve('src/main/agent/patch-worker.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    worker: { format: 'iife', rollupOptions: { output: { inlineDynamicImports: true } } },
    resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
    plugins: [react(), tailwindcss()],
  },
})
