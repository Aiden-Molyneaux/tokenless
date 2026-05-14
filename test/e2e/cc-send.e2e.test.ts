import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Purpose: clicking New Conversation creates a row + spawns the (mock) claude
// subprocess; typing a prompt + Send writes a turn row and the composer field
// clears (the success path's observable side-effect).

test.describe('Phase 4A cc send/stream', () => {
  let userDataDir: string
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try {
        await app.close()
      } catch {
        // best-effort
      }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('new conversation + send streams mock response into terminal', async () => {
    const mockClaudeCmd = resolve('test/doubles/claude-mock.cmd')
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_CLAUDE_BIN: mockClaudeCmd
      }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Create a project first (same pattern as Phase 3 persistence test).
    // The seed creates a "Personal" account on first boot, so activeAccountId
    // will be set. We just need a project.
    const emptyState = win.getByRole('region', { name: /welcome to tokenless/i })
    if (await emptyState.isVisible({ timeout: 2000 }).catch(() => false)) {
      await win.getByRole('button', { name: /create your first project/i }).click()
      await win.getByPlaceholder('My Project').fill('CC Test')
      await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
      await win.getByRole('button', { name: /^create$/i }).click()
      // Wait for the composer to appear (project active state reached)
      await win.waitForSelector('.composer', { timeout: 5000 })
    }

    // Verify the MainPane with terminal-pane is visible after project creation
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 5000 })

    // Start a new conversation — this spawns the mock claude subprocess.
    // Wait for the activeAccountId to be set (accounts load async) before clicking.
    await expect(win.locator('.conversation-sidebar')).toBeVisible()
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Type into the composer and send
    await win.locator('.prompt-textarea').fill('hi there')
    const sendButton = win.getByRole('button', { name: /^send$/i })
    await expect(sendButton).toBeEnabled()
    await sendButton.click()

    // After a successful Send the composer clears the prompt text (setPrompt('')
    // is called only on result.ok). xterm renders to canvas so we can't assert
    // on terminal text directly — the textarea clearing is the cleanest signal.
    page = win
    await expect(win.locator('.prompt-textarea')).toHaveValue('', { timeout: 10000 })

    // Also verify we are back to idle (not stuck in sending=true) by typing
    // more text and confirming the Send button becomes enabled again.
    await win.locator('.prompt-textarea').fill('second prompt')
    await expect(sendButton).toBeEnabled({ timeout: 5000 })
  })
})
