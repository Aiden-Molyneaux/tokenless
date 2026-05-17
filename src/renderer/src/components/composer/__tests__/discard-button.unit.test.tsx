// @vitest-environment happy-dom

// Purpose: Discard button clears prompt + gearState + draft on click, and is
// always enabled regardless of composer state.

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

let clearDraftMock: ReturnType<typeof vi.fn>
let gearMock: ReturnType<typeof vi.fn>

function buildTokenlessMock(): unknown {
  clearDraftMock = vi.fn().mockResolvedValue({ ok: true, data: { cleared: true } })
  gearMock = vi.fn()

  return {
    clipboard: {
      readPrompt: vi.fn().mockResolvedValue({ ok: false, code: 'EMPTY' }),
      writeGeared: vi.fn().mockResolvedValue({ ok: true })
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
      clear: clearDraftMock
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

// ---------- Shared helper: fill prompt + run gear ----------
// Fills the prompt textarea, mocks gear to return the fixed result, clicks Gear,
// and waits for the GearReviewPane drawer to appear (signalled by its heading).

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

  // Wait for the GearReviewPane drawer heading to appear.
  await screen.findByRole('heading', { name: /review geared prompt/i })
}

// ---------- Helper: click Discard ----------

async function clickDiscard(): Promise<void> {
  const btn = screen.getByRole('button', { name: /discard composer \+ gear review/i })
  await act(async () => {
    fireEvent.click(btn)
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ---------- Tests ----------

describe('Composer / Discard button', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('clears the prompt textarea when clicked', async () => {
    renderComposer()

    // Fill the textarea with some text.
    const textarea = screen.getByPlaceholderText(/type your prompt here/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Some prompt text' } })
      await Promise.resolve()
    })
    expect(textarea).toHaveValue('Some prompt text')

    await clickDiscard()

    expect(textarea).toHaveValue('')
  })

  it('closes the GearReviewPane drawer when clicked', async () => {
    renderComposer()

    // Gear up so the GearReviewPane drawer is open.
    await runGearFlow()
    expect(screen.getByRole('heading', { name: /review geared prompt/i })).toBeInTheDocument()

    await clickDiscard()

    // GearReviewPane heading must be gone.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /review geared prompt/i })).not.toBeInTheDocument()
    })
  })

  it('clears the draft when clicked', async () => {
    renderComposer()

    await clickDiscard()

    await waitFor(() => {
      expect(clearDraftMock).toHaveBeenCalled()
    })
  })

  it('is always enabled (no disabled gating)', async () => {
    renderComposer()

    // With no prompt and no gearState (the emptiest possible state), the
    // Discard button must still be present and enabled.
    const btn = screen.getByRole('button', { name: /discard composer \+ gear review/i })
    expect(btn).not.toBeDisabled()
  })
})
