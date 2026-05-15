import type { DropdownItem } from '../components/common/Dropdown'

// Mock dropdown options for ConfigsRow. Phase 5 replaces with real models
// (from Anthropic SDK) and Phase 6 replaces skill mocks with real ones
// discovered from ~/.claude/skills/.

export const MOCK_MODELS: readonly DropdownItem[] = [
  { value: 'haiku', label: 'Haiku 4.5', description: 'fastest · cheapest' },
  { value: 'sonnet', label: 'Sonnet 4.6', description: 'balanced' },
  { value: 'opus', label: 'Opus 4.7', description: 'most capable · best for hard tasks' }
]

export const MOCK_BREADTHS: readonly DropdownItem[] = [
  { value: 'terse', label: 'Terse', description: '≤200 words' },
  { value: 'normal', label: 'Normal', description: 'no upper limit' },
  { value: 'thorough', label: 'Thorough', description: 'detailed analysis' }
]

export const MOCK_FORMATS: readonly DropdownItem[] = [
  { value: 'prose', label: 'Prose', description: 'natural paragraphs' },
  { value: 'bullets', label: 'Bullets', description: 'list format' },
  { value: 'code', label: 'Code only', description: 'just the diff, no preamble' },
  { value: 'json', label: 'JSON', description: 'structured data' }
]

export const MOCK_SKILLS: readonly DropdownItem[] = [
  { value: '', label: 'None', description: 'no skill requested' },
  { value: 'simplify', label: 'simplify', description: 'review changed code for reuse + quality' },
  { value: 'review', label: 'review', description: 'review a pull request' },
  { value: 'security-review', label: 'security-review', description: 'security audit of pending changes' }
]
