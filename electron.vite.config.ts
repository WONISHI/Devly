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
          'command-executor': resolve('src/main/agent/command-executor.ts'),
          'isolated-patch': resolve('src/main/agent/isolated-patch.ts'),
          'terminal-service': resolve('src/main/terminal/service.ts'),
          'agent-tools': resolve('src/main/agent/tools.ts'),
          'database-worker': resolve('src/main/data/database-worker.ts'),
          'data-client': resolve('src/main/data/client.ts'),
          vault: resolve('src/main/data/vault.ts'),
          'data-service': resolve('src/main/data/service.ts'),
          'chat-runtime': resolve('src/main/chat/runtime.ts'),
          'schema-worker': resolve('src/main/extensions/schema-worker.ts'),
          'schedule-runtime': resolve('src/main/schedules/runtime.ts'),
          'browser-proxy': resolve('src/main/browser/proxy.ts'),
          'web-text-worker': resolve('src/main/web/text-worker.ts'),
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
