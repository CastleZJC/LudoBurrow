import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // 整体硬门槛；模块级（engines ≥90% / core ≥85%）由 release 脚本按 json-summary 校验
      thresholds: { lines: 80 },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/main.ts', 'src/i18n/zh-CN.ts', 'src/i18n/en-US.ts'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
