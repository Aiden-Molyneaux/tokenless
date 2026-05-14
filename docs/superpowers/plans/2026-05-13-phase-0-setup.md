# TokenLess v1 — Phase 0: Project Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold TokenLess from an empty repo into a green-CI Electron app with all dev tooling wired up. End state: `npm run dev` opens a window showing "TokenLess — Phase 0 stub", `npm run test:run` passes a unit smoke test, `npm run test:e2e` passes an E2E smoke test, and a GitHub Actions workflow runs the full suite on Windows. No application logic yet — Phase 1 builds on this foundation.

**Architecture:** Manual electron-vite setup (no scaffold boilerplate) so every file is intentional and the developer understands what each one does. Three-target build (main, preload, renderer) via electron-vite. React 18 + TypeScript on the renderer; Node + TypeScript on main and preload. Vitest for unit/integration, Playwright for E2E (driving the built Electron app). Windows-only CI to match the Windows-first scope.

**Tech Stack:** Electron 32, electron-vite 2, React 18, TypeScript 5, Vite 5, Vitest 2, Playwright 1.45+, xterm.js 5, @anthropic-ai/sdk, chokidar, zod. (Native modules `better-sqlite3` and `node-pty` deferred to the phases that first use them — Phase 3 and Phase 4 respectively — so Phase 0 doesn't need MSBuild toolchain on every developer machine.)

---

## Scope

Phase 0 only. Subsequent phases (Phase 1 — Integration spike + Logger; Phase 2 — UI prototype with mocks; …; Phase 8 — Release) each get their own plan, written after the prior phase ships.

## Prerequisites

- **Node.js 20 LTS** installed (`node --version` returns `v20.x` or higher)
- **npm 10+** (ships with Node 20)
- **Git** installed and configured (already verified — spec commit landed)
- **Working directory:** `C:\Users\aiden.molyneaux\projects\tokenless\` (repo already initialized with the spec committed at `bd6c693`)

## File structure

Files created/modified in Phase 0 (paths relative to project root):

```
tokenless/
├── package.json                                    [CREATE] npm manifest with scripts
├── package-lock.json                               [CREATE — auto]
├── tsconfig.json                                   [CREATE] root tsconfig (references the two below)
├── tsconfig.node.json                              [CREATE] tsconfig for main + preload + shared (Node target)
├── tsconfig.web.json                               [CREATE] tsconfig for renderer (DOM target)
├── electron.vite.config.ts                         [CREATE] electron-vite build config
├── vitest.config.ts                                [CREATE] Vitest config
├── playwright.config.ts                            [CREATE] Playwright config
├── electron-builder.yml                            [CREATE] electron-builder packaging config
├── .gitignore                                      [MODIFY] add Phase 0 entries (out/, dist/)
├── CLAUDE.md                                       [CREATE] cornerstone directives + project context
├── docs/
│   ├── decisions.md                                [CREATE] seeded with brainstorm decisions
│   ├── observability.md                            [CREATE] category-by-category guide (stub)
│   └── test-scenarios.md                           [CREATE] manual scenarios (stub)
├── .github/
│   └── workflows/
│       └── ci.yml                                  [CREATE] Windows CI workflow
├── src/
│   ├── main/
│   │   ├── index.ts                                [CREATE] main process entry — opens window
│   │   └── __tests__/
│   │       └── smoke.unit.test.ts                  [CREATE] proves Vitest works
│   ├── preload/
│   │   ├── index.ts                                [CREATE] minimal preload (typed IPC stub)
│   │   └── index.d.ts                              [CREATE] preload typings exposed to renderer
│   ├── renderer/
│   │   ├── index.html                              [CREATE] HTML entry for Vite
│   │   └── src/
│   │       ├── env.d.ts                            [CREATE] Vite env types
│   │       ├── main.tsx                            [CREATE] React entry
│   │       ├── App.tsx                             [CREATE] notebook-themed Hello stub
│   │       └── styles.css                          [CREATE] theme tokens — cream/orange/blue
│   └── shared/
│       └── ipc.ts                                  [CREATE] placeholder typed IPC contract
└── test/
    └── e2e/
        └── smoke.e2e.test.ts                       [CREATE] launches Electron, asserts window opens
```

**Responsibilities at a glance:**

- `src/main/index.ts` — minimal Electron main: app lifecycle, single `BrowserWindow`, loads renderer URL or built file. No business logic. Phase 1 starts adding the Logger here.
- `src/preload/index.ts` — runs in the renderer's context with limited Node access. Phase 0 just exposes a `tokenless: { version: string }` stub through `contextBridge` to prove the IPC pipe works.
- `src/renderer/src/App.tsx` — Phase 0 renders a centered "TokenLess — Phase 0 stub" with theme tokens. No real UI yet.
- `src/shared/ipc.ts` — placeholder for typed channel definitions. Phase 1 fills it.
- `CLAUDE.md` — cornerstone directives (error handling protocol from spec §6.7, testing protocol from spec §8.9) plus a project orientation section so future Claude Code instances know what they're working in.
- `docs/decisions.md` — ADR-style log seeded with the decisions from the brainstorm appendix.

## Tasks

---

### Task 1: Initialize package.json

**Files:**
- Create: `package.json`

- [ ] **Step 1: Initialize an npm project**

Run from project root:

```bash
npm init -y
```

Expected: a default `package.json` is created.

- [ ] **Step 2: Replace `package.json` with the project-specific manifest**

Overwrite with:

```json
{
  "name": "tokenless",
  "version": "0.0.1",
  "private": true,
  "description": "Token-efficient prompt gearing for Claude",
  "author": "Aiden Molyneaux",
  "license": "UNLICENSED",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:unpack": "electron-vite build && electron-builder --dir",
    "build:win": "electron-vite build && electron-builder --win",
    "preview": "electron-vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(phase-0): initialize package.json"
```

---

### Task 2: Install core runtime dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install Electron and React**

```bash
npm install electron@^32 react@^18 react-dom@^18
```

Expected: `package.json` gets `dependencies`; `package-lock.json` is created.

- [ ] **Step 2: Verify**

```bash
node -e "const p = require('./package.json'); console.log(p.dependencies)"
```

Expected output includes `electron`, `react`, `react-dom`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-0): add electron + react runtime deps"
```

---

### Task 3: Install dev dependencies (build + types)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install build/type/dev tooling**

```bash
npm install -D electron-vite@^2 vite@^5 @vitejs/plugin-react@^4 typescript@^5 @types/react@^18 @types/react-dom@^18 @types/node@^20 electron-builder@^25
```

- [ ] **Step 2: Verify**

```bash
node -e "const p = require('./package.json'); console.log(Object.keys(p.devDependencies))"
```

Expected output includes `electron-vite`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `electron-builder`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-0): add electron-vite + typescript + react types"
```

---

### Task 4: Install test dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install Vitest and Playwright**

```bash
npm install -D vitest@^2 @vitest/ui@^2 playwright@^1.45 @playwright/test@^1.45
```

- [ ] **Step 2: Install Playwright browsers (skipped — only Electron is driven for E2E)**

We do NOT need `npx playwright install` for E2E against Electron — Playwright drives the built app binary directly. We will install browsers in CI only.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-0): add vitest + playwright"
```

---

### Task 5: Install pure-JS runtime libraries

These are pure JavaScript libraries that will be imported across multiple phases. Installing them in Phase 0 avoids npm install churn later. Native modules (`better-sqlite3`, `node-pty`) are intentionally deferred to the phases that first use them.

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install pure-JS runtime libs**

```bash
npm install xterm@^5 xterm-addon-fit@^0.8 @anthropic-ai/sdk@^0.30 chokidar@^3 zod@^3
```

- [ ] **Step 2: Verify**

```bash
node -e "const p = require('./package.json'); console.log(p.dependencies)"
```

Expected: dependencies includes `xterm`, `xterm-addon-fit`, `@anthropic-ai/sdk`, `chokidar`, `zod`, plus the earlier `electron`, `react`, `react-dom`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-0): add pure-JS runtime libs (xterm, anthropic-sdk, chokidar, zod)"
```

---

### Task 6: Create TypeScript configuration

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`

- [ ] **Step 1: Create root tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 2: Create tsconfig.node.json (main + preload + shared)**

```json
{
  "include": [
    "electron.vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "test/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

- [ ] **Step 3: Create tsconfig.web.json (renderer)**

```json
{
  "include": [
    "src/renderer/src/**/*",
    "src/preload/index.d.ts",
    "src/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

- [ ] **Step 4: Verify typecheck command works (will succeed because no source files yet — `--noEmit` is a config-only check)**

```bash
npm run typecheck
```

Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json
git commit -m "chore(phase-0): add typescript configs (node + web)"
```

---

### Task 7: Create electron-vite configuration

**Files:**
- Create: `electron.vite.config.ts`

- [ ] **Step 1: Write the config**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    }
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "chore(phase-0): add electron-vite config"
```

---

### Task 8: Create main process entry

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/main
```

- [ ] **Step 2: Write the main entry**

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'TokenLess',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(phase-0): minimal main process opening a window"
```

---

### Task 9: Create preload script

**Files:**
- Create: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/preload
```

- [ ] **Step 2: Write the preload (stub — Phase 1 expands this)**

```typescript
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
  // @ts-expect-error context isolation off, attach to window
  window.tokenless = api
}
```

- [ ] **Step 3: Write the type declarations exposed to the renderer**

```typescript
declare global {
  interface Window {
    tokenless: {
      version: string
    }
  }
}

export {}
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/
git commit -m "feat(phase-0): minimal preload exposing tokenless.version"
```

---

### Task 10: Create renderer HTML and entry

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/env.d.ts`
- Create: `src/renderer/src/main.tsx`

- [ ] **Step 1: Create the directories**

```bash
mkdir -p src/renderer/src
```

- [ ] **Step 2: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TokenLess</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write env.d.ts**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 4: Write main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/
git commit -m "feat(phase-0): renderer HTML + react bootstrap"
```

---

### Task 11: Create App.tsx with notebook-themed Hello stub

**Files:**
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles.css`

- [ ] **Step 1: Write App.tsx**

```typescript
export default function App(): JSX.Element {
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">TokenLess</h1>
        <p className="app__subtitle">Phase 0 stub — scaffold verified</p>
      </header>
      <section className="app__body">
        <p>
          The Electron shell, the renderer, the preload, and the IPC handshake are all alive.
          Phase 1 lands the Logger and the integration spike on top of this.
        </p>
        <p className="app__version">
          preload.version = <code>{window.tokenless?.version ?? 'not loaded'}</code>
        </p>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Write styles.css with theme tokens (cream/orange/blue, serif)**

```css
:root {
  --tl-bg: #FAF7F2;
  --tl-fg: #2A2624;
  --tl-orange: #D97757;
  --tl-blue: #4A6FA5;
  --tl-rule: rgba(42, 38, 36, 0.12);
  --tl-mute: rgba(42, 38, 36, 0.55);
  --tl-font-serif: 'Source Serif Pro', 'Tiempos Text', Georgia, serif;
  --tl-font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --tl-font-mono: 'JetBrains Mono', Consolas, monospace;
}

* { box-sizing: border-box; }

html, body, #root { height: 100%; margin: 0; padding: 0; }

body {
  background: var(--tl-bg);
  color: var(--tl-fg);
  font-family: var(--tl-font-sans);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 64px 32px;
}

.app__header {
  border-bottom: 1px solid var(--tl-rule);
  padding-bottom: 24px;
  margin-bottom: 32px;
}

.app__title {
  font-family: var(--tl-font-serif);
  font-size: 42px;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
  color: var(--tl-orange);
}

.app__subtitle {
  margin: 0;
  color: var(--tl-mute);
  font-size: 14px;
}

.app__body {
  font-family: var(--tl-font-serif);
  font-size: 17px;
}

.app__body p { margin: 0 0 16px; }

.app__version {
  font-family: var(--tl-font-sans);
  font-size: 13px;
  color: var(--tl-mute);
}

.app__version code {
  font-family: var(--tl-font-mono);
  color: var(--tl-blue);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat(phase-0): hello stub with notebook theme tokens"
```

---

### Task 12: Create shared IPC placeholder

**Files:**
- Create: `src/shared/ipc.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/shared
```

- [ ] **Step 2: Write the placeholder**

```typescript
// Typed IPC contract between main and renderer.
// Phase 1 populates this with the Logger bridge channels.
// Subsequent phases add cc:*, gear:*, projects:*, etc.

export type IpcChannelName = 'phase-0:ping'

export type IpcRequest = {
  'phase-0:ping': void
}

export type IpcResponse = {
  'phase-0:ping': { ok: true; data: { ts: number } }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "feat(phase-0): shared ipc placeholder"
```

---

### Task 13: Configure Vitest

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write the config**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.unit.test.ts',
      'src/**/__tests__/**/*.unit.test.tsx',
      'src/**/__tests__/**/*.integration.test.ts',
      'src/**/__tests__/**/*.integration.test.tsx'
    ],
    exclude: ['node_modules', 'out', 'dist', 'test/e2e/**'],
    reporters: ['default']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "chore(phase-0): vitest config"
```

---

### Task 14: Add unit smoke test + verify pass

**Files:**
- Create: `src/main/__tests__/smoke.unit.test.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p src/main/__tests__
```

- [ ] **Step 2: Write the test**

```typescript
import { describe, expect, it } from 'vitest'

describe('Phase 0 smoke', () => {
  it('vitest is wired up and can run a test', () => {
    expect(1 + 1).toBe(2)
  })

  it('typescript strict mode allows typed arithmetic', () => {
    const a: number = 2
    const b: number = 3
    expect(a + b).toBe(5)
  })
})
```

- [ ] **Step 3: Run the test**

```bash
npm run test:run
```

Expected output (last lines):

```
 ✓ src/main/__tests__/smoke.unit.test.ts (2)

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

If failed: check that Vitest config's `include` glob matches the test path. The glob `src/**/__tests__/**/*.unit.test.ts` should match `src/main/__tests__/smoke.unit.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/main/__tests__/smoke.unit.test.ts
git commit -m "test(phase-0): unit smoke test verifies vitest works"
```

---

### Task 15: Configure Playwright

**Files:**
- Create: `playwright.config.ts`

- [ ] **Step 1: Write the config**

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.test.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    trace: 'retain-on-failure'
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add playwright.config.ts
git commit -m "chore(phase-0): playwright config"
```

---

### Task 16: Add E2E smoke test + verify pass

**Files:**
- Create: `test/e2e/smoke.e2e.test.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p test/e2e
```

- [ ] **Step 2: Write the test**

```typescript
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'node:path'

let app: ElectronApplication

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
})

test.afterAll(async () => {
  await app.close()
})

test('window opens with the TokenLess title', async () => {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window).toHaveTitle('TokenLess')
})

test('renderer mounts and shows the Phase 0 stub', async () => {
  const window = await app.firstWindow()
  const title = window.locator('.app__title')
  await expect(title).toHaveText('TokenLess')
  const subtitle = window.locator('.app__subtitle')
  await expect(subtitle).toContainText('Phase 0 stub')
})

test('preload exposes window.tokenless.version', async () => {
  const window = await app.firstWindow()
  const version = await window.evaluate(() => window.tokenless?.version)
  expect(version).toBe('0.0.1')
})
```

- [ ] **Step 3: Build the app (E2E runs against built output)**

```bash
npm run build
```

Expected: `electron-vite build` completes with no errors. Output appears in `out/`.

- [ ] **Step 4: Run the E2E test**

```bash
npm run test:e2e
```

Expected output (last lines):

```
  ✓  1 [chromium] › smoke.e2e.test.ts:N:N › window opens with the TokenLess title
  ✓  2 [chromium] › smoke.e2e.test.ts:N:N › renderer mounts and shows the Phase 0 stub
  ✓  3 [chromium] › smoke.e2e.test.ts:N:N › preload exposes window.tokenless.version

  3 passed (Xs)
```

If failed:
- "Cannot find module 'out/main/index.js'" → `npm run build` first
- Title mismatch → check `src/main/index.ts` BrowserWindow `title` option
- Preload version undefined → check that `contextBridge.exposeInMainWorld('tokenless', api)` runs and the renderer URL loads the built preload (it does in production builds; in dev, electron-vite injects it via `ELECTRON_RENDERER_URL`)

- [ ] **Step 5: Commit**

```bash
git add test/e2e/smoke.e2e.test.ts
git commit -m "test(phase-0): e2e smoke launches Electron and asserts the stub renders"
```

---

### Task 17: Create CLAUDE.md with cornerstone directives

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md**

```markdown
# CLAUDE.md — TokenLess

This file is the contract every Claude Code session in this repo respects.

## What TokenLess is

TokenLess is a Windows-first Electron desktop application that sits between the user and Claude. It rewrites prompts via Haiku (the "gearing" engine) to reduce token waste — primarily on the output side via response-shaping language — and hosts Claude Code in-app via a PTY-backed embedded terminal. See `docs/superpowers/specs/` for the full design spec.

## Stack

Electron 32 · electron-vite 2 · React 18 · TypeScript 5 · Vite 5 · Vitest 2 · Playwright 1.45 · xterm.js 5 · @anthropic-ai/sdk · chokidar · zod. Native modules (better-sqlite3 for SQLite, node-pty for PTY) are added in the phases that first need them.

## Directory layout

```
src/main/         Electron main process — owns DB, PTY subprocesses, Anthropic SDK, Logger
src/preload/      Preload scripts — narrow typed surface to renderer via contextBridge
src/renderer/src/ React UI — composer, terminal pane, sidebar, Dev Mode panel
src/shared/       Types shared between main, preload, and renderer (notably ipc.ts)
test/e2e/         Playwright + Electron end-to-end tests
docs/             specs/, plans/, decisions.md, observability.md, test-scenarios.md
spikes/           Throwaway integration probes (added Phase 1)
```

## Commands

- `npm run dev` — start the app in development with HMR
- `npm run build` — produce a built app in `out/`
- `npm run test:run` — run all unit + integration tests once
- `npm test` — run unit + integration tests in watch mode
- `npm run test:e2e` — run Playwright E2E tests against the built app
- `npm run typecheck` — strict type-check both main+preload and renderer

## Error handling protocol (cornerstone — DO NOT VIOLATE)

Every new code path that can fail must:

1. Catch the failure as close to the source as possible.
2. Route it through `logger.{severity}(category, event, message, context)` using a meaningful pre-existing category.
3. Provide a user-facing recovery path where applicable (retry, fallback, "open Settings to fix").
4. Add a test verifying the error path emits to the logger correctly.

Adding a new category requires:

- An entry in `src/main/observability/categories.ts` (this file lands in Phase 1).
- A row in `docs/observability.md` documenting when to use it.

Developer Mode is a cornerstone of the project. Do not introduce:

- Silent failures (catch-and-swallow without logging)
- Stray `console.log`, `console.error`, `console.warn` outside the Logger
- Category-less try/catches
- Errors without context — every `logger.error` call must include enough info to reproduce the issue from the log alone (relevant IDs, current state, recent IPC payload, retry counters)

## Testing protocol (cornerstone — DO NOT VIOLATE)

Every new feature must include:

1. **Unit tests** for any pure logic introduced (parsers, builders, estimators, summary logic)
2. **Integration tests** for any new IPC channel, DB query, or module boundary
3. **A scenario entry** in `docs/test-scenarios.md` describing how a human verifies the feature manually
4. **E2E coverage** for any flow that touches the seven critical paths listed in the design spec § 8.6

Tests organize by feature, not by file. Each suite has a top-level `describe` with a one-sentence purpose comment.

Mocks live in `test/doubles/`. Do not create one-off mocks in individual test files when a shared double already covers the boundary.

Recorded Anthropic SDK fixtures live in `test/fixtures/api/` and are committed to git. Regenerate with `npm run fixtures:record` when the gearing system prompt changes — explain the diff in your PR.

CI gates:

- Unit + integration tests must pass on every push.
- E2E must pass on PR and main.
- Don't disable failing tests to land a feature. Either fix the test (if the test is wrong) or fix the feature (if the test is right).

## Code style

- TypeScript strict mode. No `any` without a justifying comment.
- ESM modules throughout (`type: module` in package.json). Use `node:` prefix for built-in imports.
- React function components, no class components.
- Hooks named `useThing()`. Components named `Thing` (PascalCase).
- File names: components `PascalCase.tsx`, everything else `kebab-case.ts`.
- Single responsibility per file. Files over ~300 lines are a signal to split.

## Decision log

When you make a non-trivial design choice (architectural, library, pattern), add an ADR entry to `docs/decisions.md`. Format: date, options considered, choice, reasoning.

## Phase reference

The build is structured in phases. Current phase plans live in `docs/superpowers/plans/`. Read the plan for the phase you're working in. Do not skip ahead — the phase ordering exists to land integration risk early.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(phase-0): add CLAUDE.md with cornerstone directives"
```

---

### Task 18: Seed docs/decisions.md from brainstorm

**Files:**
- Create: `docs/decisions.md`

- [ ] **Step 1: Write decisions.md**

```markdown
# Design Decisions

Architectural Decision Records (ADRs). Append-only — new decisions get new entries; superseded entries get a "Superseded by ADR-N" note rather than being edited.

Format per entry: date · context · options considered · choice · reasoning. Keep entries scannable — a paragraph or two, not a thesis.

---

## ADR-001 (2026-05-13) — Stack: Electron + React + TypeScript

**Context:** Need a desktop app with: filesystem access, ability to spawn `claude` as a subprocess, host an embedded terminal, integrate with the Anthropic API. Solo developer, React experience.

**Options:**
- Tauri + React (smaller binary, Rust shell)
- Electron + React (larger binary, Node shell)
- Native (Win32 / WPF / .NET)
- Web app (no local subprocess capability)

**Choice:** Electron + React + TypeScript.

**Reasoning:** PTY + xterm.js + spawned subprocess is a paved path on Electron (VS Code does exactly this). Tons of examples; minimal Rust learning curve. Bundle size and RAM are acceptable trade-offs for a tool used daily on a developer machine.

## ADR-002 (2026-05-13) — Windows-first

**Context:** Author's primary platform.

**Choice:** Ship Windows installer first. Mac and Linux builds deferred until justified by demand.

**Reasoning:** Single-platform reduces test surface, CI complexity, and code-signing setup. Cross-platform Electron is straightforward to add later.

## ADR-003 (2026-05-13) — Notebook-vertical layout

**Context:** Where does the composer go relative to the embedded terminal?

**Options considered:** A) Composer top + terminal bottom (notebook vertical), B) Composer left + terminal right (IDE side-by-side), C) Three-column workspace.

**Choice:** A — composer on top, terminal below, narrow conversation sidebar on the left.

**Reasoning:** Workflow is "write, gear, send, watch" — naturally vertical. Matches the "notebook" aesthetic intent. B preserved as a future layout toggle (v1.4 backlog).

## ADR-004 (2026-05-13) — Inline 2-pane gearing review

**Context:** When the user clicks "Gear," how should the review surface?

**Options considered:** A) Inline expand within the composer area, B) Modal overlay, C) Right-side panel.

**Choice:** A — composer becomes a 2-pane (original read-only · geared editable) inline.

**Reasoning:** No screen takeover, terminal stays visible, fits notebook flow.

## ADR-005 (2026-05-13) — Conversations: persistent + resumable

**Context:** What's the lifecycle of a Conversation?

**Options considered:** A) Ephemeral (lives only while `claude` process is alive), B) Persistent + resumable via `claude --resume`, C) Persistent archive only (no resume).

**Choice:** B.

**Reasoning:** Claude Code CLI supports `--resume <session-id>` natively; user-facing value of "jump back into last week's thread" is significant; engineering cost moderate (capture session ID, store in DB, spawn with --resume).

## ADR-006 (2026-05-13) — Gearing engine: single universal system prompt

**Context:** How does Haiku know how to rewrite a prompt?

**Options considered:** A) Single universal Haiku system prompt parameterized by user configs, B) Per-config template library (N templates for each config combination), C) Hybrid — universal prompt + intent classifier.

**Choice:** A for v1; revisit C in a later cycle when usage data tells us which intents matter.

**Reasoning:** YAGNI on templates — we don't yet know what patterns matter. One prompt to iterate on is easier than 12+ templates to keep aligned.

## ADR-007 (2026-05-13) — Critique bundled with every Gear call

**Context:** Should pre-flight critique be auto-run or manual?

**Choice:** Bundled into every Gear call.

**Reasoning:** ~50-100 extra Haiku tokens per gear; negligible cost; uniform predictable behavior across models; user can ignore the flags.

## ADR-008 (2026-05-13) — Token-cost focus: output > input

**Context:** Which side of the token bill should gearing primarily attack?

**Choice:** Output-side (response shaping) first; input-side (prompt shrinking) second.

**Reasoning:** Output tokens are ~5× more expensive than input across Anthropic's pricing, and Claude tends to ramble more than the user does. Adding "respond in ≤200 words, no preamble" costs ~12 tokens and saves hundreds.

## ADR-009 (2026-05-13) — Build sequencing: UI-first prototype with Phase 1 integration spike

**Context:** Three sequencing approaches were considered for the build: A) Vertical slice first, B) Foundation-up / layered, C) UI-first prototype.

**Choice:** C with a Phase 1 integration spike to de-risk PTY/CC/xterm assumptions before the UI locks in patterns dependent on them.

**Reasoning:** Author has React experience and cares about UX feel. UI-first allows iterating on aesthetics without backend complexity. The Phase 1 spike mitigates the back-loaded integration risk.

## ADR-010 (2026-05-13) — Observability cornerstone: unified Logger + Developer Mode

**Context:** How should errors and operational events be surfaced?

**Choice:** Unified `Logger` service in `main/observability/` is the spine; every error path routes through it. Developer Mode (toggleable) renders a sortable JSON table of log records; supports AI-powered error analysis via Haiku.

**Reasoning:** Adding observability later is always a months-long retrofit. Cornerstone status (enforced via CLAUDE.md) prevents drift. JSON+sortable+filterable beats `console.log` scattered across the codebase.

## ADR-011 (2026-05-13) — Testing cornerstone: Vitest + Playwright + recorded fixtures

**Context:** What does the test pyramid look like?

**Choice:** Three layers — unit (Vitest), integration (Vitest + test doubles + in-memory SQLite), E2E (Playwright + Electron). Anthropic SDK calls replaced with recorded JSON fixtures, committed to git, regeneratable.

**Reasoning:** Test pyramid covers the right failure surface at the right cost. Recorded fixtures make gearing logic deterministic without burning tokens or requiring API keys in CI.

## ADR-012 (2026-05-13) — Conversation backup: branch-from-turn, not point-in-time restore

**Context:** When a prompt goes sideways, how does the user recover?

**Choice:** "Branch from this turn" — create a new conversation seeded with a Haiku-summarized primer of turns up to the chosen point.

**Reasoning:** Claude Code's `--resume` only restores to the *latest* state of a session; arbitrary-turn restoration isn't possible. Branch-from-turn gives ~90% of the value (new thread with the back-story) without pretending to do something the CLI doesn't support.

## ADR-013 (2026-05-13) — Draft auto-save: debounced 750ms per-conversation row

**Context:** Don't lose typed prompts on close/crash.

**Choice:** Composer text auto-saves to a `drafts` table every 750ms of inactivity, keyed by conversation. Cleared on Send.

**Reasoning:** Standard autosave UX latency; minimal DB churn; survives crashes and accidental closes.

## ADR-014 (2026-05-13) — Summary refresh: after every completed assistant turn (background)

**Context:** How fresh does the rolling Haiku summary need to be?

**Choice:** Refresh after every completed assistant turn, in the background, non-blocking.

**Reasoning:** Cost is trivial; quality benefit is real (next Gear call sees an up-to-date summary instead of N-1-turns-stale).
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-0): seed decisions.md with 14 ADRs from brainstorm"
```

---

### Task 19: Create observability.md and test-scenarios.md stubs

**Files:**
- Create: `docs/observability.md`
- Create: `docs/test-scenarios.md`

- [ ] **Step 1: Write observability.md**

```markdown
# Observability Category Guide

The full Logger service lives at `src/main/observability/logger.ts` (added in Phase 1). This document defines what each category means and when to use it. Adding a new category requires both an entry here and an enum addition in `src/main/observability/categories.ts`.

## Categories

| Category | Use for |
|---|---|
| `cc` | Claude Code subprocess lifecycle, output stream parsing, session ID capture, resume mechanics |
| `pty` | node-pty layer specifically — PTY spawn, write, resize, exit. Lower-level than `cc`. |
| `api` | Anthropic SDK calls — request, response, retry, error handling, malformed JSON |
| `db` | SQLite operations — queries, migrations, lock contention, constraint violations |
| `ipc` | IPC channel handlers — boundary between main and renderer |
| `ui` | Renderer-originated events — React errors, component lifecycle issues |
| `skill` | Skill discovery and watching — `~/.claude/skills/`, plugin dirs, project-local |
| `auth` | Account authentication, `claude login` wrapping, account switching |
| `gearing` | Gearing engine specifically — prompt building, response parsing |
| `fs` | Filesystem operations not covered by `skill` — CLAUDE.md reading, log file rotation |
| `observability` | Self-referential — Logger startup, file sink errors, ring buffer overflow |

## Severities

- `debug` — verbose flow tracing. Only written when Developer Mode is on.
- `info` — significant lifecycle events: session spawned, gear completed, account switched.
- `warn` — recoverable issues: retry succeeded, fallback engaged.
- `error` — operation failed; user impact possible; needs visibility.
- `fatal` — process can't continue cleanly; heading for crash or forced shutdown.

## When to add a new category

Don't unless the new category meaningfully overlaps with no existing one. Categories are a fixed enum so the Dev Mode UI's filters stay clean. If a new dependency throws in a way that doesn't fit, ask: does this map to `fs`, `api`, `db`, etc.? Only add a new category as a last resort.

Adding one requires:

1. Append to the enum in `src/main/observability/categories.ts`.
2. Add a row to the table in this file.
3. Update any switch statements that depend on the enum's exhaustiveness.
```

- [ ] **Step 2: Write test-scenarios.md**

```markdown
# Manual Test Scenarios

Scenarios a human should exercise before any release. Each scenario lists preconditions, steps, and expected outcomes. Every feature PR adds or updates at least one scenario.

Format:

```
## Scenario: <name>

**Preconditions:** <state of the system before>

**Steps:**
1. ...
2. ...

**Expected:** <observable outcome>
```

---

## Scenario: Phase 0 — Fresh launch

**Preconditions:** Fresh `npm install` complete; no `out/` directory yet.

**Steps:**
1. Run `npm run build`
2. Run `npm run preview` (or `npm run dev`)
3. Observe the window that opens

**Expected:**
- Window title is "TokenLess"
- Window displays "TokenLess — Phase 0 stub" header
- A version line shows `preload.version = 0.0.1`
```

- [ ] **Step 3: Commit**

```bash
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-0): add observability.md and test-scenarios.md stubs"
```

---

### Task 20: Add electron-builder config

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: Write the config**

```yaml
appId: com.aidenmolyneaux.tokenless
productName: TokenLess
directories:
  buildResources: build
  output: release
files:
  - "!**/.vscode/*"
  - "!src/*"
  - "!electron.vite.config.{js,ts,mjs,cjs}"
  - "!tsconfig.*.json"
  - "!docs/**/*"
  - "!test/**/*"
  - "!spikes/**/*"
asarUnpack:
  - resources/**
win:
  executableName: TokenLess
  artifactName: TokenLess-${version}-setup.${ext}
  target:
    - target: nsis
      arch:
        - x64
nsis:
  artifactName: TokenLess-${version}-setup.${ext}
  shortcutName: TokenLess
  uninstallDisplayName: TokenLess
  createDesktopShortcut: always
publish: null
```

- [ ] **Step 2: Commit**

```bash
git add electron-builder.yml
git commit -m "chore(phase-0): electron-builder config for windows nsis installer"
```

---

### Task 21: Update .gitignore for Phase 0 outputs

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append build/cache directories**

Append the following lines to `.gitignore` (keep existing content):

```
# electron-vite build output
out/

# electron-builder output
release/

# vite cache
.vite/

# playwright test artifacts
test-results/
playwright-report/
playwright/.cache/
```

The final `.gitignore` should contain everything from before PLUS these new sections. The existing `.gitignore` already has `node_modules/`, `dist/`, `build/`, `.DS_Store`, etc.

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore(phase-0): gitignore build + test artifact dirs"
```

---

### Task 22: Add GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create directories**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-and-integration:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Type-check
        run: npm run typecheck
      - name: Unit + Integration tests
        run: npm run test:run

  e2e:
    runs-on: windows-latest
    needs: unit-and-integration
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Build app
        run: npm run build
      - name: Playwright browsers (none needed for Electron-only E2E)
        run: echo "Skipping browser install — driving Electron directly"
      - name: E2E tests
        run: npm run test:e2e
      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(phase-0): windows-latest workflow for type-check + unit + e2e"
```

---

### Task 23: Phase 0 verification + tag

**Files:** none — verification only.

- [ ] **Step 1: Verify all commands work clean**

Run each in sequence:

```bash
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

Each should exit 0. Total wall-time: < 90 seconds.

- [ ] **Step 2: Verify dev mode runs**

```bash
npm run dev
```

Expected: Electron window opens showing the Phase 0 stub. Close the window (or Ctrl+C in the terminal) to exit.

- [ ] **Step 3: Verify git is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 4: Tag the Phase 0 commit**

```bash
git tag -a v0.1.0-phase-0 -m "Phase 0 complete — project scaffolded, CI green"
```

- [ ] **Step 5: Print summary**

```bash
git log --oneline
git tag --list
```

Expected: a tag `v0.1.0-phase-0` exists at the latest commit. Commit history shows ~22 small commits with descriptive messages.

---

## Phase 0 — Exit criteria

Phase 0 is complete when ALL of the following are true:

- `npm run typecheck` exits 0
- `npm run test:run` passes the unit smoke test
- `npm run build` produces an `out/` directory with main + preload + renderer bundles
- `npm run test:e2e` passes all three E2E smoke assertions (title, stub, preload version)
- `npm run dev` opens a window showing the Phase 0 stub
- A GitHub Actions workflow file exists at `.github/workflows/ci.yml` and is syntactically valid
- `CLAUDE.md` contains the error handling and testing protocol cornerstones
- `docs/decisions.md` contains all 14 ADRs from the brainstorm
- A `v0.1.0-phase-0` git tag points at the final Phase 0 commit

Once exit criteria are met, return to write the Phase 1 plan.

---

## Self-review (writing-plans skill)

### Spec coverage

Mapping Phase 0 work to spec sections:
- ✅ §1 Architecture — directory layout (`src/main`, `src/preload`, `src/renderer/src`, `src/shared`) established
- ✅ §6 Observability — CLAUDE.md directive in place; Logger implementation deferred to Phase 1 plan
- ✅ §8 Testing — Vitest + Playwright wired; CLAUDE.md directive in place; one smoke test of each layer
- ✅ §9 Build sequencing Phase 0 — every bullet point covered (init repo, scaffold, deps, CLAUDE.md, docs, CI, initial commit)
- Subsequent spec sections (§2 components, §3 data model, §4 data flow, §5 integrations, §7 failure modes) addressed in Phase 1+ plans, as designed.

### Placeholder scan

No "TBD", "TODO", "implement later", or "similar to Task N" patterns. Every step includes the actual code/command/expected output.

### Type consistency

- `IpcChannelName` defined in Task 12 as a string literal type. Phase 1 plan will extend this — no current references elsewhere in Phase 0.
- `window.tokenless.version` shape: `{ version: string }` — declared in `src/preload/index.d.ts` (Task 9), referenced in `App.tsx` (Task 11), asserted in E2E test (Task 16). Consistent.
- Aliases `@shared/*` and `@renderer/*`: defined in three places (vite config, tsconfig.node.json, tsconfig.web.json, vitest.config.ts). All resolve identically to `src/shared/*` and `src/renderer/src/*`. Consistent.
- App.tsx returns `JSX.Element` — typing is compatible with `react@^18`'s JSX runtime.

### Scope check

22 tasks, each task ~2-5 minute steps. Total Phase 0 time estimate: 4-8 hours of focused work for someone unfamiliar with this stack; 2-3 hours for someone fluent in Electron + Vite. Appropriately scoped for a single plan.

### Notes for the executor

- Native modules (`better-sqlite3`, `node-pty`) are deliberately NOT installed in Phase 0. They require MSBuild toolchain on Windows. Their installation is part of Phase 3 and Phase 4 respectively.
- If `npm install` for any dep fails, check Node.js version: `node --version` should report `v20.x` or higher.
- If `electron-vite build` fails with a TypeScript error in `electron.vite.config.ts`, ensure `tsconfig.node.json` includes `electron.vite.config.ts` in its `include` glob (it does in Task 6).
- The pre-commit warning about repo location outside `C:/work/` or `C:/personal/` (from the gitconfig hook) is expected. The local git identity was already configured in the design-spec commit step; new commits should land without identity errors.

---

*End of Phase 0 plan.*
