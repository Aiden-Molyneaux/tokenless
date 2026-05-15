import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  FileSink,
  installUncaughtHandlers,
  Logger
} from './observability'
import type { Broadcast } from './ipc/log-bridge'
import { registerIpcHandlers } from './ipc'
import { AnthropicClientRegistry } from './api'
import {
  openDatabase,
  closeDatabase,
  runMigrations,
  MIGRATIONS,
  seedBuiltinData,
  SettingsDao,
  type Database
} from './db'

// Initialize the Logger as early as possible so even early-startup errors
// can be captured. Log files live under `<userData>/logs/` (next to the DB).
const logDir = join(app.getPath('userData'), 'logs')
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
  const iconPath = join(app.getAppPath(), 'resources', 'icon.ico')
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
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
    const backupsDir = join(app.getPath('userData'), 'backups')
    runMigrations(db, MIGRATIONS, { dbPath, backupsDir })
    seedBuiltinData(db)
    // E2E test harness opt-out: pre-seed `onboarding.complete = '1'` so the
    // wizard overlay doesn't block clicks on the AppShell underneath. Real
    // users never set this env var; the renderer reads the setting the same
    // way regardless.
    if (process.env['TOKENLESS_SKIP_ONBOARDING'] === '1') {
      SettingsDao.setSetting(db, 'onboarding.complete', '1')
      SettingsDao.setSetting(db, 'privacy.acknowledged', '1')
    }
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

  // Phase 6A: accounts own their API keys — no global ANTHROPIC_API_KEY.
  // The AnthropicClientRegistry resolves per-account clients on demand.
  const clientRegistry = new AnthropicClientRegistry(logger)

  const ipcRegistration = registerIpcHandlers(ipcMain, logger, broadcast, db, clientRegistry)

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
