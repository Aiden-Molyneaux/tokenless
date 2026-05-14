// Parser for the Haiku gearing response. Strips optional code-fence wrappers
// the LLM sometimes adds despite the system prompt forbidding them, then
// validates the structure via Zod. Returns Result<ParsedGearResponse, ApiError>.

import { z } from 'zod'

import type { CritiqueFlag } from '@shared/types/gearing'
import type { ApiError, Result } from '../api/types'

const SCHEMA = z.object({
  geared_prompt: z.string(),
  critique_flags: z.array(
    z.object({
      severity: z.union([z.literal('info'), z.literal('warn')]),
      message: z.string()
    })
  ),
  rationale: z.string()
})

export interface ParsedGearResponse {
  readonly gearedPrompt: string
  readonly critiqueFlags: readonly CritiqueFlag[]
  readonly rationale: string
}

function stripFences(text: string): string {
  const fenceRe = /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/m
  const m = text.trim().match(fenceRe)
  return m ? m[1].trim() : text.trim()
}

export function parseGearResponse(text: string): Result<ParsedGearResponse, ApiError> {
  const stripped = stripFences(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'GEAR_PARSE_FAILED',
        message: `Haiku response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        cause: err
      }
    }
  }
  const result = SCHEMA.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'GEAR_PARSE_FAILED',
        message: `Haiku response did not match expected shape: ${result.error.message}`,
        cause: result.error
      }
    }
  }
  return {
    ok: true,
    data: {
      gearedPrompt: result.data.geared_prompt,
      critiqueFlags: result.data.critique_flags,
      rationale: result.data.rationale
    }
  }
}
