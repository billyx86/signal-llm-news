import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { shareStory as shareStoryUtil, type ShareResult } from '@/lib/share'
import type { Story } from '@/data/news'

interface ShareState {
  /** Story id -> number of successful shares recorded from this browser. */
  counts: Record<string, number>
  recordShare: (id: string) => void
  getShareCount: (id: string) => number
  totalShares: () => number
}

/**
 * Persisted per-story share counts ("share analytics").
 *
 * Counts are stored locally per browser — they are a lightweight signal of
 * what *this* reader shared, not a global metric. The store also exposes
 * `totalShares` for an aggregate the UI can surface.
 */
export const useShareStore = create<ShareState>()(
  persist(
    (set, get) => ({
      counts: {},
      recordShare: (id) =>
        set((state) => ({
          counts: { ...state.counts, [id]: (state.counts[id] ?? 0) + 1 },
        })),
      getShareCount: (id) => get().counts[id] ?? 0,
      totalShares: () => Object.values(get().counts).reduce((a, b) => a + b, 0),
    }),
    { name: 'signal-shares' },
  ),
)

export interface ShareOutcome {
  result: ShareResult
  count: number
}

/**
 * Share a story and record the outcome in the share store.
 *
 * Only *successful* shares (native sheet confirmed, or clipboard copy
 * confirmed) increment the count. Failures and unsupported environments do
 * not. This keeps "shared N times" honest.
 *
 * @param story - The story to share.
 * @returns The share result plus the updated count for this story.
 */
export async function shareStory(
  story: Story,
): Promise<ShareOutcome> {
  const result = await shareStoryUtil(story)
  if (result.ok) {
    useShareStore.getState().recordShare(story.id)
  }
  const count = useShareStore.getState().getShareCount(story.id)
  return { result, count }
}
