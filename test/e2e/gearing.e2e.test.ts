import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.describe('Phase 5A gearing flow', () => {
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

  test('clicking Gear with a mocked response renders the geared-review pane with cost preview', async () => {
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

    // Project setup
    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Gear Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    // Stub the gearing IPC handler at the main-process level.
    //
    // window.tokenless is exposed via contextBridge.exposeInMainWorld which
    // makes its properties non-writable + non-configurable in the renderer
    // world — renderer-side evaluate() cannot replace them. Instead we use
    // app.evaluate() to run in the main process, remove the real ipcMain
    // handler for 'gearing:gear', and install a deterministic stub that
    // returns a fixed GearResult envelope without making any Anthropic API
    // call.
    await app.evaluate(({ ipcMain }) => {
      const IPC_GEARING_GEAR = 'gearing:gear'
      ipcMain.removeHandler(IPC_GEARING_GEAR)
      ipcMain.handle(IPC_GEARING_GEAR, async () => {
        return {
          ok: true,
          data: {
            result: {
              originalPrompt: 'Refactor my code please',
              gearedPrompt: 'Refactor src/x.ts. Output: diff only.',
              critiqueFlags: [
                { severity: 'info', message: 'Compression: 80%' }
              ],
              tokenBreakdown: {
                haikuInputTokens: 100,
                haikuOutputTokens: 50,
                gearedInputEstimate: 20,
                originalInputEstimate: 120
              },
              costPreview: {
                expectedDollars: 0.0123,
                expectedInputTokens: 20,
                expectedOutputTokens: 800,
                modelLabel: 'Sonnet 4.7',
                haikuMetaDollars: 0.0003
              }
            }
          }
        }
      })
    })

    // Start a conversation so the conversationId is wired into the Composer.
    // The Send button is disabled when conversationId is null — use it as a
    // synchronisation signal that handleNewConversation() has completed.
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Type a prompt
    await win.locator('.prompt-textarea').fill('Refactor my code please')
    await expect(win.getByRole('button', { name: /^send$/i })).toBeEnabled({ timeout: 10000 })

    // Click Gear
    await win.getByRole('button', { name: /^gear$/i }).click()

    // GearReviewPane should be visible with the geared prompt + critique flag
    await expect(win.locator('.gear-review-pane')).toBeVisible({ timeout: 5000 })
    await expect(win.getByText('Refactor src/x.ts')).toBeVisible()
    await expect(win.getByText(/Compression: 80%/)).toBeVisible()
    // The cost preview should show the dollar amount
    await expect(win.getByText(/0\.0123/)).toBeVisible()
  })
})
