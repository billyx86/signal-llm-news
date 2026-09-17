import { create } from 'zustand'
import { useEffect } from 'react'
import {
  fetchAllFeeds,
  RSS_FEEDS,
  type FeedResult,
  type RSSItem,
  type FeedTransport,
  type FeedTransportResponse,
} from '@/lib/rss'
import type { Story, Topic } from '@/data/news'
import { categoryToTopic } from '@/lib/rss'

/** How often the feed auto-refreshes while the tab is visible. */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000

/**
 * Pick the transport used to fetch feed bodies.
 *
 * In a real **browser** we route each feed through the server-side proxy
 * ({@link import('./feed-proxy').fetchFeedXml}) so feeds without permissive
 * CORS headers still load (issue #13). The server module is imported
 * **dynamically** so it is never pulled in — and never executed — during SSR
 * or the jsdom unit tests, where a plain client `fetch` is used instead (and
 * is stubbed by the tests).
 *
 * @returns the proxy transport in a browser, or `undefined` elsewhere (which
 *   makes `fetchAllFeeds` fall back to the default direct-`fetch` transport).
 */
async function resolveFeedTransport(): Promise<FeedTransport | undefined> {
  const env = import.meta.env
  const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'
  // `MODE === 'test'` is how vitest identifies itself in this project.
  if (!isBrowser || env.SSR || env.MODE === 'test') return undefined

  const { fetchFeedXml } = await import('./feed-proxy')
  return (url: string, signal?: AbortSignal): Promise<FeedTransportResponse> =>
    fetchFeedXml({ data: { url }, signal }).then((res) => ({
      ok: res.ok,
      status: res.status,
      text: () => Promise.resolve(res.body),
    }))
}

interface FeedState {
  /** Live stories merged in from upstream feeds (newest first). */
  liveStories: Story[]
  /** Feeds that failed on the last refresh, for UI error messaging. */
  failedFeeds: number
  /** Feeds that succeeded on the last refresh. */
  succeededFeeds: number
  lastRefreshedAt: string | null
  isRefreshing: boolean
  hasRefreshed: boolean
  refresh: () => Promise<void>
}

function toStory(item: RSSItem, feedCategory?: string): Story {
  const words = item.description ? item.description.split(/\s+/).length : 0
  return {
    id: `rss:${item.link}`,
    title: item.title,
    summary: item.description || 'Full story available on the source site.',
    body: `${item.description || 'No summary provided by the feed.'}\n\nThe full story is on ${item.source}.`,
    topic: categoryToTopic(feedCategory),
    source: item.source,
    sourceUrl: item.link,
    author: item.source,
    publishedAt: item.pubDate,
    readTime: Math.max(2, Math.ceil(words / 200)),
    updatedAt: new Date().toISOString(),
  }
}

const feedCategoryBySource = new Map(RSS_FEEDS.map((f) => [f.name, f.category]))

export const useFeedStore = create<FeedState>()((set, get) => ({
  liveStories: [],
  failedFeeds: 0,
  succeededFeeds: 0,
  lastRefreshedAt: null,
  isRefreshing: false,
  hasRefreshed: false,

  refresh: async () => {
    // Never run two refreshes at once — manual clicks and the poller share it.
    if (get().isRefreshing) return
    set({ isRefreshing: true })
    try {
      // In a browser this resolves the server-proxy transport (bypassing
      // browser CORS); elsewhere it is undefined and fetchAllFeeds falls back
      // to a direct fetch.
      const transport = await resolveFeedTransport()
      const result: FeedResult = await fetchAllFeeds(RSS_FEEDS, transport ? { transport } : {})
      const now = new Date().toISOString()
      const liveStories = result.items
        .map((item) => toStory(item, feedCategoryBySource.get(item.source)))
        .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
      set({
        liveStories,
        failedFeeds: result.failed,
        succeededFeeds: result.succeeded,
        lastRefreshedAt: now,
        isRefreshing: false,
        hasRefreshed: true,
      })
    } catch (error) {
      // fetchAllFeeds settles everything itself; this is a defensive catch so
      // the UI can never be left stuck in the "refreshing" state.
      console.error('Feed refresh failed', error)
      set((s) => ({ failedFeeds: s.succeededFeeds + s.failedFeeds, isRefreshing: false }))
    }
  },
}))

/**
 * React hook: auto-refreshes the live feed every {@link REFRESH_INTERVAL_MS}
 * while the tab is visible, pausing in background tabs. Bookmarks live in a
 * separate persisted store, so refreshes never disturb the saved archive.
 */
export function useFeedAutoRefresh() {
  const refresh = useFeedStore((s) => s.refresh)

  useEffect(() => {
    // Initial fetch on mount. refresh() is idempotent via the isRefreshing
    // guard, so this is safe even if a manual refresh is already in flight.
    void refresh()

    // Poll on an interval; skip the fetch while the tab is hidden so
    // background tabs don't hammer the upstream feeds.
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [refresh])
}

/** Merge live RSS stories with the seeded archive, deduping by id. */
export function mergeStories(
  base: readonly Story[],
  live: readonly Story[],
): readonly Story[] {
  const seen = new Set(base.map((s) => s.id))
  const fresh = live.filter((s) => !seen.has(s.id))
  if (fresh.length === 0) return base
  const merged = [...fresh, ...base].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : -1,
  )
  return merged
}

export type { Topic }
