import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'bun:bundle': resolve(__dirname, 'shims/bun-bundle.ts'),
      src: resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
