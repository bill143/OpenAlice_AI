import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { inboxLive } from './inbox'

/**
 * Per-entry read tracking for the Inbox — Linear-style.
 *
 * Why per-entry, not a timestamp watermark: in an inbox-flow product,
 * "read" and "unread" are state-machine categories of attention, not
 * cosmetic indicators. Bulk-marking everything read on page visit (the
 * watermark approach) destroys the user's ability to triage — open inbox
 * with 10 unread items, look at one, all 10 silently become read. Per-entry
 * tracking preserves the "you've actively touched this one" semantic.
 *
 * Read state lives client-side in localStorage. Persists across reloads
 * but not across devices (single-tenant local-only product; cross-device
 * sync would need a server-side store).
 */

interface InboxReadState {
  /** Set of entry ids the user has marked read. Object-shaped (not Set)
   *  for Zustand `persist` compatibility — Set doesn't survive JSON. */
  readIds: Record<string, true>
}

interface InboxReadActions {
  /** Mark a single entry as read. Called by the sidebar when an entry
   *  becomes selected (click, j/k nav, default-select-latest). */
  markRead: (id: string) => void
  /** Mark a single entry as unread — reverses markRead. UI affordance
   *  to expose this (a context-menu "Mark unread" item, hover button,
   *  shift+u shortcut) is parked for v1; the action is here so it's
   *  trivial to wire when we decide to add it. */
  markUnread: (id: string) => void
  /** Mark every currently-loaded entry as read. Reserved for a future
   *  explicit "Mark all as read" button — not auto-fired anywhere. */
  markAllRead: () => void
}

export const useInboxRead = create<InboxReadState & InboxReadActions>()(
  persist(
    (set) => ({
      readIds: {},
      markRead: (id) =>
        set((s) => (s.readIds[id] ? s : { readIds: { ...s.readIds, [id]: true } })),
      markUnread: (id) =>
        set((s) => {
          if (!s.readIds[id]) return s
          const next = { ...s.readIds }
          delete next[id]
          return { readIds: next }
        }),
      markAllRead: () => {
        const { entries } = inboxLive.getState()
        if (entries.length === 0) return
        set((s) => {
          const next = { ...s.readIds }
          for (const e of entries) next[e.id] = true
          return { readIds: next }
        })
      },
    }),
    { name: 'openalice.inbox-read.v2', version: 2 },
  ),
)

/** Activity-bar badge count: entries whose id isn't in `readIds`. */
export function useUnreadInboxCount(): number {
  const readIds = useInboxRead((s) => s.readIds)
  return inboxLive.useStore((s) =>
    s.entries.reduce((n, e) => (readIds[e.id] ? n : n + 1), 0),
  )
}
