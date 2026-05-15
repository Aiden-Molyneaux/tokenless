import type { SettingsGetResult, SettingsSetResult } from '@shared/ipc/settings'

export async function readSetting(key: string): Promise<string | null> {
  const result: SettingsGetResult = await window.tokenless.settings.get({ key })
  return result.ok ? result.data.value : null
}

export async function writeSetting(key: string, value: string): Promise<void> {
  const result: SettingsSetResult = await window.tokenless.settings.set({ key, value })
  if (!result.ok) {
    throw new Error(`Failed to write setting ${key}: ${result.error.message}`)
  }
}

export const SETTING_LAST_ACTIVE_ACCOUNT_ID = 'lastActiveAccountId'
export const SETTING_LAST_ACTIVE_PROJECT_ID = 'lastActiveProjectId'
