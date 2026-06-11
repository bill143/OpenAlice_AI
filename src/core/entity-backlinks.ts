/**
 * Backlink scanner — the reverse index for the entity store.
 *
 * Walks every workspace's markdown and collects which notes contain `[[name]]`
 * links. This is a *mechanical gather of the links the agent already wrote*
 * (Obsidian-style backlinks), NOT extraction — we never parse prose to infer
 * entities or relations, only harvest authored `[[...]]` tokens.
 *
 * Computed on demand: the corpus is small (tens of workspaces, sub-MB of
 * markdown). Dot-directories (.git, .claude, .agents, .codex, …) and the
 * scaffolding files (CLAUDE.md / AGENTS.md / README.md) are skipped so injected
 * persona / skill text can't produce phantom backlinks — only the agent's own
 * notes count.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

import type { WorkspaceRegistry } from '../workspaces/workspace-registry.js'

export interface Backlink {
  workspaceId: string
  workspaceTag: string
  /** Path of the note, relative to the workspace root. */
  path: string
}

/** `[[name]]` where the inner text has no brackets or newline. */
const WIKILINK_RE = /\[\[([^[\]\n]+)\]\]/g
const SKIP_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md'])

async function listMarkdown(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(abs: string): Promise<void> {
    // Inferred Dirent<string>[]; on an unreadable dir (race with deletion etc.)
    // fall back to empty rather than aborting the whole scan.
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (e.name.startsWith('.')) continue // .git / .claude / .agents / .codex / dotfiles
      const child = join(abs, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue
        await walk(child)
      } else if (e.isFile() && e.name.endsWith('.md') && !SKIP_FILES.has(e.name)) {
        out.push(relative(root, child))
      }
    }
  }
  await walk(root)
  return out
}

/**
 * Scan all workspaces once. Returns a map from the lowercased `[[name]]` token
 * to the notes referencing it (deduped per file — N mentions in one note count
 * as one backlink). Callers look up by entity name (case-insensitive); tokens
 * with no matching entity are simply never queried.
 */
export async function scanBacklinks(registry: WorkspaceRegistry): Promise<Map<string, Backlink[]>> {
  const out = new Map<string, Backlink[]>()
  for (const ws of registry.list()) {
    const files = await listMarkdown(ws.dir)
    for (const rel of files) {
      let content: string
      try {
        content = await readFile(join(ws.dir, rel), 'utf-8')
      } catch {
        continue
      }
      const seenInFile = new Set<string>()
      for (const m of content.matchAll(WIKILINK_RE)) {
        const raw = m[1]
        if (!raw) continue
        const k = raw.trim().toLowerCase()
        if (!k || seenInFile.has(k)) continue
        seenInFile.add(k)
        const link: Backlink = { workspaceId: ws.id, workspaceTag: ws.tag, path: rel }
        const arr = out.get(k)
        if (arr) arr.push(link)
        else out.set(k, [link])
      }
    }
  }
  return out
}
