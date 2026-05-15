import { useEffect, useState } from 'react'
import { readSetting, writeSetting } from '../../hooks/use-settings'
import { SETTING_GEARING_SEND_CONFIRM } from '@shared/types/settings-keys'

// SendConfirmToggle — when enabled, Composer shows a ConfirmModal before
// actually sending the prompt. The setting is persisted via the settings table.

export function SendConfirmToggle(): JSX.Element {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    void readSetting(SETTING_GEARING_SEND_CONFIRM).then((val) => {
      setChecked(val === '1')
    })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const next = e.target.checked
    setChecked(next)
    void writeSetting(SETTING_GEARING_SEND_CONFIRM, next ? '1' : '0')
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section__heading">Send Confirmation</h3>
      <div className="settings-toggle-row">
        <div className="settings-toggle-row__label">
          <span className="settings-toggle-row__name">Confirm before send</span>
          <span className="settings-toggle-row__description">
            Show a confirmation dialog before sending a prompt to Claude.
          </span>
        </div>
        <input
          type="checkbox"
          className="settings-toggle-row__checkbox"
          checked={checked}
          onChange={handleChange}
          aria-label="Confirm before send"
        />
      </div>
    </section>
  )
}
