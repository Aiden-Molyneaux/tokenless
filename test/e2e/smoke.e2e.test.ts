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

test('app shell renders TopBar brand + ConversationSidebar + MainPane', async () => {
  const page = await app.firstWindow()
  const brand = page.locator('.top-bar__brand')
  await expect(brand).toHaveText('TokenLess')

  const sidebar = page.locator('.conversation-sidebar')
  await expect(sidebar).toBeVisible()

  const mainPane = page.locator('.main-pane')
  await expect(mainPane).toBeVisible()
})

test('preload exposes window.tokenless.version', async () => {
  const page = await app.firstWindow()
  const version = await page.evaluate(() => window.tokenless?.version)
  expect(version).toBe('0.0.1')
})
