import type { ReactNode } from 'react'
import { Dropdown } from '../common/Dropdown'
import type { DropdownItem } from '../common/Dropdown'
import { InfoTooltip } from '../common/InfoTooltip'
import {
  MOCK_BREADTHS,
  MOCK_FORMATS
} from '../../mocks/dropdown-options'

interface ConfigsRowProps {
  model: string
  onModelChange: (value: string) => void
  modelItems: readonly DropdownItem[]
  breadth: string
  onBreadthChange: (value: string) => void
  format: string
  onFormatChange: (value: string) => void
  skill: string
  onSkillChange: (value: string) => void
  skillItems: readonly DropdownItem[]
  renderSkillItem?: (item: DropdownItem, isActive: boolean) => ReactNode
}

// The row of 4 configuration dropdowns below the prompt textarea.
// Each Dropdown is wrapped in an InfoTooltip explaining what the option
// affects. Phase 5 wires real contextFn/outcomeFn closures that vary by
// other configs (e.g., "since you have Haiku selected, this option does X").

export function ConfigsRow(props: ConfigsRowProps): JSX.Element {
  return (
    <div className="configs-row">
      <InfoTooltip
        helperText="Target model for this prompt"
        contextFn={() => {
          if (props.model === 'haiku') return 'Haiku needs explicit instructions for non-trivial tasks.'
          if (props.model === 'opus') return 'Opus tolerates loose direction — gearing focuses on output shape.'
          return null
        }}
      >
        <Dropdown
          label="Model:"
          items={props.modelItems}
          activeValue={props.model}
          onSelect={props.onModelChange}
        />
      </InfoTooltip>
      <InfoTooltip
        helperText="How long Claude's response should be"
        contextFn={() => {
          if (props.breadth === 'terse') return 'Saves ~70% output tokens vs Thorough at the cost of completeness.'
          return null
        }}
      >
        <Dropdown
          label="Breadth:"
          items={MOCK_BREADTHS}
          activeValue={props.breadth}
          onSelect={props.onBreadthChange}
        />
      </InfoTooltip>
      <InfoTooltip helperText="Response format Claude should produce">
        <Dropdown
          label="Format:"
          items={MOCK_FORMATS}
          activeValue={props.format}
          onSelect={props.onFormatChange}
        />
      </InfoTooltip>
      <InfoTooltip
        helperText="Optional skill to invoke (from ~/.claude/skills/)"
        contextFn={() => {
          if (props.skill === '') return null
          return `Skill "${props.skill}" will be explicitly requested in the geared prompt.`
        }}
      >
        <Dropdown
          label="Skill:"
          items={props.skillItems}
          activeValue={props.skill}
          onSelect={props.onSkillChange}
          renderItem={props.renderSkillItem}
        />
      </InfoTooltip>
    </div>
  )
}
