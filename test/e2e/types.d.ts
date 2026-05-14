// Test-context type augmentation: Playwright's window.evaluate() callback doesn't
// see the renderer's window augmentation (src/preload/index.d.ts) because it's not
// included in tsconfig.node.json. Re-declare the augmentation here so E2E tests
// can reference window.tokenless with full type safety.

declare global {
  interface Window {
    tokenless: {
      version: string
    }
  }
}

export {}
