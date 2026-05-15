import { useState } from 'react'
import type { GearResult } from '@shared/types/gearing'
import { rendererLogger } from '../../observability/logger-bridge'
import { useToast } from '../../hooks/use-toast'
import { useDraftAutosave } from '../../hooks/use-draft-autosave'
import { MOCK_BREADTHS, MOCK_FORMATS, MOCK_MODELS, MOCK_SKILLS } from '../../mocks/dropdown-options'
import { GearReviewPane } from '../gear-review/GearReviewPane'
import { useLiveCostEstimate } from '../../hooks/use-live-cost-estimate'
import { AuthMissingModal } from '../notifications/AuthMissingModal'
import { ActionsRow } from './ActionsRow'
import { ConfigsRow } from './ConfigsRow'
import { PromptTextarea } from './PromptTextarea'
import { TelemetryStrip } from './TelemetryStrip'
import './styles.css'

interface ComposerProps {
  conversationId: number | null
  accountId: number | null
}

// Error code → user-facing toast message map.
const GEAR_ERROR_MESSAGES: Record<string, string> = {
  API_AUTH_FAILED: 'Anthropic API key invalid or missing. Set ANTHROPIC_API_KEY and restart.',
  API_RATE_LIMITED: 'Anthropic API rate-limited. Try again in a moment.',
  API_SERVER_ERROR: 'Anthropic API returned an error. Try again.',
  API_NETWORK_DOWN: 'Network unreachable. Gearing offline.',
  API_TIMEOUT: 'Gearing timed out. Try again or send the original prompt.',
  GEAR_PARSE_FAILED: "Couldn't parse the gearing response. Send the original prompt.",
  API_UNKNOWN: 'Gearing failed unexpectedly. View Dev Mode for details.'
}

// Composer is the top half of MainPane. Holds prompt text + 4 config
// selections + an optional gearState that, when truthy, swaps the rendered
// view to GearReviewPane. Phase 5 replaces the mock gear data with real
// Haiku-driven output via IPC.

export function Composer({ conversationId, accountId }: ComposerProps): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(MOCK_MODELS[2].value) // opus default
  const [breadth, setBreadth] = useState<string>(MOCK_BREADTHS[1].value) // normal default
  const [format, setFormat] = useState<string>(MOCK_FORMATS[0].value) // prose default
  const [skill, setSkill] = useState<string>(MOCK_SKILLS[0].value) // none default
  const [gearState, setGearState] = useState<GearResult | null>(null)
  const [sending, setSending] = useState(false)
  const [gearing, setGearing] = useState(false)
  const [authMissingOpen, setAuthMissingOpen] = useState(false)
  const { push: pushToast } = useToast()
  const liveEstimate = useLiveCostEstimate({ prompt, model, breadth })
  const { clear: clearDraft } = useDraftAutosave(conversationId, prompt, setPrompt)

  const runGear = async (originalPrompt: string): Promise<void> => {
    // Gearing doesn't require an active conversation — it's a pure Anthropic
    // API call. conversationId is passed as a tracing tag (null when absent).
    setGearing(true)
    try {
      const result = await window.tokenless.gearing.gear({
        conversationId,
        accountId,
        originalPrompt,
        configs: { model, breadth, format, skill: skill || null }
      })
      if (result.ok) {
        setGearState(result.data.result)
      } else {
        const code = result.error.code
        rendererLogger.error('ui', 'gear-failed', result.error.message, {
          conversationId,
          code,
          logId: result.error.logId
        })
        if (code === 'API_AUTH_FAILED') {
          setAuthMissingOpen(true)
        } else {
          const message = GEAR_ERROR_MESSAGES[code] ?? GEAR_ERROR_MESSAGES.API_UNKNOWN
          pushToast({
            message,
            severity: 'error',
            action: {
              label: 'Send original',
              onActivate: () => void handleSend(prompt)
            }
          })
        }
      }
    } finally {
      setGearing(false)
    }
  }

  const handleGear = (): void => {
    rendererLogger.info('ui', 'gear-clicked', 'Gear clicked', { promptLength: prompt.length, model, breadth, format, skill })
    void runGear(prompt)
  }

  const handleSend = async (finalPrompt: string): Promise<void> => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'send-no-conversation', 'Send clicked with no active conversation')
      return
    }
    setSending(true)
    try {
      const result = await window.tokenless.cc.send({
        conversationId,
        prompt: finalPrompt,
        model,
        breadth,
        format
      })
      if (result.ok) {
        setPrompt('')
        void clearDraft()  // clears the persisted draft for this conversation
        rendererLogger.info('ui', 'send-success', 'Prompt sent', {
          conversationId,
          turnId: result.data.turnId,
          promptLength: finalPrompt.length
        })
      } else {
        rendererLogger.error('ui', 'send-failed', result.error.message, {
          conversationId,
          code: result.error.code,
          logId: result.error.logId
        })
        if (result.error.code === 'PTY_WRITE_FAILED') {
          pushToast({
            message: "Couldn't send prompt — PTY connection lost. Restart the conversation.",
            severity: 'error'
          })
        }
      }
    } finally {
      setSending(false)
    }
  }

  const handleCommit = (): void => {
    rendererLogger.info('ui', 'commit-clicked', 'Commit (stub) — pre-filling composer')
    setPrompt('Stage and commit all current changes. Write a concise commit message focused on the *why*, not the *what*. Do not push.')
  }

  const handlePush = (): void => {
    rendererLogger.info('ui', 'push-clicked', 'Push (stub) — pre-filling composer')
    setPrompt('Push the current branch to its remote.')
  }

  const handleGearSendOriginal = (): void => {
    void handleSend(gearState?.originalPrompt ?? prompt)
    setGearState(null)
  }

  const handleGearSendGeared = (editedGeared: string): void => {
    void handleSend(editedGeared)
    setGearState(null)
  }

  const handleGearReGear = (): void => {
    rendererLogger.info('ui', 're-gear-clicked', 'Re-gear — re-firing gearing IPC')
    const originalPrompt = gearState?.originalPrompt ?? prompt
    setGearState(null)
    void runGear(originalPrompt)
  }

  const handleGearCancel = (): void => {
    rendererLogger.info('ui', 'gear-cancel', 'Gear review cancelled')
    setGearState(null)
  }

  return (
    <>
      {gearState ? (
        <GearReviewPane
          key={gearState.gearedPrompt}
          original={gearState.originalPrompt}
          geared={gearState.gearedPrompt}
          critiqueFlags={gearState.critiqueFlags}
          costPreview={gearState.costPreview}
          onSendOriginal={handleGearSendOriginal}
          onSendGeared={handleGearSendGeared}
          onReGear={handleGearReGear}
          onCancel={handleGearCancel}
        />
      ) : (
        <div className="composer">
          <PromptTextarea value={prompt} onChange={setPrompt} />
          <ConfigsRow
            model={model}
            onModelChange={setModel}
            breadth={breadth}
            onBreadthChange={setBreadth}
            format={format}
            onFormatChange={setFormat}
            skill={skill}
            onSkillChange={setSkill}
          />
          <ActionsRow
            promptEmpty={prompt.length === 0}
            disableGear={sending || gearing}
            disableSend={sending || conversationId === null}
            onGear={handleGear}
            onSend={() => void handleSend(prompt)}
            onCommit={handleCommit}
            onPush={handlePush}
          />
          <TelemetryStrip costPreview={liveEstimate} />
        </div>
      )}
      <AuthMissingModal open={authMissingOpen} onDismiss={() => setAuthMissingOpen(false)} />
    </>
  )
}
