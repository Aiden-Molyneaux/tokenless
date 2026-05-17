import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'

test.describe('Phase 3 capture flow', () => {
  let userDataDir: string
  let app: ElectronApplication

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
    app = await electron.launch({
      args: [resolve('out/main/index.js')],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_SKIP_ONBOARDING: '1'
      }
    })
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  // Mirrors ensureProjectExists() from composer.e2e.test.ts — but always creates
  // a fresh project since each test gets a fresh userDataDir.
  async function createProject(page: Page, name: string, path: string): Promise<void> {
    const emptyState = page.getByRole('region', { name: /welcome to tokenless/i })
    if (await emptyState.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByRole('button', { name: /create your first project/i }).click()
    } else {
      // If the empty-state region label differs, fall back to the button directly.
      await page.getByRole('button', { name: /create your first project/i }).click()
    }
    await page.getByPlaceholder('My Project').fill(name)
    await page.getByPlaceholder('C:/path/to/project').fill(path)
    await page.getByRole('button', { name: /^create$/i }).click()
    await page.waitForSelector('.composer', { timeout: 5000 })
  }

  test('Capture button loads sanitized clipboard text into the prompt textarea', async () => {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Seed the OS clipboard via Electron's clipboard module (main-process side).
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText('Refactor src/auth.ts — short answer please')
    })

    await createProject(win, 'Capture Test', 'C:/tmp/e2e-capture')

    // Click Capture
    await win.getByRole('button', { name: /capture prompt from clipboard|^capture$/i }).click()

    // The prompt textarea fills with the sanitized clipboard text.
    await expect(win.locator('.prompt-textarea')).toHaveValue('Refactor src/auth.ts — short answer please')
  })

  test('shows the inline empty-hint when the clipboard is empty', async () => {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText('')
    })

    await createProject(win, 'Empty Test', 'C:/tmp/e2e-empty')

    await win.getByRole('button', { name: /capture prompt from clipboard|^capture$/i }).click()

    await expect(win.getByText(/clipboard is empty/i)).toBeVisible()
  })
})
