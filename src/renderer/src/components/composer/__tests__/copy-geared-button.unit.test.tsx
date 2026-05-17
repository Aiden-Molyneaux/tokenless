// @vitest-environment happy-dom

// Purpose: Copy Geared button is disabled until a gear result exists; clicking
// it in the GearReviewPane writes to clipboard, shows a success toast + clears
// state on ok, or shows an error toast + preserves state on WRITE_FAILED.

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

import { Composer } from '../Composer'
import { ToastProvider } from '../../../hooks/use-toast'
import { ToastHost } from '../../notifications/ToastHost'

// ---------- Shared fixture: a deterministic GearResult ----------

const FIXED_GEAR_RESULT = {
  originalPrompt: 'Refactor src/auth.ts',
  gearedPrompt: 'Refactor src/auth.ts. Output: diff only.',
  critiqueFlags: [],
  tokenBreakdown: {
    haikuInputTokens: 100,
    haikuOutputTokens: 50,
    gearedInputEstimate: 20,
    originalInputEstimate: 80
  },
  costPreview: {
    expectedDollars: 0.001,
    expectedInputTokens: 20,
    expectedOutputTokens: 800,
    modelLabel: 'Sonnet',
    haikuMetaDollars: 0.0001
  }
}

// ---------- window.tokenless mock ----------
// Extends the capture-button mock shape with clipboard.writeGeared.
// gearingMock.gear is a vi.fn() that tests override per scenario.

let writeGearedMock: ReturnType<typeof vi.fn>
let gearMock: ReturnType<typeof vi.fn>

function buildTokenlessMock(): unknown {
  writeGearedMock = vi.fn()
  gearMock = vi.fn()

  return {
    clipboard: {
      readPrompt: vi.fn().mockResolvedValue({ ok: false, code: 'EMPTY' }),
      writeGeared: writeGearedMock
    },
    gearing: {
      gear: gearMock
    },
    pricing: {
      list: vi.fn().mockResolvedValue({ ok: true, data: { entries: [] } })
    },
    drafts: {
      save: vi.fn().mockResolvedValue({ ok: true, data: { draft: null } }),
      get: vi.fn().mockResolvedValue({ ok: true, data: { draft: null } }),
      clear: vi.fn().mockResolvedValue({ ok: true, data: { cleared: true } })
    },
    settings: {
      get: vi.fn().mockResolvedValue({ ok: true, data: { value: null } })
    },
    skills: {
      list: vi.fn().mockResolvedValue({ ok: true, data: { skills: [] } }),
      onChanged: vi.fn().mockReturnValue(() => { /* unsubscribe noop */ })
    },
    log: {
      send: vi.fn()
    }
  }
}

// ---------- Render helper ----------

function renderComposer(): ReturnType<typeof render> {
  ;(window as unknown as { tokenless: unknown }).tokenless = buildTokenlessMock()
  return render(
    <ToastProvider>
      <ToastHost />
      <Composer conversationId={1} accountId={1} accountLabel="test@example.com" />
    </ToastProvider>
  )
}

// ---------- Shared helper: gear up the Composer ----------
// Fills the prompt textarea, mocks gear to return the fixed result, clicks Gear,
// and waits for the GearReviewPane to appear (signalled by the "Copy geared" button).

async function runGearFlow(): Promise<void> {
  gearMock.mockResolvedValue({ ok: true, data: { result: FIXED_GEAR_RESULT } })

  const textarea = screen.getByPlaceholderText(/type your prompt here/i)
  await act(async () => {
    fireEvent.change(textarea, { target: { value: 'Refactor src/auth.ts' } })
    await Promise.resolve()
  })

  const gearBtn = screen.getByRole('button', { name: /^gear$/i })
  await act(async () => {
    fireEvent.click(gearBtn)
    await Promise.resolve()
    await Promise.resolve()
  })

  await screen.findByRole('button', { name: /copy geared/i })
}

// ---------- Helper: click a button with async settle ----------

async function clickButton(name: RegExp | string): Promise<void> {
  const btn = screen.getByRole('button', { name })
  await act(async () => {
    fireEvent.click(btn)
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ---------- Tests ----------

describe('Composer / Copy Geared', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('the ActionsRow Copy Geared button is disabled when gearState is null', async () => {
    // No gear run — gearState is null. The ActionsRow Copy Geared button must be
    // disabled (copyDisabled prop is true when gearState === null).
    renderComposer()
    // Gear mock returns an error so gearState never populates even if clicked.
    gearMock.mockResolvedValue({
      ok: false,
      error: { code: 'API_UNKNOWN', message: 'noop', logId: null }
    })

    const copyBtn = screen.getByRole('button', { name: /copy geared prompt to clipboard/i })
    expect(copyBtn).toBeDisabled()
  })

  it('writes the geared text to clipboard when Copy geared is clicked in the GearReviewPane', async () => {
    renderComposer()
    writeGearedMock.mockResolvedValue({ ok: true })

    await runGearFlow()

    // Click the GearReviewPane "Copy geared" button.
    await clickButton(/copy geared/i)

    await waitFor(() => {
      expect(writeGearedMock).toHaveBeenCalledWith(FIXED_GEAR_RESULT.gearedPrompt)
    })
  })

  it('shows a success toast and clears composer state when writeGeared resolves ok', async () => {
    renderComposer()
    writeGearedMock.mockResolvedValue({ ok: true })

    await runGearFlow()
    await clickButton(/copy geared/i)

    // Success toast appears.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert').textContent).toMatch(/geared prompt copied/i)

    // GearReviewPane is gone (gearState cleared) — the composer textarea is back.
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your prompt here/i)).toBeInTheDocument()
    })

    // Prompt textarea is empty.
    const textarea = screen.getByPlaceholderText(/type your prompt here/i)
    expect(textarea).toHaveValue('')
  })

  it('shows an error toast and preserves state when writeGeared resolves WRITE_FAILED', async () => {
    renderComposer()
    writeGearedMock.mockResolvedValue({ ok: false, code: 'WRITE_FAILED' })

    await runGearFlow()
    await clickButton(/copy geared/i)

    // Error toast appears.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't write to clipboard/i)

    // GearReviewPane is still visible — the "Copy geared" button must still be
    // present, meaning state was not cleared.
    expect(screen.getByRole('button', { name: /copy geared/i })).toBeInTheDocument()
  })
})
