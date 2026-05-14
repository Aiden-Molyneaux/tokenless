// Mock accounts for visual development of the AccountSwitcher dropdown.
// Phase 6 replaces with real accounts (per-account CLAUDE_CONFIG_DIR + ANTHROPIC_API_KEY).

export interface MockAccount {
  id: string
  label: string
  email: string
}

export const MOCK_ACCOUNTS: readonly MockAccount[] = [
  { id: 'acc-personal', label: 'Personal', email: 'aidenmolyneaux@hotmail.com' },
  { id: 'acc-work', label: 'Work', email: 'aiden.molyneaux@versaterm.com' }
]
