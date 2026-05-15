import { useState } from 'react'
import { useAccounts } from '../../hooks/use-accounts'
import type { UpdateAccountInput } from '@shared/types/accounts'
import { CreateAccountModal } from '../../components/layout/CreateAccountModal'
import { EditAccountModal } from '../../components/layout/EditAccountModal'
import { ConfirmModal } from '../../components/common/ConfirmModal'

// AccountsSection — lists all accounts with Edit + Delete actions, and a +Add button.
// Reuses existing CreateAccountModal / EditAccountModal / ConfirmModal components.

export function AccountsSection(): JSX.Element {
  const { accounts, create, update, remove } = useAccounts()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const editingAccount = accounts.find((a) => a.id === editingId) ?? null
  const deleteConfirmAccount = accounts.find((a) => a.id === deleteConfirmId) ?? null

  const handleCreate = async (input: { label: string; configDir: string; apiKey: string }): Promise<void> => {
    await create({ label: input.label, configDir: input.configDir, apiKey: input.apiKey || null })
  }

  const handleUpdate = async (input: UpdateAccountInput): Promise<void> => {
    await update(input)
    setEditingId(null)
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (deleteConfirmId !== null) {
      await remove(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section__heading">Accounts</h3>
      <div className="accounts-section__list">
        {accounts.length === 0 && (
          <p className="accounts-section__empty">No accounts yet.</p>
        )}
        {accounts.map((account) => (
          <div key={account.id} className="accounts-section__row">
            <span className="accounts-section__label">{account.label}</span>
            <span className="accounts-section__config-dir">{account.configDir || '—'}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setEditingId(account.id)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => setDeleteConfirmId(account.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="accounts-section__add">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => setCreateOpen(true)}
        >
          + Add account
        </button>
      </div>

      <CreateAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <EditAccountModal
        open={editingId !== null}
        account={editingAccount}
        onClose={() => setEditingId(null)}
        onUpdate={handleUpdate}
        onDelete={(id) => {
          setEditingId(null)
          setDeleteConfirmId(id)
          return Promise.resolve()
        }}
      />
      <ConfirmModal
        open={deleteConfirmId !== null}
        title="Delete account?"
        message={`Are you sure you want to delete "${deleteConfirmAccount?.label ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </section>
  )
}
