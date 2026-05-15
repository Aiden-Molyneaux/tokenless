import type { DropdownItem } from '../components/common/Dropdown'

// Mock dropdown options for ConfigsRow (breadths/formats only). Models are
// now served via the pricing:list IPC channel — see usePricing() hook.

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

