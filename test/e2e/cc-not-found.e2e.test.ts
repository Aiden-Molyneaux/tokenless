import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.describe('Phase 4B §7.1 CLAUDE_NOT_FOUND modal', () => {
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

  test('ClaudeNotFoundModal appears when TOKENLESS_CLAUDE_BIN points to a non-existent binary', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_SKIP_ONBOARDING: '1',
        TOKENLESS_CLAUDE_BIN: 'C:/this/path/does/not/exist/claude.cmd'
      }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Start from a fresh empty state
    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()

    // Set up a project
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Not Found Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    // Click New Conversation — this will attempt to spawn the non-existent binary
    await win.getByRole('button', { name: /new conversation/i }).click()

    // The ClaudeNotFoundModal should appear
    const modal = win.getByRole('dialog', { name: /claude not found/i })
    await expect(modal).toBeVisible({ timeout: 5000 })

    // The modal has a Dismiss button that closes it
    await win.getByRole('button', { name: /dismiss/i }).click()
    await expect(modal).not.toBeVisible()
  })
})
