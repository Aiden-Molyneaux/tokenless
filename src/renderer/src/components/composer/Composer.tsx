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

// Composer is the top half of MainPane. Holds prompt text + 4 config
// selections + an optional gearState that, when truthy, swaps the rendered
// view to GearReviewPane. Phase 5 replaces the mock gear data with real
// Haiku-driven output via IPC.

export function Composer(): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(MOCK_MODELS[2].value) // opus default
  const [breadth, setBreadth] = useState<string>(MOCK_BREADTHS[1].value) // normal default
  const [format, setFormat] = useState<string>(MOCK_FORMATS[0].value) // prose default
  const [skill, setSkill] = useState<string>(MOCK_SKILLS[0].value) // none default
  const [gearState, setGearState] = useState<GearState | null>(null)

  const handleGear = (): void => {
    rendererLogger.info('ui', 'gear-clicked', 'Gear (stub)', { promptLength: prompt.length, model, breadth, format, skill })
    setGearState({
      original: prompt,
      geared: MOCK_GEARED_PROMPT,
      flags: MOCK_CRITIQUE_FLAGS
    })
  }

  const handleSend = (): void => {
    rendererLogger.info('ui', 'send-clicked', 'Send (stub)', { promptLength: prompt.length, model })
    setPrompt('')
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
    rendererLogger.info('ui', 'send-original', 'Send original (stub)')
    setPrompt('')
    setGearState(null)
  }

  const handleGearSendGeared = (editedGeared: string): void => {
    rendererLogger.info('ui', 'send-geared', 'Send geared (stub)', { length: editedGeared.length })
    setPrompt('')
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
        onGear={handleGear}
        onSend={handleSend}
        onCommit={handleCommit}
        onPush={handlePush}
      />
      <TelemetryStrip />
    </div>
  )
}
