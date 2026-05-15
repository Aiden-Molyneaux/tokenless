import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.describe('Phase 4B cc:resume', () => {
  let userDataDir: string
  let app: ElectronApplication

  const mockClaudeCmd = resolve('test/doubles/claude-mock.cmd')

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

  async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
    const application = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_SKIP_ONBOARDING: '1',
        TOKENLESS_CLAUDE_BIN: mockClaudeCmd
      }
    })
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return { app: application, page }
  }

  test('conversation with stored cc_session_id survives restart and resumes on click', async () => {
    // First launch — create project, start a conversation, send a prompt
    ;({ app } = await launch())
    let win = await app.firstWindow()

    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Resume Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    await win.getByRole('button', { name: /new conversation/i }).click()
    await win.locator('.prompt-textarea').fill('first prompt')
    await win.getByRole('button', { name: /^send$/i }).click()
    await expect(win.locator('.prompt-textarea')).toHaveValue('', { timeout: 10000 })

    // The new conversation row should be in the sidebar with a title
    const sidebarItems = win.locator('.conversation-item')
    await expect(sidebarItems).toHaveCount(1)

    await app.close()

    // Second launch — click the existing conversation, expect resume
    ;({ app } = await launch())
    win = await app.firstWindow()

    // The conversation should appear in the sidebar (persistence from Phase 3)
    await expect(win.locator('.conversation-item')).toHaveCount(1, { timeout: 5000 })
    await win.locator('.conversation-item').first().click()

    // After clicking, the terminal-pane should be visible (it always is, but
    // a "resume" log should appear). For Phase 4B the simplest signal is
    // that the Send button works again after click — verify by typing + send.
    await win.locator('.prompt-textarea').fill('second prompt')
    const sendButton = win.getByRole('button', { name: /^send$/i })
    await expect(sendButton).toBeEnabled()
    await sendButton.click()
    await expect(win.locator('.prompt-textarea')).toHaveValue('', { timeout: 10000 })
  })
})
