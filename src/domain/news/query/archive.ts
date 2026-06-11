/**
 * News Collector — collected-RSS archive tools (globRss / grepRss / readRss)
 *
 * Creates AI tools that query the persistent news store.
 * Uses endTime = new Date() (real-time mode, not backtesting).
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { INewsProvider, NewsItem } from '../types.js'

const NEWS_LIMIT = 500

// ==================== Pure functions (testable) ====================

/** Context injected into pure functions */
export interface NewsToolContext {
  getNews: () => Promise<NewsItem[]>
}

export interface GlobRssResult {
  id: number
  title: string
  contentLength: number
  metadata: string
}

export interface GrepRssResult {
  id: number
  title: string
  matchedText: string
  contentLength: number
  metadata: string
}

function truncateMetadata(metadata: Record<string, string | null>, maxLength: number = 40): string {
  const str = JSON.stringify(metadata)
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

function matchesMetadataFilter(metadata: Record<string, string | null>, filter: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (metadata[key] !== value) return false
  }
  return true
}

/** Match news by title regex (like "ls" / "glob") */
export async function globRss(
  context: NewsToolContext,
  options: {
    pattern: string
    metadataFilter?: Record<string, string>
    limit?: number
  },
): Promise<GlobRssResult[]> {
  const news = await context.getNews()
  const regex = new RegExp(options.pattern, 'i')
  const results: GlobRssResult[] = []

  for (const item of news) {
    if (options.metadataFilter && !matchesMetadataFilter(item.metadata, options.metadataFilter)) continue
    if (!regex.test(item.title)) continue

    results.push({
      id: item.id,
      title: item.title,
      contentLength: item.content.length,
      metadata: truncateMetadata(item.metadata),
    })

    if (options.limit && results.length >= options.limit) break
  }

  return results
}

/** Search news content by pattern (like "grep") */
export async function grepRss(
  context: NewsToolContext,
  options: {
    pattern: string
    contextChars?: number
    metadataFilter?: Record<string, string>
    limit?: number
  },
): Promise<GrepRssResult[]> {
  const news = await context.getNews()
  const regex = new RegExp(options.pattern, 'gi')
  const contextChars = options.contextChars ?? 50
  const results: GrepRssResult[] = []

  for (const item of news) {
    if (options.metadataFilter && !matchesMetadataFilter(item.metadata, options.metadataFilter)) continue

    const searchText = `${item.title}\n${item.content}`
    const match = regex.exec(searchText)
    if (!match) continue

    const matchStart = match.index
    const matchEnd = matchStart + match[0].length
    const contextStart = Math.max(0, matchStart - contextChars)
    const contextEnd = Math.min(searchText.length, matchEnd + contextChars)

    let matchedText = ''
    if (contextStart > 0) matchedText += '...'
    matchedText += searchText.slice(contextStart, contextEnd)
    if (contextEnd < searchText.length) matchedText += '...'

    results.push({
      id: item.id,
      title: item.title,
      matchedText,
      contentLength: item.content.length,
      metadata: truncateMetadata(item.metadata),
    })

    regex.lastIndex = 0

    if (options.limit && results.length >= options.limit) break
  }

  return results
}

/** Read full news content by stable id (like "cat") */
export async function readRss(
  context: NewsToolContext,
  options: { id: number },
): Promise<NewsItem | null> {
  const news = await context.getNews()
  return news.find((item) => item.id === options.id) ?? null
}

// ==================== AI Tool factory ====================

export function createNewsArchiveTools(provider: INewsProvider) {
  return {
    globRss: tool({
      description: `Search the collected-RSS archive by title pattern (like "ls" / "glob").

The archive holds articles pulled from the user's SUBSCRIBED RSS feeds —
coverage is exactly the feed list, not the news at large. Empty results mean
"not in the subscribed feeds", not "nothing happened".

Returns matching headlines with a stable \`id\`, title, content length, and metadata preview.
Pass an \`id\` to readRss to read the full article — the id is stable across calls,
so you do NOT need to repeat your \`lookback\`.
Use this to quickly scan what the subscribed feeds picked up.

Search pool: the most recent ${NEWS_LIMIT} items within \`lookback\` (or the
most recent ${NEWS_LIMIT} overall when \`lookback\` is omitted). Older items
within the lookback window are NOT searched. Your \`limit\` then bounds the
match count returned from that pool.

Example: globRss({ pattern: "BTC|Bitcoin", lookback: "1d" })`,
      inputSchema: z.object({
        pattern: z.string().describe('Regex to match against article titles'),
        lookback: z.string().optional().describe(`Time range: "1h", "12h", "1d", "7d" (searches up to ${NEWS_LIMIT} most recent items in the window)`),
        metadataFilter: z.record(z.string(), z.string()).optional().describe('Filter by metadata key-value'),
        limit: z.number().int().positive().optional().describe('Max results'),
      }).meta({ examples: [{ pattern: 'BTC|Bitcoin', lookback: '1d' }] }),
      execute: async ({ pattern, lookback, metadataFilter, limit }) => {
        return globRss(
          { getNews: () => provider.getNewsV2({ endTime: new Date(), lookback, limit: NEWS_LIMIT }) },
          { pattern, metadataFilter, limit },
        )
      },
    }),

    grepRss: tool({
      description: `Search collected-RSS article content by pattern (like "grep").

Searches articles pulled from the user's SUBSCRIBED RSS feeds (coverage = the
feed list). Returns matched text with surrounding context.
Use this to find specific mentions in the collected articles.

Search pool: the most recent ${NEWS_LIMIT} items within \`lookback\` (or the
most recent ${NEWS_LIMIT} overall when \`lookback\` is omitted). Older items
within the lookback window are NOT searched.

Example: grepRss({ pattern: "interest rate", lookback: "2d" })`,
      inputSchema: z.object({
        pattern: z.string().describe('Regex to search in title and content'),
        lookback: z.string().optional().describe(`Time range: "1h", "12h", "1d", "7d" (searches up to ${NEWS_LIMIT} most recent items in the window)`),
        contextChars: z.number().int().positive().optional().describe('Context chars around match (default: 50)'),
        metadataFilter: z.record(z.string(), z.string()).optional().describe('Filter by metadata key-value'),
        limit: z.number().int().positive().optional().describe('Max results'),
      }).meta({ examples: [{ pattern: 'interest rate', lookback: '2d' }] }),
      execute: async ({ pattern, lookback, contextChars, metadataFilter, limit }) => {
        return grepRss(
          { getNews: () => provider.getNewsV2({ endTime: new Date(), lookback, limit: NEWS_LIMIT }) },
          { pattern, contextChars, metadataFilter, limit },
        )
      },
    }),

    readRss: tool({
      description: `Read full content of a collected-RSS article by stable id (like "cat").

Use after globRss/grepRss to read a specific article — pass the \`id\` from their
results. The id is stable, so it resolves regardless of what \`lookback\` you used
to find the item (no need to repeat it).`,
      inputSchema: z.object({
        id: z.number().int().nonnegative().describe('Stable article id from globRss/grepRss results'),
      }).meta({ examples: [{ id: 0 }] }),
      execute: async ({ id }) => {
        const result = await readRss(
          { getNews: () => provider.getNewsV2({ endTime: new Date(), limit: NEWS_LIMIT }) },
          { id },
        )
        return result ?? { error: `Article id ${id} not found` }
      },
    }),
  }
}
