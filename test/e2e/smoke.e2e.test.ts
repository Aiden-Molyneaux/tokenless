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
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window).toHaveTitle('TokenLess')
})

test('renderer mounts and shows the Phase 0 stub', async () => {
  const window = await app.firstWindow()
  const title = window.locator('.app__title')
  await expect(title).toHaveText('TokenLess')
  const subtitle = window.locator('.app__subtitle')
  await expect(subtitle).toContainText('Phase 0 stub')
})

test('preload exposes window.tokenless.version', async () => {
  const window = await app.firstWindow()
  const version = await window.evaluate(() => window.tokenless?.version)
  expect(version).toBe('0.0.1')
})
