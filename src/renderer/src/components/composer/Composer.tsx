import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { CostPreview, GearResult } from '@shared/types/gearing'
import type { GearMeta } from '@shared/types/turns'
import { useOutsideClick } from '../../hooks/use-outside-click'
import { rendererLogger } from '../../observability/logger-bridge'
import { useToast } from '../../hooks/use-toast'
import { useDraftAutosave } from '../../hooks/use-draft-autosave'
import { MOCK_BREADTHS, MOCK_FORMATS } from '../../mocks/dropdown-options'
import { useSkills } from '../../hooks/use-skills'
import { usePricing } from '../../hooks/use-pricing'
import type { DropdownItem } from '../common/Dropdown'
import { GearReviewPane } from '../gear-review/GearReviewPane'
import { useLiveCostEstimate } from '../../hooks/use-live-cost-estimate'
import { AuthMissingModal } from '../notifications/AuthMissingModal'
import { ActionsRow } from './ActionsRow'
import { TemplatePickerPopover } from './TemplatePickerPopover'
import { ConfigsRow } from './ConfigsRow'
import { PromptTextarea } from './PromptTextarea'
import { TelemetryStrip } from './TelemetryStrip'
import {
  SETTING_GEARING_DEFAULT_MODEL,
  SETTING_GEARING_DEFAULT_BREADTH,
  SETTING_GEARING_DEFAULT_FORMAT
} from '@shared/types/settings-keys'
import { readSetting } from '../../hooks/use-settings'
import './styles.css'

interface ComposerProps {
  conversationId: number | null
  accountId: number | null
  accountLabel: string | null
}

// Error code → user-facing toast message map.
// Note: API_AUTH_FAILED is intentionally absent — it opens AuthMissingModal
// instead of a toast (see runGear's failure branch).
const GEAR_ERROR_MESSAGES: Record<string, string> = {
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

export function Composer({ conversationId, accountId, accountLabel }: ComposerProps): JSX.Element {
  const pricing = usePricing()
  const modelItems = pricing.map((p) => ({
    value: p.key,
    label: p.displayName,
    description: p.description
  }))

  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>('opus') // opus default
  const [breadth, setBreadth] = useState<string>(MOCK_BREADTHS[1].value) // normal default
  const [format, setFormat] = useState<string>(MOCK_FORMATS[0].value) // prose default
  const [skill, setSkill] = useState<string>('') // none default (empty string = "None" entry)
  const [gearState, setGearState] = useState<GearResult | null>(null)
  // Phase 1: sending is always false now that cc.send is a no-op; kept so
  // ActionsRow's disableSend / disableGear props compile unchanged.
  const sending = false
  const [gearing, setGearing] = useState(false)
  const [authMissingOpen, setAuthMissingOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [lastCostPreview, setLastCostPreview] = useState<CostPreview | null>(null)
  const promptRef = useRef(prompt)
  const { push: pushToast } = useToast()
  const liveEstimate = useLiveCostEstimate({ prompt, model, breadth })
  const { clear: clearDraft } = useDraftAutosave(conversationId, prompt, setPrompt)
  const templatesHostRef = useOutsideClick<HTMLDivElement>(templatesOpen, () => setTemplatesOpen(false))
  useEffect(() => {
    promptRef.current = prompt
  }, [prompt])

  // Load gearing defaults from the settings table on mount.
  // GearingDefaultsSection writes to the same keys, so changes take effect on next Composer mount.
  useEffect(() => {
    void Promise.all([
      readSetting(SETTING_GEARING_DEFAULT_MODEL),
      readSetting(SETTING_GEARING_DEFAULT_BREADTH),
      readSetting(SETTING_GEARING_DEFAULT_FORMAT)
    ]).then(([m, b, f]) => {
      if (m !== null) setModel(m)
      if (b !== null) setBreadth(b)
      if (f !== null) setFormat(f)
    })
  }, [])
  const { skills, toggleFavorite, toggleHidden } = useSkills()

  const skillItems: readonly DropdownItem[] = useMemo(() => [
    { value: '', label: 'None', description: 'no skill requested' },
    ...skills
      .filter((s) => !s.hidden)
      .map((s) => ({
        value: s.path,
        label: s.favorited ? `★ ${s.name}` : s.name,
        description: s.description ?? `${s.source} skill`
      }))
  ], [skills])

  const renderSkillItem = useCallback((item: DropdownItem, _isActive: boolean): ReactNode => {
    if (item.value === '') {
      return (
        <>
          <span className="dropdown__item-label">{item.label}</span>
          <span className="dropdown__item-description">{item.description}</span>
        </>
      )
    }
    const matchedSkill = skills.find((s) => s.path === item.value)
    if (!matchedSkill) return null
    return (
      <>
        <span className="dropdown__item-label">{item.label}</span>
        {item.description && <span className="dropdown__item-description">{item.description}</span>}
        <span className="dropdown__item-actions">
          <button
            type="button"
            className="dropdown__item-action"
            aria-label={matchedSkill.favorited ? 'Unfavorite' : 'Favorite'}
            onClick={(e) => {
              e.stopPropagation()
              void toggleFavorite(matchedSkill.id, !matchedSkill.favorited)
            }}
          >
            {matchedSkill.favorited ? '★' : '☆'}
          </button>
          <button
            type="button"
            className="dropdown__item-action"
            aria-label="Hide"
            onClick={(e) => {
              e.stopPropagation()
              void toggleHidden(matchedSkill.id, true)
            }}
          >
            ✕
          </button>
        </span>
      </>
    )
  }, [skills, toggleFavorite, toggleHidden])

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
              onActivate: () => void handleSend(promptRef.current)
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

  const actuallySend = async (_finalPrompt: string, _gearMeta: GearMeta | null): Promise<void> => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'send-no-conversation', 'Send clicked with no active conversation')
      return
    }
    // Phase 1: PTY is gone. Phase 4 will route the geared prompt to the clipboard.
    // For now the Send button does nothing visible; in dev-mode we surface a hint.
    if (import.meta.env.DEV) {
      window.tokenless.log.send({
        id: `composer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ts: Date.now(),
        severity: 'info',
        category: 'ui',
        event: 'send-button-noop',
        message: 'Send button is a no-op in v2-phase-1; clipboard send arrives in phase 4.',
        fingerprint: 'composer-send-noop',
        source: 'renderer',
        context: {}
      })
    }
    setPrompt('')
    void clearDraft()  // clears the persisted draft for this conversation
  }

  const handleSend = async (finalPrompt: string, gearMeta: GearMeta | null = null): Promise<void> => {
    await actuallySend(finalPrompt, gearMeta)
  }

  const handleCapture = async (): Promise<void> => {
    const result = await window.tokenless.clipboard.readPrompt()
    if (result.ok) {
      setPrompt(result.data.text)
      return
    }
    // Error handling (debounce, hint, toasts) — Task 6.
    // For now, silently do nothing on failure paths so the happy path is testable.
  }

  const handleCommit = (): void => {
    rendererLogger.info('ui', 'commit-clicked', 'Commit (stub) — pre-filling composer')
    setPrompt('Stage and commit all current changes. Write a concise commit message focused on the *why*, not the *what*. Do not push.')
  }

  const handlePush = (): void => {
    rendererLogger.info('ui', 'push-clicked', 'Push (stub) — pre-filling composer')
    setPrompt('Push the current branch to its remote.')
  }

  const handleInsertTemplate = (body: string): void => {
    setPrompt((prev) => prev.trim().length === 0 ? body : `${prev.trimEnd()}\n${body}`)
    setTemplatesOpen(false)
    rendererLogger.info('ui', 'template-inserted', 'Template inserted into composer', { bodyLength: body.length })
  }

  const handleGearSendOriginal = (): void => {
    if (gearState) setLastCostPreview(gearState.costPreview)
    void handleSend(gearState?.originalPrompt ?? prompt, null)
    setGearState(null)
  }

  const handleGearSendGeared = (editedGeared: string): void => {
    if (!gearState) {
      void handleSend(editedGeared, null)
      setGearState(null)
      return
    }
    setLastCostPreview(gearState.costPreview)
    const meta: GearMeta = {
      originalPrompt: gearState.originalPrompt,
      gearedPrompt: editedGeared,
      originalTokens: gearState.tokenBreakdown.originalInputEstimate,
      gearedTokens: gearState.tokenBreakdown.gearedInputEstimate,
      haikuMetaTokens: gearState.tokenBreakdown.haikuInputTokens + gearState.tokenBreakdown.haikuOutputTokens,
      critiqueFlags: gearState.critiqueFlags.map((f) => `${f.severity}: ${f.message}`)
    }
    void handleSend(editedGeared, meta)
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
          sendDisabled={conversationId === null}
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
            modelItems={modelItems}
            breadth={breadth}
            onBreadthChange={setBreadth}
            format={format}
            onFormatChange={setFormat}
            skill={skill}
            onSkillChange={setSkill}
            skillItems={skillItems}
            renderSkillItem={renderSkillItem}
          />
          <div className="actions-row-host" ref={templatesHostRef}>
            <ActionsRow
              promptEmpty={prompt.length === 0}
              disableGear={sending || gearing}
              disableSend={sending || conversationId === null}
              onCapture={() => void handleCapture()}
              onGear={handleGear}
              onSend={() => void handleSend(prompt)}
              onTemplates={() => setTemplatesOpen((v) => !v)}
              onCommit={handleCommit}
              onPush={handlePush}
            />
            {templatesOpen && (
              <TemplatePickerPopover
                onInsert={handleInsertTemplate}
                onClose={() => setTemplatesOpen(false)}
              />
            )}
          </div>
          <TelemetryStrip liveEstimate={liveEstimate} lastCostPreview={lastCostPreview} prompt={prompt} />
        </div>
      )}
      <AuthMissingModal open={authMissingOpen} onDismiss={() => setAuthMissingOpen(false)} accountLabel={accountLabel} />
    </>
  )
}
