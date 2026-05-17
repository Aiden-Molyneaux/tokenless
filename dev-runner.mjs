#!/usr/bin/env node
// TokenLess Dev Runner — a single-file TUI for iterating on TokenLess.
//
// Goals:
//   1. Single source of truth for "what's running, what ABI we're on"
//   2. ABI-aware actions (auto-switches when needed, announces wait time)
//   3. Honest time estimates (hardcoded baselines + per-machine history)
//   4. Single-keypress menu, no extra dependencies
//
// Usage: `npm run tl`  (or `node dev-runner.mjs` directly)
//
// State persisted in .dev-runner-state.json (gitignored). The script is
// best-effort about detecting external changes (e.g. you ran `npm run dev`
// outside this tool) — the State file tracks intent; commands observe
// actual success/failure and reconcile.

import { spawn, execSync, exec } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const STATE_FILE = resolve('.dev-runner-state.json')
const IS_WIN = process.platform === 'win32'

// Hardcoded baseline estimates in seconds. Per-machine history overrides
// these once we have measurements.
const BASELINE_ESTIMATES = {
  rebuildElectron: 25,  // electron-rebuild or prebuild-install fallback
  rebuildNode: 15,      // npm rebuild better-sqlite3
  devStart: 12,         // npm run dev → Electron window appears
  devStop: 3,           // taskkill / pkill the dev tree
  testRun: 18,          // npm run test:run (vitest run)
  testWatch: 8,         // npm test (vitest watch — opens, doesn't block)
  buildUnpack: 50,      // electron-vite build && electron-builder --dir
  typecheck: 8          // tsc --noEmit
}

// Colors (ANSI). No chalk dep.
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
}

// ────────────────────────────────────────────────────────────────────
// State management
// ────────────────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { abi: 'unknown', devPid: null, devStartedAt: null, history: {} }
  }
  try {
    const raw = readFileSync(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      abi: parsed.abi ?? 'unknown',
      devPid: parsed.devPid ?? null,
      devStartedAt: parsed.devStartedAt ?? null,
      history: parsed.history ?? {}
    }
  } catch {
    return { abi: 'unknown', devPid: null, devStartedAt: null, history: {} }
  }
}

function saveState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch (err) {
    console.error(`${C.red}Failed to write state file:${C.reset} ${err.message}`)
  }
}

function recordTiming(state, action, seconds) {
  if (!state.history[action]) state.history[action] = []
  state.history[action].push(seconds)
  // Keep last 10 samples
  if (state.history[action].length > 10) state.history[action].shift()
  saveState(state)
}

function estimateSeconds(state, action) {
  const samples = state.history[action]
  if (!samples || samples.length === 0) return BASELINE_ESTIMATES[action] ?? 10
  // Use median of recent samples
  const sorted = [...samples].sort((a, b) => a - b)
  return Math.round(sorted[Math.floor(sorted.length / 2)])
}

// ────────────────────────────────────────────────────────────────────
// Detection
// ────────────────────────────────────────────────────────────────────

// Probe ABI by trying to load better-sqlite3 in both runtimes. The result
// indicates which runtime(s) can actually use the current native binary.
//
// IMPORTANT: don't trust state.abi — it can drift when an rebuild silently
// no-ops, or when `npm install` reverts to a prebuild after the user runs
// electron-rebuild. Always probe the ground truth before deciding to rebuild.
//
// Returns: 'node' | 'electron' | 'both' | 'unknown'
function detectABI() {
  const nodeOk = canLoadInNode()
  const electronOk = canLoadInElectron()
  if (nodeOk && electronOk) return 'both'  // N-API prebuild — universal
  if (electronOk) return 'electron'
  if (nodeOk) return 'node'
  return 'unknown'
}

function canLoadInNode() {
  try {
    execSync(
      `node -e "require('better-sqlite3'); process.exit(0)"`,
      { stdio: 'pipe', cwd: process.cwd() }
    )
    return true
  } catch {
    return false
  }
}

function canLoadInElectron() {
  const electronPath = resolve('node_modules/electron/dist/electron.exe')
  if (!existsSync(electronPath)) return false
  try {
    // ELECTRON_RUN_AS_NODE makes Electron behave like a plain Node interpreter
    // so we can run a one-liner without needing a window or app context.
    execSync(
      `"${electronPath}" -e "require('better-sqlite3'); process.exit(0)"`,
      { stdio: 'pipe', cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
    )
    return true
  } catch {
    return false
  }
}

// ABI for menu display purposes: collapse 'both' to 'electron' since either
// works for dev, and that's what the user cares about visually.
function displayABI(abi) {
  return abi === 'both' ? 'electron' : abi
}

// Can we start dev right now? Need Electron-compatible native modules.
function isElectronCompatible(abi) {
  return abi === 'electron' || abi === 'both'
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') return false
  try {
    process.kill(pid, 0)  // signal 0 = probe, doesn't kill
    return true
  } catch {
    return false
  }
}

// ────────────────────────────────────────────────────────────────────
// Process management
// ────────────────────────────────────────────────────────────────────

function killProcessTree(pid) {
  if (!pid) return
  if (IS_WIN) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'pipe' })
    } catch {
      // Already gone — fine.
    }
  } else {
    try { execSync(`pkill -P ${pid}`, { stdio: 'pipe' }) } catch {}
    try { process.kill(pid) } catch {}
  }
}

// ────────────────────────────────────────────────────────────────────
// ABI switching
// ────────────────────────────────────────────────────────────────────

async function rebuildForElectron(state) {
  const start = Date.now()
  process.stdout.write(`${C.cyan}Rebuilding better-sqlite3 + node-pty for Electron ABI…${C.reset}\n`)
  // Try electron-rebuild first; if it fails (e.g. no VS Build Tools), fall back
  // to prebuild-install for better-sqlite3. node-pty's N-API prebuilds work in both.
  try {
    execSync(
      `npx electron-rebuild --force --module-dir node_modules/better-sqlite3`,
      { stdio: 'inherit' }
    )
  } catch {
    process.stdout.write(`${C.yellow}electron-rebuild failed (likely no VS Build Tools). Trying prebuild-install fallback…${C.reset}\n`)
    try {
      const electronVersion = readElectronVersion()
      execSync(
        `npx prebuild-install --runtime=electron --target=${electronVersion}`,
        { stdio: 'inherit', cwd: resolve('node_modules/better-sqlite3') }
      )
    } catch (err) {
      process.stdout.write(`${C.red}prebuild-install failed: ${err.message}${C.reset}\n`)
    }
  }
  // Don't trust the rebuild's exit code (electron-rebuild often exits 0
  // without actually rebuilding). Probe the actual loaded ABI to verify.
  process.stdout.write(`${C.dim}Verifying ABI…${C.reset}\n`)
  const detected = detectABI()
  state.abi = detected
  saveState(state)
  const elapsed = (Date.now() - start) / 1000
  if (isElectronCompatible(detected)) {
    recordTiming(state, 'rebuildElectron', elapsed)
    process.stdout.write(`${C.green}✓ ABI is now Electron-compatible (${elapsed.toFixed(1)}s, detected: ${detected})${C.reset}\n`)
    return true
  }
  process.stdout.write(`${C.red}✗ ABI switch failed: still ${detected} after rebuild. Install Visual Studio Build Tools or check npm output above for errors.${C.reset}\n`)
  return false
}

async function rebuildForNode(state) {
  const start = Date.now()
  process.stdout.write(`${C.cyan}Rebuilding better-sqlite3 + node-pty for Node ABI…${C.reset}\n`)
  try {
    execSync(`npm rebuild better-sqlite3 node-pty`, { stdio: 'inherit' })
  } catch (err) {
    process.stdout.write(`${C.red}✗ rebuild command failed: ${err.message}${C.reset}\n`)
  }
  process.stdout.write(`${C.dim}Verifying ABI…${C.reset}\n`)
  const detected = detectABI()
  state.abi = detected
  saveState(state)
  const elapsed = (Date.now() - start) / 1000
  // 'node' or 'both' both mean Node tests will work
  if (detected === 'node' || detected === 'both') {
    recordTiming(state, 'rebuildNode', elapsed)
    process.stdout.write(`${C.green}✓ ABI is now Node-compatible (${elapsed.toFixed(1)}s, detected: ${detected})${C.reset}\n`)
    return true
  }
  process.stdout.write(`${C.red}✗ ABI switch failed: detected ${detected}${C.reset}\n`)
  return false
}

function readElectronVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    const range = pkg.devDependencies?.electron ?? pkg.dependencies?.electron ?? '^32.0.0'
    // Strip the leading ^ or ~ from the semver range
    return range.replace(/^[\^~]/, '')
  } catch {
    return '32.3.3'
  }
}

async function ensureABI(target, state) {
  // 'both' satisfies any target (N-API binaries work everywhere)
  if (state.abi === 'both') return true
  if (target === 'electron') {
    if (isElectronCompatible(state.abi)) return true
    return rebuildForElectron(state)
  }
  if (target === 'node') {
    if (state.abi === 'node') return true
    return rebuildForNode(state)
  }
  return false
}

// ────────────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────────────

async function actionStartDev(state) {
  if (isProcessAlive(state.devPid)) {
    process.stdout.write(`${C.yellow}Dev server already running (PID ${state.devPid}). Use [r] to restart.${C.reset}\n`)
    return
  }
  if (!isElectronCompatible(state.abi)) {
    process.stdout.write(`${C.dim}ABI is ${state.abi}; rebuilding for Electron first…${C.reset}\n`)
    const ok = await ensureABI('electron', state)
    if (!ok) {
      process.stdout.write(`${C.red}Cannot start dev without Electron-compatible native modules.${C.reset}\n`)
      return
    }
  }
  process.stdout.write(`${C.cyan}Starting electron-vite dev…${C.reset}\n`)
  const start = Date.now()
  const logPath = resolve('.dev-runner-output.log')
  const fs = await import('node:fs')
  // Truncate any prior log so polling sees only this run's output
  fs.writeFileSync(logPath, '')

  // We spawn electron-vite directly via `node node_modules/.../electron-vite.js dev`
  // instead of `npm run dev`. Two Windows-specific reasons:
  //   1. Node 20+ won't spawn .cmd shims (npm.cmd) without shell: true.
  //   2. shell: true + detached: true + piped stdio is broken on Windows —
  //      pipes attach to a new console, not us, so the log file stays empty.
  // Going straight to node + the script bypasses both problems. We also pass
  // the log file as an FD into stdio so the kernel writes directly to it —
  // no Node-side pipe involved, survives detach.
  const evScript = resolve('node_modules/electron-vite/bin/electron-vite.js')
  if (!existsSync(evScript)) {
    process.stdout.write(`${C.red}electron-vite not found at ${evScript}. Run npm install first.${C.reset}\n`)
    return
  }
  const logFd = fs.openSync(logPath, 'a')
  const proc = spawn(process.execPath, [evScript, 'dev'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true
  })
  // Once spawn has duplicated the FD into the child, we can close ours
  fs.closeSync(logFd)
  state.devPid = proc.pid
  state.devStartedAt = Date.now()
  saveState(state)
  proc.unref()

  // Poll the log file for "start electron app" — works on both platforms,
  // and is the only option on Windows where stdio pipes aren't reachable.
  process.stdout.write(`${C.dim}Waiting for Electron to start (up to 60s)…${C.reset}\n`)
  let sawReady = false
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline && !sawReady) {
    await sleep(500)
    try {
      const log = fs.readFileSync(logPath, 'utf8')
      if (/start electron app/i.test(log)) {
        sawReady = true
        const elapsed = (Date.now() - start) / 1000
        recordTiming(state, 'devStart', elapsed)
        process.stdout.write(`${C.green}✓ Electron starting up (${elapsed.toFixed(1)}s; window appearing momentarily)${C.reset}\n`)
        process.stdout.write(`${C.dim}  PID: ${proc.pid} · output streaming to ${logPath}${C.reset}\n`)
        break
      }
      // Surface any build errors early instead of waiting the full 60s
      if (/\b(EADDRINUSE|MODULE_NOT_FOUND|Cannot find module|error TS\d+|ENOENT)\b/.test(log) && log.length > 0) {
        // Keep polling — these may be transient, but tail will show them
      }
    } catch { /* log not yet written */ }
  }
  if (!sawReady) {
    process.stdout.write(`${C.yellow}Dev server didn't reach "start electron app" within 60s. Last lines of log:${C.reset}\n`)
    try {
      const log = fs.readFileSync(logPath, 'utf8')
      const lines = log.split('\n').slice(-20)
      process.stdout.write(`${C.gray}${lines.join('\n')}${C.reset}\n`)
    } catch { /* nothing to show */ }
    process.stdout.write(`${C.yellow}Full log: ${logPath}${C.reset}\n`)
  }
}

async function actionRestartDev(state) {
  if (isProcessAlive(state.devPid)) {
    process.stdout.write(`${C.cyan}Killing dev (PID ${state.devPid})…${C.reset}\n`)
    const start = Date.now()
    killProcessTree(state.devPid)
    await waitForExit(state.devPid, 5000)
    recordTiming(state, 'devStop', (Date.now() - start) / 1000)
    state.devPid = null
    saveState(state)
  }
  await actionStartDev(state)
}

async function actionStopDev(state) {
  if (!isProcessAlive(state.devPid)) {
    process.stdout.write(`${C.dim}No dev process to stop.${C.reset}\n`)
    state.devPid = null
    saveState(state)
    return
  }
  const start = Date.now()
  process.stdout.write(`${C.cyan}Stopping dev (PID ${state.devPid})…${C.reset}\n`)
  killProcessTree(state.devPid)
  await waitForExit(state.devPid, 5000)
  recordTiming(state, 'devStop', (Date.now() - start) / 1000)
  state.devPid = null
  state.devStartedAt = null
  saveState(state)
  process.stdout.write(`${C.green}✓ Dev stopped${C.reset}\n`)
}

async function actionRunTests(state) {
  if (isProcessAlive(state.devPid)) {
    process.stdout.write(`${C.yellow}Dev server is running. Tests need Node ABI; this will swap ABIs and dev will need a restart afterward.${C.reset}\n`)
    process.stdout.write(`${C.yellow}Press [k] first if you want to keep dev's state.${C.reset}\n`)
    return
  }
  if (state.abi !== 'node' && state.abi !== 'both') {
    const ok = await ensureABI('node', state)
    if (!ok) return
  }
  process.stdout.write(`${C.cyan}npm run test:run…${C.reset}\n`)
  const start = Date.now()
  try {
    execSync('npm run test:run', { stdio: 'inherit' })
    recordTiming(state, 'testRun', (Date.now() - start) / 1000)
    process.stdout.write(`${C.green}✓ Tests passed${C.reset}\n`)
  } catch {
    process.stdout.write(`${C.red}✗ Tests failed (see output above)${C.reset}\n`)
  }
}

async function actionTypecheck(state) {
  process.stdout.write(`${C.cyan}npm run typecheck…${C.reset}\n`)
  const start = Date.now()
  try {
    execSync('npm run typecheck', { stdio: 'inherit' })
    recordTiming(state, 'typecheck', (Date.now() - start) / 1000)
    process.stdout.write(`${C.green}✓ Typecheck clean${C.reset}\n`)
  } catch {
    process.stdout.write(`${C.red}✗ Typecheck failed${C.reset}\n`)
  }
}

async function actionBuildUnpack(state) {
  if (isProcessAlive(state.devPid)) {
    process.stdout.write(`${C.yellow}Dev server is running. Stop it first (or this build will conflict on file locks).${C.reset}\n`)
    return
  }
  if (!isElectronCompatible(state.abi)) {
    const ok = await ensureABI('electron', state)
    if (!ok) return
  }
  process.stdout.write(`${C.cyan}npm run build:unpack… (~${estimateSeconds(state, 'buildUnpack')}s)${C.reset}\n`)
  const start = Date.now()
  try {
    execSync('npm run build:unpack', { stdio: 'inherit' })
    recordTiming(state, 'buildUnpack', (Date.now() - start) / 1000)
    process.stdout.write(`${C.green}✓ Build complete. dist/win-unpacked/TokenLess.exe ready.${C.reset}\n`)
  } catch {
    process.stdout.write(`${C.red}✗ Build failed${C.reset}\n`)
  }
}

async function actionTail(state) {
  const logPath = resolve('.dev-runner-output.log')
  if (!existsSync(logPath)) {
    process.stdout.write(`${C.dim}No log file yet (start dev first).${C.reset}\n`)
    return
  }
  process.stdout.write(`${C.dim}Last 30 lines of ${logPath}:${C.reset}\n\n`)
  try {
    const content = readFileSync(logPath, 'utf8')
    const lines = content.split(/\r?\n/)
    const tail = lines.slice(-30).join('\n')
    process.stdout.write(tail + '\n')
  } catch (err) {
    process.stdout.write(`${C.red}Failed to read log: ${err.message}${C.reset}\n`)
  }
}

async function actionForceABI(state, target) {
  // Manual override: rebuild even if state already says we're on target
  if (isProcessAlive(state.devPid)) {
    process.stdout.write(`${C.yellow}Dev is running. Stop it first to avoid native-module-load mid-rebuild.${C.reset}\n`)
    return
  }
  if (target === 'electron') await rebuildForElectron(state)
  else await rebuildForNode(state)
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForExit(pid, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) return true
    await sleep(100)
  }
  return false
}

function formatUptime(startedAt) {
  if (!startedAt) return ''
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m${s}s`
}

// ────────────────────────────────────────────────────────────────────
// Rendering
// ────────────────────────────────────────────────────────────────────

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0f')
}

function abiBadge(abi) {
  if (abi === 'electron') return `${C.magenta}Electron${C.reset}`
  if (abi === 'node') return `${C.cyan}Node${C.reset}`
  if (abi === 'both') return `${C.green}Both (N-API)${C.reset}`
  return `${C.yellow}unknown${C.reset}`
}

function devBadge(state) {
  if (isProcessAlive(state.devPid)) {
    return `${C.green}running${C.reset} ${C.dim}PID ${state.devPid} · up ${formatUptime(state.devStartedAt)}${C.reset}`
  }
  return `${C.dim}stopped${C.reset}`
}

function render(state) {
  clearScreen()
  const abi = state.abi
  const devAlive = isProcessAlive(state.devPid)

  // Sync state if dev died externally
  if (state.devPid && !devAlive) {
    state.devPid = null
    state.devStartedAt = null
    saveState(state)
  }

  process.stdout.write(`${C.bold}TokenLess Dev Runner${C.reset}\n`)
  process.stdout.write(`${C.gray}────────────────────${C.reset}\n`)
  process.stdout.write(`${C.dim}ABI:${C.reset}  ${abiBadge(abi)}\n`)
  process.stdout.write(`${C.dim}Dev:${C.reset}  ${devBadge(state)}\n`)
  process.stdout.write(`\n`)

  const lines = [
    menuLine('s', 'Start dev (HMR)', estimateStart(state)),
    menuLine('r', 'Restart dev', estimateRestart(state)),
    menuLine('k', 'Kill dev', estimateSeconds(state, 'devStop')),
    menuLine('t', 'Run unit + integration tests', estimateTests(state)),
    menuLine('c', 'Typecheck only', estimateSeconds(state, 'typecheck')),
    menuLine('b', 'Build unpacked (dist/win-unpacked/)', estimateBuild(state)),
    menuLine('l', 'Tail dev log (last 30 lines)', 0),
    menuLine('n', 'Force-rebuild for Node ABI', estimateSeconds(state, 'rebuildNode')),
    menuLine('e', 'Force-rebuild for Electron ABI', estimateSeconds(state, 'rebuildElectron')),
    menuLine('q', 'Quit (leaves dev running)', 0)
  ]
  for (const line of lines) process.stdout.write(line + '\n')
  process.stdout.write(`\n${C.dim}Press a key…${C.reset} `)
}

function menuLine(key, label, estSeconds) {
  const keyPart = `${C.bold}[${key}]${C.reset}`
  const est = estSeconds > 0 ? `${C.dim}~${estSeconds}s${C.reset}` : ''
  return `  ${keyPart}  ${label.padEnd(38)} ${est}`
}

function estimateStart(state) {
  const dev = estimateSeconds(state, 'devStart')
  if (isElectronCompatible(state.abi)) return dev
  return dev + estimateSeconds(state, 'rebuildElectron')
}

function estimateRestart(state) {
  if (!isProcessAlive(state.devPid)) return estimateStart(state)
  return estimateSeconds(state, 'devStop') + estimateSeconds(state, 'devStart')
}

function estimateTests(state) {
  const t = estimateSeconds(state, 'testRun')
  if (state.abi === 'node' || state.abi === 'both') return t
  return t + estimateSeconds(state, 'rebuildNode')
}

function estimateBuild(state) {
  const b = estimateSeconds(state, 'buildUnpack')
  if (isElectronCompatible(state.abi)) return b
  return b + estimateSeconds(state, 'rebuildElectron')
}

// ────────────────────────────────────────────────────────────────────
// Main loop (single-keypress menu)
// ────────────────────────────────────────────────────────────────────

async function main() {
  let state = loadState()

  // Always probe ABI on startup — the state file can drift (electron-rebuild
  // sometimes no-ops with exit 0, npm install reverts to prebuild, etc).
  // Probing takes ~1s (one Node + one Electron spawn) and prevents silent
  // dev-startup failures from ABI mismatch.
  process.stdout.write(`${C.dim}Probing current ABI…${C.reset}\n`)
  state.abi = detectABI()
  saveState(state)

  // Use raw mode for single-keypress input. Only available on TTYs.
  const isTTY = process.stdin.isTTY === true
  if (!isTTY) {
    process.stdout.write(`${C.red}Not running in a TTY — single-keypress menu disabled. Re-run in an interactive terminal.${C.reset}\n`)
    process.exit(1)
  }

  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  let busy = false

  process.stdin.on('data', async (key) => {
    if (busy) return
    // Ctrl+C exits
    if (key === '') {
      process.stdout.write(`\n${C.dim}Exiting (dev process${state.devPid ? ` PID ${state.devPid}` : ''} left as-is).${C.reset}\n`)
      cleanup()
      process.exit(0)
    }

    busy = true
    process.stdin.setRawMode(false)
    process.stdout.write(`\n`)

    try {
      switch (key.toLowerCase()) {
        case 's': await actionStartDev(state); break
        case 'r': await actionRestartDev(state); break
        case 'k': await actionStopDev(state); break
        case 't': await actionRunTests(state); break
        case 'c': await actionTypecheck(state); break
        case 'b': await actionBuildUnpack(state); break
        case 'l': await actionTail(state); break
        case 'n': await actionForceABI(state, 'node'); break
        case 'e': await actionForceABI(state, 'electron'); break
        case 'q':
          process.stdout.write(`${C.dim}Quit. Dev process${state.devPid ? ` PID ${state.devPid}` : ''} left as-is.${C.reset}\n`)
          cleanup()
          process.exit(0)
          break
        default:
          // Ignore unknown keys
          break
      }
    } catch (err) {
      process.stdout.write(`${C.red}Action failed: ${err.message}${C.reset}\n`)
    }

    process.stdout.write(`\n${C.dim}Press any key to return to menu…${C.reset}`)
    await new Promise((resolve) => process.stdin.once('data', resolve))
    process.stdin.setRawMode(true)
    busy = false
    render(state)
  })

  function cleanup() {
    try { process.stdin.setRawMode(false) } catch {}
  }

  render(state)
}

main().catch((err) => {
  console.error(`${C.red}Fatal:${C.reset}`, err)
  try { process.stdin.setRawMode(false) } catch {}
  process.exit(1)
})
