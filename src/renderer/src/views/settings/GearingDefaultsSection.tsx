import { useEffect, useState } from 'react'
import { Dropdown } from '../../components/common/Dropdown'
import { readSetting, writeSetting } from '../../hooks/use-settings'
import { usePricing } from '../../hooks/use-pricing'
import { MOCK_BREADTHS, MOCK_FORMATS } from '../../mocks/dropdown-options'
import {
  SETTING_GEARING_DEFAULT_MODEL,
  SETTING_GEARING_DEFAULT_BREADTH,
  SETTING_GEARING_DEFAULT_FORMAT
} from '@shared/types/settings-keys'

// GearingDefaultsSection — 3 dropdowns (model / breadth / format).
// Reads current values from settings on mount; writes on each change.
// Composer reads the same keys on its own mount so that these defaults take effect.

export function GearingDefaultsSection(): JSX.Element {
  const pricing = usePricing()
  const modelItems = pricing.map((p) => ({
    value: p.key,
    label: p.displayName,
    description: p.description
  }))

  const [model, setModel] = useState<string>('opus')
  const [breadth, setBreadth] = useState<string>(MOCK_BREADTHS[1].value)
  const [format, setFormat] = useState<string>(MOCK_FORMATS[0].value)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([
      readSetting(SETTING_GEARING_DEFAULT_MODEL),
      readSetting(SETTING_GEARING_DEFAULT_BREADTH),
      readSetting(SETTING_GEARING_DEFAULT_FORMAT)
    ]).then(([m, b, f]) => {
      if (m !== null) setModel(m)
      if (b !== null) setBreadth(b)
      if (f !== null) setFormat(f)
      setLoaded(true)
    })
  }, [])

  const handleModelChange = (value: string): void => {
    setModel(value)
    void writeSetting(SETTING_GEARING_DEFAULT_MODEL, value)
  }

  const handleBreadthChange = (value: string): void => {
    setBreadth(value)
    void writeSetting(SETTING_GEARING_DEFAULT_BREADTH, value)
  }

  const handleFormatChange = (value: string): void => {
    setFormat(value)
    void writeSetting(SETTING_GEARING_DEFAULT_FORMAT, value)
  }

  if (!loaded) return <section className="settings-section"><h3 className="settings-section__heading">Gearing Defaults</h3></section>

  return (
    <section className="settings-section">
      <h3 className="settings-section__heading">Gearing Defaults</h3>
      <div className="gearing-defaults__grid">
        <div className="gearing-defaults__field">
          <span className="gearing-defaults__label">Default Model</span>
          <Dropdown
            label=""
            items={modelItems}
            activeValue={model}
            onSelect={handleModelChange}
          />
        </div>
        <div className="gearing-defaults__field">
          <span className="gearing-defaults__label">Default Breadth</span>
          <Dropdown
            label=""
            items={MOCK_BREADTHS}
            activeValue={breadth}
            onSelect={handleBreadthChange}
          />
        </div>
        <div className="gearing-defaults__field">
          <span className="gearing-defaults__label">Default Format</span>
          <Dropdown
            label=""
            items={MOCK_FORMATS}
            activeValue={format}
            onSelect={handleFormatChange}
          />
        </div>
      </div>
    </section>
  )
}
