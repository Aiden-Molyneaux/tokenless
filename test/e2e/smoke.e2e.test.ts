import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'node:path'

let app: ElectronApplication

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
})

test.afterAll(async () => {
  await app.close()
})

test('window opens with the TokenLess title', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expect(page).toHaveTitle('TokenLess')
})

test('renderer mounts and shows the Phase 0 stub', async () => {
  const page = await app.firstWindow()
  const title = page.locator('.app__title')
  await expect(title).toHaveText('TokenLess')
  const subtitle = page.locator('.app__subtitle')
  // App subtitle text evolves per phase; assert non-empty and contains "Phase"
  await expect(subtitle).toContainText('Phase')
})

test('preload exposes window.tokenless.version', async () => {
  const page = await app.firstWindow()
  const version = await page.evaluate(() => window.tokenless?.version)
  expect(version).toBe('0.0.1')
})
