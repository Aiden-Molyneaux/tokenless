import type { Template } from '@shared/types/templates'

import { useTemplates } from '../../hooks/use-templates'

interface TemplatePickerPopoverProps {
  onInsert: (body: string) => void
  onClose: () => void
}

function groupByCategory(templates: readonly Template[]): readonly { category: string; items: readonly Template[] }[] {
  const map = new Map<string, Template[]>()
  for (const t of templates) {
    const cat = t.category ?? 'Other'
    const arr = map.get(cat) ?? []
    arr.push(t)
    map.set(cat, arr)
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
}

export function TemplatePickerPopover({ onInsert, onClose }: TemplatePickerPopoverProps): JSX.Element {
  const { templates, loading } = useTemplates()
  const groups = groupByCategory(templates)

  return (
    <div className="template-picker-popover" role="dialog" aria-label="Insert a template">
      <div className="template-picker-popover__header">
        <h3 className="template-picker-popover__title">Templates</h3>
        <button
          type="button"
          aria-label="Close templates"
          className="template-picker-popover__close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="template-picker-popover__body">
        {loading ? (
          <p className="template-picker-popover__empty">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="template-picker-popover__empty">No templates available.</p>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="template-picker-popover__group">
              <h4 className="template-picker-popover__group-title">{g.category}</h4>
              <ul className="template-picker-popover__list">
                {g.items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="template-picker-popover__item"
                      onClick={() => onInsert(t.body)}
                    >
                      <span className="template-picker-popover__item-name">{t.name}</span>
                      {t.description && (
                        <span className="template-picker-popover__item-description">{t.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
