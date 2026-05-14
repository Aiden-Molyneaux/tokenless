import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  FileSink,
  installUncaughtHandlers,
  Logger
} from './observability'
import type { Broadcast } from './ipc/log-bridge'
import { registerIpcHandlers } from './ipc'

// Initialize the Logger as early as possible so even early-startup errors
// can be captured. Log files live under ~/.tokenless/logs/.
const logDir = join(homedir(), '.tokenless', 'logs')
const fileSink = new FileSink(logDir)
const logger = new Logger(fileSink, 5000, 'main')

installUncaughtHandlers(logger)

logger.info('observability', 'logger-online', 'Logger initialized', { logDir })

// Broadcast records to every renderer window. Inlined here (instead of in
// log-bridge.ts) so the bridge module stays free of electron imports — tests
// for LogBridge can use a fake Broadcast spy without dragging electron in.
const broadcast: Broadcast = (channel: string, payload: unknown) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

const ipcRegistration = registerIpcHandlers(ipcMain, logger, broadcast)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'TokenLess',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  logger.info('observability', 'app-ready', 'Electron ready, creating window')
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.info('observability', 'shutdown', 'All windows closed')
  ipcRegistration.uninstallAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
