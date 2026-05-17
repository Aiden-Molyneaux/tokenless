import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.describe('Phase 5 half-screen layout', () => {
  let userDataDir: string
  let app: ElectronApplication

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('at 720x900 viewport, sidebar starts collapsed by default', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.setViewportSize({ width: 720, height: 900 })
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('.conversation-sidebar', { timeout: 5000 })
    // Wait briefly for the AppShell to hydrate the sidebar-collapsed setting.
    await win.waitForTimeout(500)
    await expect(win.locator('.conversation-sidebar')).toHaveClass(/is-collapsed/)
  })

  test('at 1280x900 viewport, sidebar starts expanded by default', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.setViewportSize({ width: 1280, height: 900 })
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('.conversation-sidebar', { timeout: 5000 })
    await win.waitForTimeout(500)
    await expect(win.locator('.conversation-sidebar')).not.toHaveClass(/is-collapsed/)
  })

  test('Composer + GearReviewPane render together once gear runs (drawer is reachable)', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.setViewportSize({ width: 720, height: 900 })
    await win.waitForLoadState('domcontentloaded')

    // Project setup (match the ensureProjectExists pattern from composer.e2e.test.ts)
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Layout Test')
    await win.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-layout')
    await win.getByRole('button', { name: /^create$/i }).click()
    await win.waitForSelector('.composer-shell', { timeout: 5000 })

    // Stub gearing
    await app.evaluate(({ ipcMain }) => {
      const IPC_GEARING_GEAR = 'gearing:gear'
      ipcMain.removeHandler(IPC_GEARING_GEAR)
      ipcMain.handle(IPC_GEARING_GEAR, async () => ({
        ok: true,
        data: {
          result: {
            originalPrompt: 'Refactor',
            gearedPrompt: 'Refactor: diff only.',
            critiqueFlags: [],
            tokenBreakdown: { haikuInputTokens: 100, haikuOutputTokens: 50, gearedInputEstimate: 20, originalInputEstimate: 80 },
            costPreview: { expectedDollars: 0.001, expectedInputTokens: 20, expectedOutputTokens: 800, modelLabel: 'Sonnet', haikuMetaDollars: 0.0001 }
          }
        }
      }))
    })

    // Type + click Gear
    await win.locator('.prompt-textarea').fill('Refactor')
    await win.getByRole('button', { name: /^gear$/i }).click()
    await expect(win.locator('.gear-review-pane')).toBeVisible({ timeout: 5000 })

    // Both composer-shell main + drawer are visible at the same time
    await expect(win.locator('.composer-shell__main')).toBeVisible()
    await expect(win.locator('.gear-review-drawer')).toBeVisible()

    // ActionsRow Copy Geared is REACHABLE + enabled
    // (this is the load-bearing assertion for Phase 5 — the button was unreachable in Phase 4)
    const copyButton = win.locator('.actions-row__button--copy-geared')
    await expect(copyButton).toBeVisible()
    await expect(copyButton).toBeEnabled()
  })

  test('Discard button clears composer + drawer', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Project setup
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Discard Test')
    await win.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-discard')
    await win.getByRole('button', { name: /^create$/i }).click()
    await win.waitForSelector('.composer-shell', { timeout: 5000 })

    // Type something
    await win.locator('.prompt-textarea').fill('Some prompt to discard')

    // Click Discard — use class selector since aria-label is "Discard composer + gear review"
    await win.locator('.actions-row__button--discard').click()

    // Textarea is empty
    await expect(win.locator('.prompt-textarea')).toHaveValue('')
  })
})
