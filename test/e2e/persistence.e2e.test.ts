import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Purpose: a project created in one launch persists across a full restart.
// Uses a per-test userData directory so we don't pollute the developer's real
// app data.

test.describe('Phase 3 persistence', () => {
  let userDataDir: string
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* ignore */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
    const application = await electron.launch({
      args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir }
    })
    const firstWindow = await application.firstWindow()
    await firstWindow.waitForLoadState('domcontentloaded')
    return { app: application, page: firstWindow }
  }

  test('project created in first launch survives restart', async () => {
    // First launch — empty DB → onboarding visible → create a project
    ;({ app, page } = await launch())
    await expect(page.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await page.getByRole('button', { name: /create your first project/i }).click()
    await page.getByPlaceholder('My Project').fill('E2E Demo')
    await page.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-demo')
    await page.getByRole('button', { name: /^create$/i }).click()
    // Modal closes; ProjectSwitcher shows the new project
    await expect(page.getByText('E2E Demo')).toBeVisible()
    await app.close()

    // Second launch — same userData dir → project should still be there
    ;({ app, page } = await launch())
    await expect(page.getByText('E2E Demo')).toBeVisible()
    // Onboarding banner should NOT be visible since projects exist
    await expect(page.getByRole('region', { name: /welcome to tokenless/i })).not.toBeVisible()
  })
})
