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

test.beforeEach(async () => {
  // Reset localStorage to clear any state persisted from prior tests
  const page = await app.firstWindow()
  await page.evaluate(() => {
    window.localStorage.clear()
  })
})

test('Dev Mode toggle opens and closes the panel', async () => {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const toggle = window.locator('.app__dev-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toContainText('Show Dev Mode')

  // Panel starts hidden
  await expect(window.locator('.dev-mode-panel')).toHaveCount(0)

  // Click to show
  await toggle.click()
  await expect(window.locator('.dev-mode-panel')).toBeVisible()
  await expect(toggle).toContainText('Hide Dev Mode')

  // Click again to hide
  await toggle.click()
  await expect(window.locator('.dev-mode-panel')).toHaveCount(0)
})

test('Dev Mode panel shows live log records from main + renderer', async () => {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // Open dev mode (state may have persisted from prior test via localStorage)
  const toggle = window.locator('.app__dev-toggle')
  const toggleText = await toggle.textContent()
  if (toggleText?.includes('Show')) {
    await toggle.click()
  }

  // Wait for the panel to populate. The Logger emits 'logger-online', 'app-ready',
  // 'mount', and the toggle itself emits 'dev-mode-toggle'. We assert at least
  // the mount event from the renderer is visible.
  const mountRow = window.locator('.log-row__event', { hasText: 'mount' })
  await expect(mountRow.first()).toBeVisible({ timeout: 5_000 })
})

test('Dev Mode row expands to show JSON detail on click', async () => {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const toggle = window.locator('.app__dev-toggle')
  const toggleText = await toggle.textContent()
  if (toggleText?.includes('Show')) {
    await toggle.click()
  }

  // Find any row and click it
  const firstRow = window.locator('.log-row').first()
  await expect(firstRow).toBeVisible({ timeout: 5_000 })
  await firstRow.click()

  // The expanded detail row should appear
  await expect(window.locator('.log-row-detail')).toHaveCount(1)
  await expect(window.locator('.log-detail__json')).toBeVisible()
  await expect(window.locator('.log-detail__copy')).toContainText('Copy as JSONL')
})
