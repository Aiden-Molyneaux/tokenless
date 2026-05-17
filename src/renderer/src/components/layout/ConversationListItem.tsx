import { useEffect, useRef, useState } from 'react'
import type { Conversation } from '@shared/types/conversations'

interface ConversationListItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: (id: number) => void
  onRename: (id: number, newTitle: string) => void
  onRequestDelete: (id: number) => void
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function relativeTime(ts: number | null): string {
  if (ts === null) return ''
  const diff = Date.now() - ts
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  return `${Math.floor(diff / DAY)}d ago`
}

// Right-click on a conversation row opens a small context menu with Rename
// and Delete. Rename swaps the title for an inline <input> (Enter commits,
// Esc / blur with empty value cancels). Delete fires onRequestDelete which
// the parent handles via a ConfirmModal.
//
// The context menu and the inline rename state live entirely inside this
// component — neighboring items don't need to coordinate. A right-click on
// a different item naturally dismisses the prior menu via the document-level
// click listener.

export function ConversationListItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onRequestDelete
}: ConversationListItemProps): JSX.Element {
  const model = conversation.model ?? 'sonnet'
  const currentTitle = conversation.title ?? 'Untitled'
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(currentTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input + select-all when entering rename mode.
  useEffect(() => {
    if (!isRenaming) return
    const t = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => clearTimeout(t)
  }, [isRenaming])

  // Dismiss the context menu on any document-level click / Esc.
  useEffect(() => {
    if (menuPos === null) return
    const closeOnClick = (): void => setMenuPos(null)
    const closeOnEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuPos(null)
    }
    document.addEventListener('click', closeOnClick)
    document.addEventListener('keydown', closeOnEsc)
    return () => {
      document.removeEventListener('click', closeOnClick)
      document.removeEventListener('keydown', closeOnEsc)
    }
  }, [menuPos])

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const handleStartRename = (): void => {
    setDraftTitle(currentTitle)
    setIsRenaming(true)
    setMenuPos(null)
  }

  const handleCancelRename = (): void => {
    setIsRenaming(false)
    setDraftTitle(currentTitle)
  }

  const handleCommitRename = (): void => {
    const trimmed = draftTitle.trim()
    if (trimmed.length === 0 || trimmed === currentTitle) {
      handleCancelRename()
      return
    }
    onRename(conversation.id, trimmed)
    setIsRenaming(false)
  }

  const handleRenameKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCommitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelRename()
    }
  }

  const handleRequestDelete = (): void => {
    onRequestDelete(conversation.id)
    setMenuPos(null)
  }

  return (
    <li
      className={`conversation-item ${isActive ? 'is-active' : ''}`}
      onContextMenu={handleContextMenu}
    >
      {isRenaming ? (
        <div className="conversation-item__button conversation-item__button--editing">
          <input
            ref={inputRef}
            type="text"
            className="conversation-item__rename-input"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={handleRenameKey}
            onBlur={handleCommitRename}
            aria-label="Conversation title"
          />
          <span className="conversation-item__meta">
            <span className={`conversation-item__model conversation-item__model--${model}`}>{model}</span>
            <span className="conversation-item__time">{relativeTime(conversation.updatedAt)}</span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="conversation-item__button"
          onClick={() => onSelect(conversation.id)}
        >
          <span className="conversation-item__title">{currentTitle}</span>
          <span className="conversation-item__meta">
            <span className={`conversation-item__model conversation-item__model--${model}`}>{model}</span>
            <span className="conversation-item__time">{relativeTime(conversation.updatedAt)}</span>
          </span>
        </button>
      )}
      {menuPos !== null && (
        <div
          className="context-menu"
          role="menu"
          aria-label="Conversation actions"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="context-menu__item"
            onClick={handleStartRename}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="context-menu__item context-menu__item--danger"
            onClick={handleRequestDelete}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  )
}
