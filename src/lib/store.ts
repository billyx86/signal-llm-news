import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BookmarkState {
  bookmarks: string[]
  toggleBookmark: (id: string) => void
  isBookmarked: (id: string) => boolean
  clearBookmarks: () => void
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      toggleBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(id)
            ? state.bookmarks.filter((b) => b !== id)
            : [...state.bookmarks, id],
        })),
      isBookmarked: (id) => get().bookmarks.includes(id),
      clearBookmarks: () => set({ bookmarks: [] }),
    }),
    { name: 'signal-bookmarks' },
  ),
)

/**
 * Rehydrate this tab's bookmarks when *another* tab writes to the same
 * localStorage key (cross-tab sync).
 *
 * The `storage` event fires in every *other* open document — never in the tab
 * that made the write — so applying `e.newValue` here keeps several tabs in
 * agreement without a reload.
 *
 * The listener is attached at **module scope**, not inside
 * `onRehydrateStorage`: zustand's `persist` invokes whatever that option
 * *returns* as a post-rehydration callback, so returning a cleanup function
 * there removed the listener immediately after it was added (verified
 * empirically — the listener never survived, so cross-tab sync never
 * actually worked). Registering here keeps it alive for the tab's lifetime.
 * The boolean guard keeps module re-imports idempotent.
 */
let bookmarkSyncAttached = false

function attachBookmarkSync(): void {
  if (bookmarkSyncAttached) return
  if (typeof window === 'undefined') return
  bookmarkSyncAttached = true

  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== 'signal-bookmarks' || e.newValue === null) return
    try {
      const parsed = JSON.parse(e.newValue) as {
        state: { bookmarks: string[] }
      }
      if (parsed && parsed.state && Array.isArray(parsed.state.bookmarks)) {
        useBookmarkStore.setState({ bookmarks: parsed.state.bookmarks })
      }
    } catch {
      // Ignore a malformed write from another tab.
    }
  })
}

attachBookmarkSync()
