// GearingEngine — orchestrates builder → client → parser, then computes the
// CostPreview from token counts × pricing. Returns Result<GearResult, ApiError>.

import type { AnthropicClientLike, ApiError, Result } from '../api/types'
import { estimateCost, estimateInputTokens } from '../api/cost'
import { GEARING_MODEL, pricingFor } from '../api/pricing'

import type { GearConfigs, GearResult } from '@shared/types/gearing'

import { buildGearRequest } from './builder'
import { parseGearResponse } from './parser'

export interface GearInput {
  readonly originalPrompt: string
  readonly configs: GearConfigs
}

export class GearingEngine {
  constructor(private readonly client: AnthropicClientLike) {}

  async gear(input: GearInput): Promise<Result<GearResult, ApiError>> {
    const request = buildGearRequest(input)
    const apiResult = await this.client.complete(request)
    if (!apiResult.ok) return apiResult

    const parsed = parseGearResponse(apiResult.data.text)
    if (!parsed.ok) return parsed

    // Compute token estimates + cost preview
    const originalInputEstimate = estimateInputTokens(input.originalPrompt)
    const gearedInputEstimate = estimateInputTokens(parsed.data.gearedPrompt)
    // Output estimate: rough heuristic tied to format + breadth. Phase 5B may
    // refine via learned distributions. For Phase 5A: 800 tokens default, halved
    // for terse, doubled for thorough.
    const breadthFactor = input.configs.breadth === 'terse' ? 0.5
      : input.configs.breadth === 'thorough' ? 2.0
      : 1.0
    const expectedOutputTokens = Math.round(800 * breadthFactor)

    const userModel = input.configs.model
    const expectedDollars = estimateCost(userModel, gearedInputEstimate, expectedOutputTokens)
    const haikuMetaDollars = estimateCost(GEARING_MODEL, apiResult.data.inputTokens, apiResult.data.outputTokens)
    const modelLabel = pricingFor(userModel)?.displayName ?? userModel

    const result: GearResult = {
      originalPrompt: input.originalPrompt,
      gearedPrompt: parsed.data.gearedPrompt,
      critiqueFlags: parsed.data.critiqueFlags,
      tokenBreakdown: {
        haikuInputTokens: apiResult.data.inputTokens,
        haikuOutputTokens: apiResult.data.outputTokens,
        gearedInputEstimate,
        originalInputEstimate
      },
      costPreview: {
        expectedDollars,
        expectedInputTokens: gearedInputEstimate,
        expectedOutputTokens,
        modelLabel,
        haikuMetaDollars
      }
    }
    return { ok: true, data: result }
  }
}
