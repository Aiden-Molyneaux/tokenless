import { contextBridge } from 'electron'

const api = {
  version: '0.0.1'
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('tokenless', api)
  } catch (error) {
    // TODO(phase-1): replace with logger.error once the Logger has a preload bridge.
    // Pre-Logger console usage is intentionally allowed here; see CLAUDE.md.
    console.error('contextBridge.exposeInMainWorld failed:', error)
  }
} else {
  window.tokenless = api
}
