// Builds the MessageRequest for the gearing call. The system prompt is fixed
// (system-prompt.md, ?raw-imported). The user message embeds the user's
// configs as a structured preamble + the original prompt.

import type { GearConfigs } from '@shared/types/gearing'

import type { MessageRequest } from '../api/types'
import { PRICING, GEARING_MODEL } from '../api/pricing'

// eslint-disable-next-line import/no-unresolved
import SYSTEM_PROMPT from './system-prompt.md?raw'

export interface BuildGearRequestInput {
  readonly originalPrompt: string
  readonly configs: GearConfigs
  // Future: projectNotes, conversationSummary, etc. (Phase 5B)
}

export function buildGearRequest(input: BuildGearRequestInput): MessageRequest {
  const targetModelLabel = PRICING[input.configs.model]?.displayName ?? input.configs.model
  const userPrompt =
    `# Gearing configs\n` +
    `- target model: ${targetModelLabel}\n` +
    `- breadth: ${input.configs.breadth}\n` +
    `- format: ${input.configs.format}\n` +
    `- skill: ${input.configs.skill ?? 'none'}\n\n` +
    `# Original prompt\n\n${input.originalPrompt}\n`
  return {
    model: PRICING[GEARING_MODEL].apiModel,
    maxTokens: 2000,
    system: SYSTEM_PROMPT,
    userPrompt
  }
}
