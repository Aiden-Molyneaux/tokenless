import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.test.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    trace: 'retain-on-failure'
  }
})
