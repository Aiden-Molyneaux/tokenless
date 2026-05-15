interface ParsedContent {
  readonly name: string
  readonly description: string | null
}

// Minimal SKILL.md frontmatter parser. Reads `name` + `description` from a
// `---`-fenced block at file start; falls back to the body's first paragraph
// for description. Forward-compatible: any YAML beyond these two keys is
// ignored.
export function parseSkillContent(content: string): ParsedContent | null {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null
  const front = match[1]
  const body = match[2] ?? ''
  const fields: Record<string, string> = {}
  for (const line of front.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    fields[m[1]] = value
  }
  const name = fields.name
  if (!name) return null
  let description: string | null = fields.description || null
  if (!description) {
    const para = body.trim().split(/\n\s*\n/)[0]?.trim() || null
    description = para
  }
  return { name, description }
}

// Type for scanSkillsRoots — exported now so the IPC layer can import it for
// tests, but the function itself lands in Task 4.
export interface ScannerOptions {
  readonly readFileImpl?: (path: string) => Promise<string>
  readonly readdirImpl?: (path: string) => Promise<readonly string[]>
  readonly statImpl?: (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>
}
