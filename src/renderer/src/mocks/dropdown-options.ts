import type { DropdownItem } from '../components/common/Dropdown'

// Mock dropdown options for ConfigsRow (models/breadths/formats only). Phase 6C wires real skill data via useSkills(); see Composer.

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

