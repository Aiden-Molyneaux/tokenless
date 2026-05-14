import { contextBridge } from 'electron'

const api = {
  version: '0.0.1'
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('tokenless', api)
  } catch (error) {
    console.error('contextBridge.exposeInMainWorld failed:', error)
  }
} else {
  window.tokenless = api
}
