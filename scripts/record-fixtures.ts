#!/usr/bin/env tsx
// Record Anthropic API responses to test/fixtures/api/ for use by
// MockAnthropicClient in tests.
//
// USAGE:
//   $env:ANTHROPIC_API_KEY = 'sk-ant-...'
//   npm run fixtures:record
//
// Adds (or overwrites) fixture JSON files for a known set of test scenarios.
// Run when the gearing system prompt changes or to refresh after API changes.
//
// Each fixture file shape:
//   { description: string, response: MessageResponse }

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { AnthropicClient } from '../src/main/api/client'
import { buildGearRequest } from '../src/main/gearing/builder'

interface Scenario {
  readonly name: string
  readonly description: string
  readonly originalPrompt: string
  readonly configs: { model: string; breadth: string; format: string; skill: string | null }
}

const SCENARIOS: Scenario[] = [
  {
    name: 'gear-simple',
    description: 'Verbose refactor request — typical compression case.',
    originalPrompt:
      "Could you please take a look at the authentication middleware that I've been working on and see if there's any way we can refactor it? The current implementation has some nested conditionals that make the token validation flow really hard to follow.",
    configs: { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }
  },
  {
    name: 'gear-edge-empty-flags',
    description: 'Already well-scoped request — should produce empty critique_flags.',
    originalPrompt: 'Add a unit test for parseConfig() covering valid input, missing keys, invalid type.',
    configs: { model: 'haiku', breadth: 'normal', format: 'code', skill: null }
  }
  // Add more as the system prompt evolves
]

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set. Aborting.')
  process.exit(1)
}

const FIXTURES_DIR = join(process.cwd(), 'test/fixtures/api')
mkdirSync(FIXTURES_DIR, { recursive: true })

const client = new AnthropicClient({ apiKey })

async function main(): Promise<void> {
  for (const sc of SCENARIOS) {
    console.log(`Recording ${sc.name}...`)
    const request = buildGearRequest({ originalPrompt: sc.originalPrompt, configs: sc.configs })
    const result = await client.complete(request)
    if (!result.ok) {
      console.error(`  FAILED (${result.error.code}): ${result.error.message}`)
      continue
    }
    const fixture = {
      description: sc.description,
      recordedAt: new Date().toISOString(),
      response: result.data
    }
    const path = join(FIXTURES_DIR, `${sc.name}.json`)
    writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n', 'utf8')
    console.log(`  → ${path} (input=${result.data.inputTokens}, output=${result.data.outputTokens})`)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(2)
})
