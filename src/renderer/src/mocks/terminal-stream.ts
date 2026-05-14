// Mock ANSI-colored terminal output for the TerminalPane component.
// Phase 4 replaces this with real PTY output from a spawned claude subprocess.
//
// Each \r\n is a line. ANSI escape codes:
//   \x1b[36m = cyan, \x1b[33m = yellow, \x1b[32m = green, \x1b[2m = dim,
//   \x1b[0m = reset, \x1b[1m = bold.

export const MOCK_TERMINAL_STREAM: readonly string[] = [
  '\x1b[2m╭─────────────────────────────────────────────╮\x1b[0m',
  '\x1b[2m│\x1b[0m  \x1b[1mClaude Code v2.1.141\x1b[0m                       \x1b[2m│\x1b[0m',
  '\x1b[2m│\x1b[0m  \x1b[36mOpus 4.7\x1b[0m \x1b[2m·\x1b[0m Claude Max                      \x1b[2m│\x1b[0m',
  '\x1b[2m╰─────────────────────────────────────────────╯\x1b[0m',
  '',
  '\x1b[36m>\x1b[0m Refactor src/auth/middleware.ts',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mRead(src/auth/middleware.ts)\x1b[0m',
  '\x1b[2m  ⎿  read 84 lines\x1b[0m',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mGlob(**/middleware/*.test.ts)\x1b[0m',
  '\x1b[2m  ⎿  found 3 files\x1b[0m',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mRead(src/auth/__tests__/middleware.test.ts)\x1b[0m',
  '\x1b[2m  ⎿  read 142 lines\x1b[0m',
  '',
  '\x1b[32mClaude\x1b[0m: I see the nested conditional pattern in lines 31-54.',
  'The refresh-token-expired path is implicit in the success branch.',
  '',
  'Let me flatten the conditional structure and surface the edge case.',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mEdit(src/auth/middleware.ts)\x1b[0m',
  '\x1b[2m  ⎿  updated 28 lines\x1b[0m',
  '',
  '\x1b[32mClaude\x1b[0m: Done. Key changes:',
  '',
  '  1. Inverted the access-token guard to early-return on invalid tokens.',
  '  2. Added explicit refresh-token-expiry check that short-circuits with',
  '     a 401 before any downstream API call.',
  '  3. Extracted token-validation logic into a pure helper for testability.',
  '',
  '\x1b[2m  Saved 1,200 tokens vs ungeared prompt.\x1b[0m',
  '\x1b[2m  Context used: 42% of 200k\x1b[0m'
]
