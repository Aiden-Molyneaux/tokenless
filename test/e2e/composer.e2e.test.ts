import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'node:path'

let app: ElectronApplication

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test', TOKENLESS_SKIP_ONBOARDING: '1' }
  })

  // Wait for the renderer process to finish loading — this guarantees the main
  // process completed app.whenReady() and registerIpcHandlers() ran, so the
  // 'gearing:gear' handler exists before we override it below.
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')

  // Phase 5A: Gear button now fires a real gearing:gear IPC call. Without an
  // ANTHROPIC_API_KEY in the E2E env it would fail with API_AUTH_FAILED — toast
  // appears, gearState stays null, GearReviewPane never renders. Stub the
  // handler in the main process so renderer-side tests don't depend on real API.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('gearing:gear')
    ipcMain.handle('gearing:gear', async (_e, req: { originalPrompt: string }) => ({
      ok: true,
      data: {
        result: {
          originalPrompt: req.originalPrompt,
          gearedPrompt: `Geared: ${req.originalPrompt}`,
          critiqueFlags: [{ severity: 'info', message: 'Composer E2E stub' }],
          tokenBreakdown: {
            haikuInputTokens: 50,
            haikuOutputTokens: 30,
            gearedInputEstimate: 10,
            originalInputEstimate: 40
          },
          costPreview: {
            expectedDollars: 0.0042,
            expectedInputTokens: 10,
            expectedOutputTokens: 800,
            modelLabel: 'Opus 4.7',
            haikuMetaDollars: 0.0002
          }
        }
      }
    }))
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

test('composer renders with textarea, 4 config dropdowns, and action buttons', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await ensureProjectExists(page)

  await expect(page.locator('.prompt-textarea')).toBeVisible()
  await expect(page.locator('.configs-row .dropdown')).toHaveCount(4)
  await expect(page.locator('.actions-row__button--gear')).toBeVisible()
  // Phase 2B → 7C: primary (Gear, Send) + secondary (Templates, Branch, Commit, Push) = 6 buttons.
  // Bumping the count whenever a button lands here is intentional — a tight count
  // assertion catches accidental button additions/removals.
  await expect(page.locator('.actions-row__button')).toHaveCount(6)
})

test('typing in the prompt textarea enables Gear and Send buttons', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await ensureProjectExists(page)

  const gearButton = page.locator('.actions-row__button--gear')
  await expect(gearButton).toBeDisabled()

  await page.locator('.prompt-textarea').fill('Refactor the auth middleware to flatten conditionals')
  await expect(gearButton).toBeEnabled()
})

test('clicking Gear swaps to GearReviewPane with original + geared text', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await ensureProjectExists(page)

  await page.locator('.prompt-textarea').fill('Refactor the auth middleware')
  await page.locator('.actions-row__button--gear').click()

  await expect(page.locator('.gear-review-pane')).toBeVisible()
  await expect(page.locator('.original-pane__text')).toContainText('Refactor the auth middleware')
  await expect(page.locator('.geared-pane__textarea')).toBeVisible()
})

test('Cancel button in GearReviewPane returns to Composer with prompt preserved', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await ensureProjectExists(page)

  // Dismiss any lingering GearReviewPane from a previous test before interacting with the composer.
  const gearPane = page.locator('.gear-review-pane')
  if (await gearPane.isVisible()) {
    await page.locator('.gear-review-pane__cancel').click()
    await expect(gearPane).toHaveCount(0)
  }

  await page.locator('.prompt-textarea').fill('Cancel test prompt')
  await page.locator('.actions-row__button--gear').click()
  await expect(page.locator('.gear-review-pane')).toBeVisible()

  await page.locator('.gear-review-pane__cancel').click()

  await expect(page.locator('.gear-review-pane')).toHaveCount(0)
  await expect(page.locator('.prompt-textarea')).toHaveValue('Cancel test prompt')
})

test('terminal section is visible with toolbar + meter + xterm pane', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await ensureProjectExists(page)

  await expect(page.locator('.terminal-section')).toBeVisible()
  await expect(page.locator('.terminal-toolbar__stop')).toBeVisible()
  await expect(page.locator('.terminal-toolbar__meter')).toBeVisible()
  await expect(page.locator('.terminal-pane')).toBeVisible()
})
