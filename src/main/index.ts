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
import { AnthropicClient } from './api'
import {
  openDatabase,
  closeDatabase,
  runMigrations,
  MIGRATIONS,
  seedDefaultAccount,
  type Database
} from './db'

// Initialize the Logger as early as possible so even early-startup errors
// can be captured. Log files live under ~/.tokenless/logs/.
const logDir = join(homedir(), '.tokenless', 'logs')
const fileSink = new FileSink(logDir)
const logger = new Logger(fileSink, 5000, 'main')

installUncaughtHandlers(logger)

logger.info('observability', 'logger-online', 'Logger initialized', { logDir })

// Bootstrap: honor TOKENLESS_USER_DATA_DIR for E2E test isolation (Task 27).
// Must be set BEFORE app.whenReady() — Electron accepts setPath calls before ready.
const overrideUserData = process.env['TOKENLESS_USER_DATA_DIR']
if (overrideUserData) {
  app.setPath('userData', overrideUserData)
  logger.info('observability', 'userData-override', 'userData path overridden via env', {
    path: overrideUserData
  })
}

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

let db: Database | null = null

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
  logger.info('observability', 'app-ready', 'Electron ready, opening database')

  const dbPath = join(app.getPath('userData'), 'tokenless.db')
  try {
    db = openDatabase(dbPath)
    runMigrations(db, MIGRATIONS)
    seedDefaultAccount(db)
    logger.info('db', 'db-online', 'Database opened, migrations applied', { dbPath })
  } catch (error) {
    logger.fatal('db', 'db-init-failed', 'Failed to open database', {
      dbPath,
      errorString: String(error)
    })
    // Without a DB the app cannot function — quit immediately
    app.quit()
    return
  }

  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? ''
  if (!apiKey) {
    logger.warn('api', 'api-key-missing', 'ANTHROPIC_API_KEY not set — gearing will fail with API_AUTH_FAILED')
  }
  const anthropicClient = new AnthropicClient({ apiKey })

  const ipcRegistration = registerIpcHandlers(ipcMain, logger, broadcast, db, anthropicClient)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', () => {
    logger.info('observability', 'shutdown', 'Before quit, releasing resources')
    ipcRegistration.uninstallAll()
    if (db) {
      closeDatabase(db)
      db = null
    }
  })
})

app.on('window-all-closed', () => {
  logger.info('observability', 'shutdown', 'All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
