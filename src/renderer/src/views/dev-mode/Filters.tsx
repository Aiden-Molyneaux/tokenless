import type { Category, Severity, Source } from '@shared/observability'
import { CATEGORIES } from '@shared/observability'

const SEVERITIES: readonly Severity[] = ['debug', 'info', 'warn', 'error', 'fatal']
const SOURCES: readonly Source[] = ['main', 'renderer']

export interface FilterState {
  severities: Set<Severity>
  categories: Set<Category>
  sources: Set<Source>
  search: string
}

interface FiltersProps {
  state: FilterState
  onChange: (next: FilterState) => void
}

function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set)
  if (next.has(item)) next.delete(item)
  else next.add(item)
  return next
}

export function Filters({ state, onChange }: FiltersProps): JSX.Element {
  return (
    <div className="filters">
      <div className="filters__group">
        <span className="filters__label">Severity:</span>
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            className={`filters__chip filters__chip--severity-${s} ${state.severities.has(s) ? 'is-active' : ''}`}
            onClick={() => onChange({ ...state, severities: toggleSetItem(state.severities, s) })}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="filters__group">
        <span className="filters__label">Category:</span>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`filters__chip ${state.categories.has(c) ? 'is-active' : ''}`}
            onClick={() => onChange({ ...state, categories: toggleSetItem(state.categories, c) })}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="filters__group">
        <span className="filters__label">Source:</span>
        {SOURCES.map((src) => (
          <button
            key={src}
            type="button"
            className={`filters__chip ${state.sources.has(src) ? 'is-active' : ''}`}
            onClick={() => onChange({ ...state, sources: toggleSetItem(state.sources, src) })}
          >
            {src}
          </button>
        ))}
      </div>
      <div className="filters__group filters__group--search">
        <input
          type="search"
          className="filters__search"
          placeholder="Search event or message…"
          value={state.search}
          onChange={(e) => onChange({ ...state, search: e.target.value })}
        />
      </div>
    </div>
  )
}

// Helper used by DevModePanel to compute the visible records after filtering.
export function applyFilters(records: readonly { severity: Severity; category: Category; source: Source; event: string; message: string }[], state: FilterState): typeof records {
  return records.filter((r) => {
    if (state.severities.size > 0 && !state.severities.has(r.severity)) return false
    if (state.categories.size > 0 && !state.categories.has(r.category)) return false
    if (state.sources.size > 0 && !state.sources.has(r.source)) return false
    if (state.search.length > 0) {
      const q = state.search.toLowerCase()
      if (!r.event.toLowerCase().includes(q) && !r.message.toLowerCase().includes(q)) return false
    }
    return true
  })
}

export function emptyFilterState(): FilterState {
  return {
    severities: new Set(),
    categories: new Set(),
    sources: new Set(),
    search: ''
  }
}
