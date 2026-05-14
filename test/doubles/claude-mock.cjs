// claude-mock.cjs — stand-in for the claude CLI in CI E2E tests.
// Behavior:
//   - Writes "claude-mock> " prompt on stdin readiness
//   - Reads stdin line by line; for each line, emits a deterministic response
//     prefixed with "[mock-claude] " plus another prompt
//   - Exits cleanly on SIGTERM / SIGINT / stdin close
//
// Invoked by tests via TOKENLESS_CLAUDE_BIN=path/to/claude-mock.cmd

'use strict'

// CRASH_MODE: if env TOKENLESS_MOCK_CRASH_AFTER_MS is set, exit with code 1
// after that many milliseconds WITHOUT writing any output. This keeps
// sawGracefulPrompt=false in lifecycle so onCrashed fires correctly.
// Crash-mode is exclusive of normal-mode behavior — used by Phase 4C
// cc-crash E2E test. All normal-mode logic is in the else branch below.
if (process.env.TOKENLESS_MOCK_CRASH_AFTER_MS) {
  const ms = parseInt(process.env.TOKENLESS_MOCK_CRASH_AFTER_MS, 10)
  setTimeout(() => process.exit(1), ms)
} else {

process.stdout.write('claude-mock> ')

const argv = process.argv.slice(2)
// Sanity-check the spawner's args: --session-id <uuid>
const sessionIdIdx = argv.indexOf('--session-id')
const sessionId = sessionIdIdx >= 0 ? argv[sessionIdIdx + 1] : 'unknown'
process.stdout.write(`(session ${sessionId})\r\n`)

let buf = ''
let receivedCount = 0
let tokenCount = 0
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\r')) >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    if (line.trim().length > 0) {
      receivedCount++
      tokenCount += Math.floor(line.length / 4) + 10
      // Tool call every 3rd line
      if (receivedCount % 3 === 0) {
        process.stdout.write(`tool: Read(/example/file/${receivedCount}.ts)\r\n`)
      }
      process.stdout.write(`[mock-claude] received: ${line}\r\n`)
      process.stdout.write(`tokens: ${tokenCount}/200000\r\n`)
      process.stdout.write('claude-mock> ')
    }
  }
})
process.stdin.on('end', () => process.exit(0))

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

} // end else (normal mode)
