import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.unit.test.ts',
      'src/**/__tests__/**/*.unit.test.tsx',
      'src/**/__tests__/**/*.integration.test.ts',
      'src/**/__tests__/**/*.integration.test.tsx'
    ],
    exclude: ['node_modules', 'out', 'dist', 'test/e2e/**'],
    reporters: ['default']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  }
})
