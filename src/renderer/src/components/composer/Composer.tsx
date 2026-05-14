import { useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { MOCK_BREADTHS, MOCK_FORMATS, MOCK_MODELS, MOCK_SKILLS } from '../../mocks/dropdown-options'
import { MOCK_CRITIQUE_FLAGS, MOCK_GEARED_PROMPT } from '../../mocks/geared-prompt'
import type { MockCritiqueFlag } from '../../mocks/geared-prompt'
import { GearReviewPane } from '../gear-review/GearReviewPane'
import { ActionsRow } from './ActionsRow'
import { ConfigsRow } from './ConfigsRow'
import { PromptTextarea } from './PromptTextarea'
import { TelemetryStrip } from './TelemetryStrip'
import './styles.css'

interface GearState {
  original: string
  geared: string
  flags: readonly MockCritiqueFlag[]
}

interface ComposerProps {
  conversationId: number | null
}

// Composer is the top half of MainPane. Holds prompt text + 4 config
// selections + an optional gearState that, when truthy, swaps the rendered
// view to GearReviewPane. Phase 5 replaces the mock gear data with real
// Haiku-driven output via IPC.

export function Composer({ conversationId }: ComposerProps): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(MOCK_MODELS[2].value) // opus default
  const [breadth, setBreadth] = useState<string>(MOCK_BREADTHS[1].value) // normal default
  const [format, setFormat] = useState<string>(MOCK_FORMATS[0].value) // prose default
  const [skill, setSkill] = useState<string>(MOCK_SKILLS[0].value) // none default
  const [gearState, setGearState] = useState<GearState | null>(null)
  const [sending, setSending] = useState(false)

  const handleGear = (): void => {
    rendererLogger.info('ui', 'gear-clicked', 'Gear (stub)', { promptLength: prompt.length, model, breadth, format, skill })
    setGearState({
      original: prompt,
      geared: MOCK_GEARED_PROMPT,
      flags: MOCK_CRITIQUE_FLAGS
    })
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
    void handleSend(gearState?.original ?? prompt)
    setGearState(null)
  }

  const handleGearSendGeared = (editedGeared: string): void => {
    void handleSend(editedGeared)
    setGearState(null)
  }

  const handleGearReGear = (): void => {
    rendererLogger.info('ui', 're-gear-clicked', 'Re-gear (stub) — refreshing mock')
    setGearState({
      original: prompt,
      geared: MOCK_GEARED_PROMPT,
      flags: MOCK_CRITIQUE_FLAGS
    })
  }

  const handleGearCancel = (): void => {
    rendererLogger.info('ui', 'gear-cancel', 'Gear review cancelled')
    setGearState(null)
  }

  if (gearState) {
    return (
      <GearReviewPane
        key={gearState.geared}
        original={gearState.original}
        geared={gearState.geared}
        critiqueFlags={gearState.flags}
        onSendOriginal={handleGearSendOriginal}
        onSendGeared={handleGearSendGeared}
        onReGear={handleGearReGear}
        onCancel={handleGearCancel}
      />
    )
  }

  return (
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
        disableGear={sending}
        disableSend={sending || conversationId === null}
        onGear={handleGear}
        onSend={() => void handleSend(prompt)}
        onCommit={handleCommit}
        onPush={handlePush}
      />
      <TelemetryStrip />
    </div>
  )
}
