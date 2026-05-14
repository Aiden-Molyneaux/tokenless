// claude-mock.cjs — stand-in for the claude CLI in CI E2E tests.
// Behavior:
//   - Writes "claude-mock> " prompt on stdin readiness
//   - Reads stdin line by line; for each line, emits a deterministic response
//     prefixed with "[mock-claude] " plus another prompt
//   - Exits cleanly on SIGTERM / SIGINT / stdin close
//
// Invoked by tests via TOKENLESS_CLAUDE_BIN=path/to/claude-mock.cmd

'use strict'

process.stdout.write('claude-mock> ')

const argv = process.argv.slice(2)
// Sanity-check the spawner's args: --session-id <uuid>
const sessionIdIdx = argv.indexOf('--session-id')
const sessionId = sessionIdIdx >= 0 ? argv[sessionIdIdx + 1] : 'unknown'
process.stdout.write(`(session ${sessionId})\r\n`)

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\r')) >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    if (line.trim().length > 0) {
      process.stdout.write(`[mock-claude] received: ${line}\r\n`)
      process.stdout.write('claude-mock> ')
    }
  }
})
process.stdin.on('end', () => process.exit(0))

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
