import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read package.json's version at test time so this assertion doesn't break
// every time the version bumps. Phase 8B (v1.0) wired the preload to read
// the baked __APP_VERSION__ from package.json via Vite define — the test
// should reflect the same source of truth.
const PACKAGE_VERSION = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version as string

let app: ElectronApplication

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test', TOKENLESS_SKIP_ONBOARDING: '1' }
  })
})

test.afterAll(async () => {
  await app.close()
})

// Phase 3: The app now starts with an empty DB. If no project exists the
// EmptyProjectsState blocks MainPane / Composer from rendering. This helper
// creates a project through the UI modal so subsequent assertions can proceed.
async function ensureProjectExists(page: Page): Promise<void> {
  const emptyState = page.getByRole('region', { name: /welcome to tokenless/i })
  if (await emptyState.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole('button', { name: /create your first project/i }).click()
    await page.getByPlaceholder('My Project').fill('E2E')
    await page.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e')
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.waitForSelector('.composer', { timeout: 5000 })
  }
}

test('window opens with the TokenLess title', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expect(page).toHaveTitle('TokenLess')
})

test('app shell renders TopBar brand + ConversationSidebar + MainPane with composer', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await ensureProjectExists(page)

  const brand = page.locator('.top-bar__brand')
  await expect(brand).toHaveText('TokenLess')

  const sidebar = page.locator('.conversation-sidebar')
  await expect(sidebar).toBeVisible()

  const mainPane = page.locator('.main-pane')
  await expect(mainPane).toBeVisible()

  await expect(page.locator('.composer')).toBeVisible()
  // v2: embedded terminal removed; the user runs Claude Code in their own
  // terminal and TokenLess captures prompts via the clipboard (phase 3).
})

test('preload exposes window.tokenless.version', async () => {
  const page = await app.firstWindow()
  const version = await page.evaluate(() => window.tokenless?.version)
  expect(version).toBe(PACKAGE_VERSION)
})
