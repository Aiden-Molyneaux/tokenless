import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { CostPreview, GearResult } from '@shared/types/gearing'
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
  const [gearing, setGearing] = useState(false)
  const [authMissingOpen, setAuthMissingOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [lastCostPreview, setLastCostPreview] = useState<CostPreview | null>(null)
  const [captureHint, setCaptureHint] = useState<string | null>(null)
  const [captureDisabled, setCaptureDisabled] = useState<boolean>(false)
  const captureHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { push: pushToast } = useToast()
  const liveEstimate = useLiveCostEstimate({ prompt, model, breadth })
  const { clear: clearDraft } = useDraftAutosave(conversationId, prompt, setPrompt)
  const templatesHostRef = useOutsideClick<HTMLDivElement>(templatesOpen, () => setTemplatesOpen(false))

  // Cleanup the capture hint timer on unmount.
  useEffect(() => () => {
    if (captureHintTimerRef.current) clearTimeout(captureHintTimerRef.current)
  }, [])

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
          pushToast({ message, severity: 'error' })
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

  const handleCopyGeared = async (text: string): Promise<void> => {
    if (text.trim().length === 0) return
    const result = await window.tokenless.clipboard.writeGeared(text)
    if (result.ok) {
      pushToast({
        severity: 'info',
        message: 'Geared prompt copied — paste into your terminal.'
      })
      setPrompt('')
      setGearState(null)
      void clearDraft()
      return
    }
    // result.code can be 'WRITE_FAILED' or 'EMPTY_INPUT'. EMPTY_INPUT shouldn't
    // reach here because we guarded above; surface a generic error toast either way.
    pushToast({
      severity: 'error',
      message: "Couldn't write to clipboard. Geared text remains in TokenLess — try Copy Geared again."
    })
  }

  const handleCapture = async (): Promise<void> => {
    if (captureDisabled) return
    const result = await window.tokenless.clipboard.readPrompt()
    if (result.ok) {
      setPrompt(result.data.text)
      setCaptureHint(null)
      return
    }
    if (result.code === 'EMPTY') {
      setCaptureHint('Clipboard is empty. Copy text in your terminal first, then click Capture.')
      setCaptureDisabled(true)
      if (captureHintTimerRef.current) clearTimeout(captureHintTimerRef.current)
      captureHintTimerRef.current = setTimeout(() => {
        setCaptureDisabled(false)
        setCaptureHint(null)
        captureHintTimerRef.current = null
      }, 3000)
      return
    }
    if (result.code === 'TOO_LARGE') {
      pushToast({
        message: 'Clipboard contains more than 32 KB. Trim your selection.',
        severity: 'warn'
      })
      return
    }
    if (result.code === 'READ_FAILED') {
      pushToast({
        message: "Couldn't read clipboard. Check Settings → Privacy → Clipboard permissions.",
        severity: 'error'
      })
      return
    }
  }

  const handleDiscard = (): void => {
    rendererLogger.info('ui', 'discard', 'User discarded composer + gear state')
    setPrompt('')
    setGearState(null)
    void clearDraft()
    setCaptureHint(null)
  }

  const handleInsertTemplate = (body: string): void => {
    setPrompt((prev) => prev.trim().length === 0 ? body : `${prev.trimEnd()}\n${body}`)
    setTemplatesOpen(false)
    rendererLogger.info('ui', 'template-inserted', 'Template inserted into composer', { bodyLength: body.length })
  }

  const handleGearCopyOriginal = (): void => {
    if (gearState) {
      setLastCostPreview(gearState.costPreview)
      rendererLogger.info('ui', 'gear-copy-original', 'User copied original (un-geared) prompt')
      void handleCopyGeared(gearState.originalPrompt)
      // Note: handleCopyGeared writes the text to clipboard. "Copy original" reuses
      // the same handler with the un-geared text. Function name is historical;
      // semantics is "copy a string to clipboard."
    }
  }

  const handleGearCopyGeared = (editedGeared: string): void => {
    if (gearState) {
      setLastCostPreview(gearState.costPreview)
      rendererLogger.info('ui', 'gear-copy-geared', 'User copied geared prompt', {
        editedLength: editedGeared.length,
        originalGearedLength: gearState.gearedPrompt.length
      })
      void handleCopyGeared(editedGeared)
    }
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

  // Defined outside the ternary so TypeScript doesn't narrow gearState to null.
  const handleCopyGearedFromState = (): void => {
    if (gearState) void handleCopyGeared(gearState.gearedPrompt)
  }

  return (
    <>
      <div className="composer-shell">
        <div className="composer-shell__main">
          <PromptTextarea value={prompt} onChange={setPrompt} />
          {prompt.length === 0 && gearState === null && (
            <p className="composer__empty-hint">
              Capture a prompt from your terminal (Ctrl+C in terminal → click Capture).
            </p>
          )}
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
              disableGear={gearing}
              copyDisabled={gearState === null}
              onCapture={() => void handleCapture()}
              captureDisabled={captureDisabled}
              onGear={handleGear}
              onCopyGeared={handleCopyGearedFromState}
              onDiscard={handleDiscard}
              onTemplates={() => setTemplatesOpen((v) => !v)}
            />
            {templatesOpen && (
              <TemplatePickerPopover
                onInsert={handleInsertTemplate}
                onClose={() => setTemplatesOpen(false)}
              />
            )}
          </div>
          <TelemetryStrip liveEstimate={liveEstimate} lastCostPreview={lastCostPreview} prompt={prompt} />
          {captureHint && (
            <p className="capture-hint" role="status">{captureHint}</p>
          )}
        </div>
        {gearState && (
          <div className="gear-review-drawer">
            <GearReviewPane
              key={gearState.gearedPrompt}
              original={gearState.originalPrompt}
              geared={gearState.gearedPrompt}
              critiqueFlags={gearState.critiqueFlags}
              costPreview={gearState.costPreview}
              onCopyOriginal={handleGearCopyOriginal}
              onCopyGeared={handleGearCopyGeared}
              onReGear={handleGearReGear}
              onClose={handleGearCancel}
            />
          </div>
        )}
      </div>
      <AuthMissingModal open={authMissingOpen} onDismiss={() => setAuthMissingOpen(false)} accountLabel={accountLabel} />
    </>
  )
}
