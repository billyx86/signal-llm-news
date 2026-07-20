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
