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
    { 
      name: 'signal-bookmarks',
      onRehydrateStorage: () => (state) => {
        // Listen for storage events to sync across tabs
        if (typeof window !== 'undefined') {
          const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'signal-bookmarks' && e.newValue) {
              try {
                const parsed = JSON.parse(e.newValue)
                if (parsed.state && Array.isArray(parsed.state.bookmarks)) {
                  set({ bookmarks: parsed.state.bookmarks })
                }
              } catch {}
            }
          }
          window.addEventListener('storage', handleStorageChange)
          return () => window.removeEventListener('storage', handleStorageChange)
        }
      }
    },
  ),
)
