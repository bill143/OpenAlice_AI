import { create } from 'zustand'

/**
 * Client-side selection state for the Inbox. Lives outside `ViewSpec` so
 * that selecting a different entry from the sidebar doesn't churn tab
 * identity (one Inbox tab, selection mutates inside it — Linear-style).
 *
 * Not persisted: selection is ephemeral UI state, no value to remember
 * across reloads.
 */

interface InboxSelectionState {
  selectedEntryId: string | null
}

interface InboxSelectionActions {
  select: (id: string | null) => void
}

export const useInboxSelection = create<InboxSelectionState & InboxSelectionActions>()((set) => ({
  selectedEntryId: null,
  select: (id) => set({ selectedEntryId: id }),
}))
