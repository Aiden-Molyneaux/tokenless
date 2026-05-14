# cc-pty Integration Spike

Throwaway experiments to verify Claude Code (the `claude` CLI) can be driven via node-pty on Windows with all the behaviors Phase 4 needs.

## Prerequisites

- `claude` CLI installed and logged in (`claude --version` should work)
- node-pty installed and rebuilt for Electron (Phase 1A Task 3)
- `tsx` available (Phase 1A Task 3)

## How to run

Each script is independent. From the project root:

```bash
npx tsx spikes/cc-pty/spike-spawn.ts
npx tsx spikes/cc-pty/spike-resume.ts
npx tsx spikes/cc-pty/spike-model.ts
npx tsx spikes/cc-pty/spike-config-dir.ts
```

Each prints its findings to stdout. After running all four, read `FINDINGS.md` for the documented results.

## What each script proves

| Script | Validates |
|---|---|
| `spike-spawn.ts` | node-pty can spawn `claude`, prompt is written via stdin, output streams via stdout |
| `spike-resume.ts` | `--resume <session-id>` re-attaches and Claude remembers prior context |
| `spike-model.ts` | `--model claude-haiku-4-5` is accepted and routes to the named model |
| `spike-config-dir.ts` | `CLAUDE_CONFIG_DIR` env var switches account context |

## When to delete

After Phase 4 lands its real `src/main/cc/` module, this entire `spikes/cc-pty/` directory can be deleted. Its purpose is one-off learning.
