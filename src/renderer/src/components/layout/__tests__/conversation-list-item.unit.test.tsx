// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

import { ConversationListItem } from '../ConversationListItem'
import type { Conversation } from '@shared/types/conversations'

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 1,
    projectId: 1,
    accountId: null,
    title: 'My conversation',
    model: 'sonnet',
    breadth: null,
    format: null,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    endedAt: null,
    archivedAt: null,
    ...overrides
  }
}

describe('ConversationListItem', () => {
  it('renders title and meta in normal mode', () => {
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ title: 'Refactor auth' })}
          isActive={false}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    expect(screen.getByText('Refactor auth')).toBeInTheDocument()
  })

  it('shows "Untitled" when title is null', () => {
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ title: null })}
          isActive={false}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('calls onSelect when the row is clicked in normal mode', () => {
    const onSelect = vi.fn()
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ id: 42 })}
          isActive={false}
          onSelect={onSelect}
          onRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    fireEvent.click(screen.getByRole('button', { name: /my conversation/i }))
    expect(onSelect).toHaveBeenCalledWith(42)
  })

  it('opens the context menu on right-click with Rename + Delete items', () => {
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation()}
          isActive={false}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('listitem'))
    expect(screen.getByRole('menu', { name: /conversation actions/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('clicking Rename enters edit mode with the current title pre-filled and selected', () => {
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ title: 'My title' })}
          isActive={false}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    fireEvent.contextMenu(screen.getByRole('listitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: /conversation title/i }) as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('My title')
  })

  it('pressing Enter in the rename input fires onRename with the trimmed value', () => {
    const onRename = vi.fn()
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ id: 7, title: 'old' })}
          isActive={false}
          onSelect={vi.fn()}
          onRename={onRename}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    fireEvent.contextMenu(screen.getByRole('listitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: /conversation title/i })
    fireEvent.change(input, { target: { value: '  new title  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith(7, 'new title')
  })

  it('pressing Escape cancels the rename without calling onRename', () => {
    const onRename = vi.fn()
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ title: 'keep me' })}
          isActive={false}
          onSelect={vi.fn()}
          onRename={onRename}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    fireEvent.contextMenu(screen.getByRole('listitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: /conversation title/i })
    fireEvent.change(input, { target: { value: 'discard this' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    // After cancel, the row should display the original title again.
    expect(screen.getByText('keep me')).toBeInTheDocument()
  })

  it('does not fire onRename when the trimmed value is empty', () => {
    const onRename = vi.fn()
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation()}
          isActive={false}
          onSelect={vi.fn()}
          onRename={onRename}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    fireEvent.contextMenu(screen.getByRole('listitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: /conversation title/i })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
  })

  it('does not fire onRename when the value is unchanged from the current title', () => {
    const onRename = vi.fn()
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ title: 'same' })}
          isActive={false}
          onSelect={vi.fn()}
          onRename={onRename}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    fireEvent.contextMenu(screen.getByRole('listitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: /conversation title/i })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
  })

  it('clicking Delete fires onRequestDelete with the conversation id', () => {
    const onRequestDelete = vi.fn()
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation({ id: 99 })}
          isActive={false}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onRequestDelete={onRequestDelete}
        />
      </ul>
    )
    fireEvent.contextMenu(screen.getByRole('listitem'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onRequestDelete).toHaveBeenCalledWith(99)
  })

  it('dismisses the context menu when Escape is pressed', () => {
    render(
      <ul>
        <ConversationListItem
          conversation={makeConversation()}
          isActive={false}
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ul>
    )
    fireEvent.contextMenu(screen.getByRole('listitem'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
