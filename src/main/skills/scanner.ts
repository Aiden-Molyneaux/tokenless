import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { DiscoveredSkill, SkillSource } from '@shared/types/skills'

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

function sourceFor(rootPath: string, projectPath: string | null): SkillSource {
  if (projectPath && rootPath.startsWith(projectPath)) return 'project'
  if (rootPath.includes('/plugins/') || rootPath.endsWith('/plugins')) return 'plugin'
  return 'user'
}

async function safeReaddir(
  path: string,
  readdirImpl: (p: string) => Promise<readonly string[]>
): Promise<readonly string[]> {
  try { return await readdirImpl(path) } catch { return [] }
}

async function safeStat(
  path: string,
  statImpl: (p: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>
): Promise<{ isDirectory(): boolean; isFile(): boolean } | null> {
  try { return await statImpl(path) } catch { return null }
}

// Scan a single "skills container" directory for skill subdirectories.
// Each subdirectory containing a parseable SKILL.md becomes one DiscoveredSkill.
async function scanContainer(
  containerPath: string,
  source: SkillSource,
  readdirImpl: NonNullable<ScannerOptions['readdirImpl']>,
  statImpl: NonNullable<ScannerOptions['statImpl']>,
  readFileImpl: NonNullable<ScannerOptions['readFileImpl']>
): Promise<readonly DiscoveredSkill[]> {
  const entries = await safeReaddir(containerPath, readdirImpl)
  const found: DiscoveredSkill[] = []
  for (const entry of entries) {
    const dirPath = join(containerPath, entry).replace(/\\/g, '/')
    const s = await safeStat(dirPath, statImpl)
    if (!s?.isDirectory()) continue
    const skillFile = `${dirPath}/SKILL.md`
    const f = await safeStat(skillFile, statImpl)
    if (!f?.isFile()) continue
    try {
      const content = await readFileImpl(skillFile)
      const parsed = parseSkillContent(content)
      if (!parsed) continue
      found.push({ source, name: parsed.name, description: parsed.description, path: dirPath })
    } catch {
      // Unreadable SKILL.md — skip silently. The watcher logs filesystem
      // errors at the next layer if surfacing is required.
    }
  }
  return found
}

export async function scanSkillsRoots(
  roots: readonly string[],
  activeProjectPath: string | null,
  opts: ScannerOptions = {}
): Promise<readonly DiscoveredSkill[]> {
  const readFileImpl = opts.readFileImpl ?? ((p: string) => readFile(p, 'utf-8'))
  const readdirImpl = opts.readdirImpl ?? ((p: string) => readdir(p))
  const statImpl = opts.statImpl ?? (async (p: string) => {
    const s = await stat(p)
    // Wrap in arrow functions to avoid `this`-binding issues when the Stats
    // methods are passed as predicate callbacks.
    return { isDirectory: () => s.isDirectory(), isFile: () => s.isFile() }
  })

  const projectPathNormalized = activeProjectPath ? activeProjectPath.replace(/\\/g, '/') : null
  const found: DiscoveredSkill[] = []

  for (const root of roots) {
    if (root.endsWith('/plugins')) {
      // Plugin layout: iterate each plugin dir, then look for "skills" inside.
      const plugins = await safeReaddir(root, readdirImpl)
      for (const plugin of plugins) {
        const pluginSkillsPath = `${root}/${plugin}/skills`
        const s = await safeStat(pluginSkillsPath, statImpl)
        if (!s?.isDirectory()) continue
        const items = await scanContainer(pluginSkillsPath, 'plugin', readdirImpl, statImpl, readFileImpl)
        found.push(...items)
      }
    } else {
      const source = sourceFor(root, projectPathNormalized)
      const items = await scanContainer(root, source, readdirImpl, statImpl, readFileImpl)
      found.push(...items)
    }
  }
  // Deduplicate by path — defensive against overlapping roots.
  const byPath = new Map<string, DiscoveredSkill>()
  for (const s of found) byPath.set(s.path, s)
  return Array.from(byPath.values())
}
