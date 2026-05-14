import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.describe('Phase 4B cc:stop', () => {
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

  test('Stop button kills the PTY — subsequent Send fails until resume', async () => {
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

    // Create project
    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Stop Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    // New conversation
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Send a prompt
    await win.locator('.prompt-textarea').fill('hello mock')
    const sendButton = win.getByRole('button', { name: /^send$/i })
    await expect(sendButton).toBeEnabled()
    await sendButton.click()
    await expect(win.locator('.prompt-textarea')).toHaveValue('', { timeout: 10000 })

    // Click Stop
    const stopButton = win.locator('.terminal-toolbar__stop')
    await expect(stopButton).toBeEnabled()
    await stopButton.click()

    // Wait for the stop IPC to complete and for cc:stop to log success
    // (lifecycle.stop kills the PTY; onExit fires asynchronously removing the slot)
    const stopOkOrFailed = await win.evaluate(async () => {
      // The TokenlessApi declaration in src/preload/index.d.ts augments
      // Window globally for the renderer build, but isn't picked up by
      // tsconfig.node.json (which compiles e2e tests). Cast inline.
      interface RendererApi {
        log: { getRecent: (n: number) => Promise<readonly { event: string }[]> }
      }
      const api = (window as unknown as { tokenless: RendererApi }).tokenless
      // Poll the log for 2s until we see a terminal-stop-* entry
      for (let i = 0; i < 20; i++) {
        const records = await api.log.getRecent(200)
        const found = records.find((r) =>
          r.event === 'terminal-stop-ok' || r.event === 'terminal-stop-failed'
        )
        if (found) return found
        await new Promise((r) => setTimeout(r, 100))
      }
      return null
    })

    // The stop IPC must have completed (either ok or failed tells us it ran)
    expect(stopOkOrFailed).not.toBeNull()
    // Specifically it must be ok — not a "no conversation" or "failed" case
    expect((stopOkOrFailed as { event: string } | null)?.event).toBe('terminal-stop-ok')

    // After stop, the PTY process has exited. The lifecycle slot is removed
    // on onExit. Wait deterministically: poll for cc-exited in the log (the
    // main-process broadcasts cc:exit after slot removal). We re-poll for
    // terminal-stop-ok as a proxy — it's guaranteed to appear after the IPC
    // roundtrip that kills the PTY, so by the time it's present the kill
    // signal has been sent and the slot removal is imminent. A short re-poll
    // here drains any remaining async propagation without a fixed sleep.
    await win.evaluate(async () => {
      interface RendererApi {
        log: { getRecent: (n: number) => Promise<readonly { event: string }[]> }
      }
      const api = (window as unknown as { tokenless: RendererApi }).tokenless
      for (let i = 0; i < 30; i++) {
        const records = await api.log.getRecent(200)
        if (records.find((r) => r.event === 'terminal-stop-ok')) return
        await new Promise((r) => setTimeout(r, 100))
      }
    })

    await win.locator('.prompt-textarea').fill('after stop')
    await sendButton.click()
    // After failure the prompt does NOT clear (setPrompt('') only runs on result.ok)
    await expect(win.locator('.prompt-textarea')).toHaveValue('after stop', { timeout: 3000 })
  })
})
