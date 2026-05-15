import { useState } from 'react'
import { useAccounts } from '../../hooks/use-accounts'

interface StepApiKeyProps {
  apiKey: string
  onApiKeyChange: (key: string) => void
  onNext: (accountId: number) => void
  onBack: () => void
}

function isValidApiKey(key: string): boolean {
  return key.trim().startsWith('sk-ant-')
}

export function StepApiKey({ apiKey, onApiKeyChange, onNext, onBack }: StepApiKeyProps): JSX.Element {
  const { accounts, create: createAccount, update: updateAccount } = useAccounts()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = apiKey.trim()
  const valid = isValidApiKey(trimmed)

  const handleNext = async (): Promise<void> => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      // Find the seeded "Personal" account if it exists
      const personal = accounts.find((a) => a.label === 'Personal') ?? null
      let accountId: number
      if (personal !== null) {
        const updated = await updateAccount({ id: personal.id, apiKey: trimmed })
        if (updated === null) {
          setError('Failed to update the Personal account. Please try again.')
          return
        }
        accountId = updated.id
      } else {
        const created = await createAccount({ label: 'Personal', configDir: '', apiKey: trimmed })
        if (created === null) {
          setError('Failed to create the Personal account. Please try again.')
          return
        }
        accountId = created.id
      }
      onNext(accountId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step__title">Your API key</h2>
      <div className="onboarding-step__body">
        <p>
          TokenLess uses Anthropic&apos;s API for gearing (Haiku rewrites your prompts). You&apos;ll
          also need an API key configured for claude code itself — the seeded &ldquo;Personal&rdquo;
          account will receive this key.
        </p>
        <p>
          Get one at:{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            https://console.anthropic.com/settings/keys
          </a>
        </p>
      </div>
      <div className="onboarding-step__field">
        <label className="onboarding-step__field-label" htmlFor="ob-api-key">
          Anthropic API key
        </label>
        <input
          id="ob-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        {trimmed.length > 0 && !valid && (
          <span className="onboarding-step__field-error">
            API keys must start with <code>sk-ant-</code>.
          </span>
        )}
      </div>
      {error !== null && (
        <p className="onboarding-step__field-error">{error}</p>
      )}
      <div className="onboarding-step__actions">
        <button type="button" className="btn btn--ghost" onClick={onBack} disabled={busy}>
          &larr; Back
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void handleNext()}
          disabled={!valid || busy}
        >
          {busy ? 'Saving…' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
