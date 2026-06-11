import { fetchJson } from './client'

export interface InboxDoc {
  path: string
}

export interface InboxEntry {
  id: string
  ts: number
  workspaceId: string
  workspaceLabel?: string
  /** Pointers to workspace files. Rendered live (no snapshot). */
  docs?: InboxDoc[]
  /** Agent's message body (markdown). Renders below docs. */
  comments?: string
}

export interface InboxHistoryResponse {
  entries: InboxEntry[]
  hasMore: boolean
}

export interface InboxSeedBody {
  workspaceId: string
  workspaceLabel?: string
  docs?: InboxDoc[]
  comments?: string
}

export const inboxApi = {
  async history(
    opts: { limit?: number; before?: string; workspaceId?: string } = {},
  ): Promise<InboxHistoryResponse> {
    const qs = new URLSearchParams()
    if (opts.limit != null) qs.set('limit', String(opts.limit))
    if (opts.before) qs.set('before', opts.before)
    if (opts.workspaceId) qs.set('workspaceId', opts.workspaceId)
    return fetchJson(`/api/inbox/history?${qs}`)
  },

  /** Dev-only — append an inbox entry. */
  async seed(body: InboxSeedBody): Promise<{ entry: InboxEntry }> {
    return fetchJson('/api/inbox/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },

  /** Hard-delete an inbox entry. Returns true on success, false if
   *  the entry didn't exist (server replied 404). */
  async delete(id: string): Promise<boolean> {
    const res = await fetch(`/api/inbox/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (res.status === 204) return true
    if (res.status === 404) return false
    throw new Error(`inbox delete failed: ${res.status}`)
  },
}
