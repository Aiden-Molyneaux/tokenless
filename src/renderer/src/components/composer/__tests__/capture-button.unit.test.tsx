// @vitest-environment happy-dom

// Purpose: Capture button triggers clipboard IPC and handles all result codes —
// happy path fills the prompt, EMPTY shows inline hint + disables button for 3s,
// TOO_LARGE pushes a warn toast, READ_FAILED pushes an error toast.

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'

import { Composer } from '../Composer'
import { ToastProvider } from '../../../hooks/use-toast'
import { ToastHost } from '../../notifications/ToastHost'

// ---------- window.tokenless minimal mock ----------
// Composer uses: clipboard, gearing, pricing, drafts, settings, skills, log.
// skills.onChanged must return an unsubscribe fn.

function buildTokenlessMock(
  readPromptImpl: () => Promise<unknown>
): unknown {
  return {
    clipboard: {
      readPrompt: vi.fn(readPromptImpl)
    },
    gearing: {
      gear: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'API_UNKNOWN', message: 'noop', logId: null }
      })
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

// ---------- Test wrapper ----------
// Wraps Composer in ToastProvider + ToastHost so we can observe toasts
// rendered to the DOM. window.tokenless is set before render in each test.

function renderComposer(readPrompt: () => Promise<unknown>): ReturnType<typeof render> {
  ;(window as unknown as { tokenless: unknown }).tokenless = buildTokenlessMock(readPrompt)
  return render(
    <ToastProvider>
      <ToastHost />
      <Composer conversationId={1} accountId={1} accountLabel="test@example.com" />
    </ToastProvider>
  )
}

// ---------- Helper ----------

async function clickCapture(): Promise<void> {
  const btn = screen.getByRole('button', { name: /capture prompt from clipboard/i })
  await act(async () => {
    fireEvent.click(btn)
    // Let the async clipboard IPC promise settle
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ---------- Tests ----------

describe('Composer — Capture button', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('happy path: clipboard returns text → prompt textarea fills', async () => {
    renderComposer(() =>
      Promise.resolve({ ok: true, data: { text: 'hello world', sanitizedLength: 11 } })
    )
    await clickCapture()
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue('hello world')
  })

  it('EMPTY: inline hint appears + Capture button becomes disabled', async () => {
    renderComposer(() => Promise.resolve({ ok: false, code: 'EMPTY' }))
    await clickCapture()
    const hint = screen.getByRole('status')
    expect(hint).toBeInTheDocument()
    expect(hint.textContent).toMatch(/clipboard is empty/i)
    const btn = screen.getByRole('button', { name: /capture prompt from clipboard/i })
    expect(btn).toBeDisabled()
  })

  it('EMPTY: after 3 seconds, button re-enables + hint clears', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    renderComposer(() => Promise.resolve({ ok: false, code: 'EMPTY' }))
    await clickCapture()

    // hint showing, button disabled
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /capture prompt from clipboard/i })).toBeDisabled()

    // advance past 3s debounce
    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /capture prompt from clipboard/i })).not.toBeDisabled()
  })

  it('TOO_LARGE: pushes a warn toast with the spec message', async () => {
    renderComposer(() => Promise.resolve({ ok: false, code: 'TOO_LARGE' }))
    await clickCapture()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert').textContent).toMatch(/clipboard contains more than 32 KB/i)
  })

  it('READ_FAILED: pushes an error toast with the spec message', async () => {
    renderComposer(() => Promise.resolve({ ok: false, code: 'READ_FAILED' }))
    await clickCapture()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't read clipboard/i)
  })
})
