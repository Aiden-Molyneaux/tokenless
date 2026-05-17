// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Project } from '@shared/types/projects'

import { useProjects } from '../use-projects'

// Purpose: useProjects fetches projects on mount, exposes loading/error states,
// and refetches when projects:changed fires.

function makeProject(id: number, name: string): Project {
  return {
    id,
    name,
    rootPath: `/p${id}`,
    defaultAccountId: null,
    defaultModel: null,
    defaultBreadth: null,
    defaultFormat: null,
    notes: null,
    alwaysIncludeFiles: [],
    relevantSkillIds: [],
    createdAt: 0,
    updatedAt: 0
  }
}

function setMockTokenless(mock: unknown): void {
  ;(window as unknown as { tokenless: unknown }).tokenless = mock
}

describe('hooks/use-projects', () => {
  let onChangedCallback: () => void = () => undefined
  let mockProjects: Project[]

  beforeEach(() => {
    mockProjects = [makeProject(1, 'Alpha')]
    onChangedCallback = () => undefined
    setMockTokenless({
      projects: {
        list: vi.fn(async () => ({ ok: true, data: { projects: mockProjects } })),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        onChanged: (fn: () => void): (() => void) => {
          onChangedCallback = fn
          return () => undefined
        }
      }
    })
  })

  it('fetches projects on mount and exposes them', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.projects[0].name).toBe('Alpha')
  })

  it('refetches when onChanged fires', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockProjects = [makeProject(1, 'Alpha'), makeProject(2, 'Bravo')]

    act(() => {
      onChangedCallback()
    })

    await waitFor(() => expect(result.current.projects).toHaveLength(2))
  })
})
