import { create } from 'zustand'
import { useEffect } from 'react'
import {
  fetchAllFeeds,
  RSS_FEEDS,
  type FeedResult,
  type FeedStatus,
  type RSSItem,
  type RSSFeedConfig,
  type FeedTransport,
  type FeedTransportResponse,
} from '@/lib/rss'
import type { Story, Topic } from '@/data/news'
import { categoryToTopic } from '@/lib/rss'
import { useUserFeedStore, type UserFeed } from '@/lib/feed-store'
import { normalizeFeedKey } from '@/lib/feed-store'

/** How often the feed auto-refreshes while the tab is visible. */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000

/**
 * Per-feed retry backoff state (issue #25).
 *
 * The poller ticks on a fixed {@link REFRESH_INTERVAL_MS} cadence, but a feed
 * that keeps failing is not re-fetched on every tick: each consecutive failure
 * widens the interval before its next attempt (exponential backoff) and a
 * success resets it to the base cadence. This stops a permanently-down or 404
 * feed from being hammered every 5 minutes for as long as the tab is open.
 */
export type FeedBackoffState = {
  /** Consecutive failed attempts for this feed (resets to 0 on success). */
  consecutiveFailures: number
  /** ISO timestamp of the last fetch attempt, or `null` if never attempted. */
  lastAttemptAt: string | null
}

/** Multiplier applied to the base interval for each consecutive failure. */
export const BACKOFF_FACTOR = 3
/** Backoff widens at most this many steps before the interval is capped. */
export const MAX_BACKOFF_STEPS = 3
/**
 * The longest a feed is suspended after repeated failures (base × factor³ =
 * 5m × 27 = 135m ≈ 2h15m), so a dead feed is eventually retried again.
 */
export const MAX_BACKOFF_INTERVAL_MS =
  REFRESH_INTERVAL_MS * BACKOFF_FACTOR ** MAX_BACKOFF_STEPS

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
  /** Per-feed health snapshot from the last refresh (empty until one completes). */
  feedStatuses: FeedStatus[]
  /** Per-feed retry backoff state, keyed by normalised feed URL (issue #25). */
  backoff: Map<string, FeedBackoffState>
  lastRefreshedAt: string | null
  isRefreshing: boolean
  hasRefreshed: boolean
  /** Full refresh of every active feed (mount + the manual Sync button). */
  refresh: () => Promise<void>
  /** One poller tick: refresh only the feeds whose next attempt is due. */
  tick: () => Promise<void>
}

/**
 * Classify a per-feed snapshot into the UI's health vocabulary.
 *
 * - `failed` — the last fetch errored (HTTP error / timeout / network throw).
 * - `stale`  — the last *successful* fetch is older than `staleAfterMs`
 *   (2× the refresh interval), so the data may be out of date.
 * - `ok`     — everything else (fetched recently, no error).
 *
 * Pure and deterministic given `now`, so it is trivially testable.
 */
export function classifyFeedHealth(
  status: FeedStatus,
  now = Date.now(),
  staleAfterMs = 2 * REFRESH_INTERVAL_MS,
): 'ok' | 'stale' | 'failed' {
  if (!status.ok) return 'failed'
  const fetched = new Date(status.fetchedAt).getTime()
  if (!Number.isNaN(fetched) && now - fetched > staleAfterMs) return 'stale'
  return 'ok'
}

/**
 * The interval before a feed's next attempt, given its backoff state.
 *
 * - `consecutiveFailures === 0` → the base {@link REFRESH_INTERVAL_MS}.
 * - Otherwise `base × BACKOFF_FACTOR^consecutiveFailures`, capped at
 *   {@link MAX_BACKOFF_INTERVAL_MS}.
 *
 * Pure and deterministic — trivially unit-testable (issue #25).
 */
export function backoffInterval(
  state: Pick<FeedBackoffState, 'consecutiveFailures'>,
  baseMs = REFRESH_INTERVAL_MS,
): number {
  const steps = Math.min(Math.max(state.consecutiveFailures, 0), MAX_BACKOFF_STEPS)
  return Math.min(baseMs * BACKOFF_FACTOR ** steps, MAX_BACKOFF_INTERVAL_MS)
}

/**
 * The timestamp at which a feed becomes eligible for its next attempt, given
 * the time of its *last* attempt and its backoff state. `null` when the feed
 * has never been attempted (it is due immediately) or `lastAttemptAt` is not a
 * valid timestamp. Pure and deterministic (issue #25).
 */
export function nextAttemptAt(
  lastAttemptAt: string | null,
  state: Pick<FeedBackoffState, 'consecutiveFailures'>,
  baseMs = REFRESH_INTERVAL_MS,
): number | null {
  if (lastAttemptAt === null) return null
  const last = new Date(lastAttemptAt).getTime()
  if (Number.isNaN(last)) return null
  return last + backoffInterval(state, baseMs)
}

/**
 * True when `now` is at or past a feed's next-attempt time. A feed that has
 * never been attempted (or whose timestamp is unparseable) is due
 * immediately. Pure (issue #25).
 */
export function isFeedDue(
  state: FeedBackoffState,
  now = Date.now(),
  baseMs = REFRESH_INTERVAL_MS,
): boolean {
  const next = nextAttemptAt(state.lastAttemptAt, state, baseMs)
  return next === null || now >= next
}

/**
 * Fold a refresh's per-feed results back into the stored backoff state
 * (issue #25). A feed whose attempt *succeeded* resets to
 * `consecutiveFailures: 0`; one that *failed* increments its count. Feeds not
 * present in `statuses` (skipped this tick because they were not due) are
 * carried through unchanged.
 *
 * `statuses` is one `FeedStatus` per feed actually fetched in this refresh —
 * the same list `refresh()` stores in `feedStatuses` — so this is exactly the
 * "did this attempt succeed?" signal the poller needs, without re-deriving it.
 */
export function updateFeedBackoff(
  prev: ReadonlyMap<string, FeedBackoffState>,
  statuses: readonly FeedStatus[],
  now: Date = new Date(),
): Map<string, FeedBackoffState> {
  const next = new Map(prev)
  for (const status of statuses) {
    const key = normalizeFeedKey(status.url)
    const prior = prev.get(key)
    const consecutiveFailures = status.ok ? 0 : (prior?.consecutiveFailures ?? 0) + 1
    next.set(key, { consecutiveFailures, lastAttemptAt: now.toISOString() })
  }
  return next
}

/**
 * Merge a (possibly partial) refresh's items into the stored live stories, so
 * a refresh that only re-fetched the feeds that were due this tick never
 * drops items from feeds that were skipped (issue #25).
 *
 * Two sets drive the merge:
 * - `activeSourceNames` — feeds still active. Any stored story whose `source`
 *   is not in this set is pruned (a removed feed's items disappear, matching
 *   the old full-replace behaviour).
 * - `fetchedSourceNames` — the feeds *actually re-fetched* on this call. Their
 *   previously-stored stories are cleared first, so an item a re-fetched feed
 *   no longer returns is dropped (a plain union would keep it stale). Feeds
 *   not re-fetched this tick keep their stored stories untouched.
 *
 * On a full refresh `fetchedSourceNames` covers every active feed, so the
 * result is identical to the old wholesale replace. The result is re-sorted
 * newest first, matching {@link mergeStories}.
 */
export function mergeLiveStories(
  prev: readonly Story[],
  refreshed: readonly Story[],
  activeSourceNames: ReadonlySet<string>,
  fetchedSourceNames: ReadonlySet<string>,
): Story[] {
  const byId = new Map<string, Story>()
  for (const story of prev) {
    if (!activeSourceNames.has(story.source)) continue // feed removed by user
    if (fetchedSourceNames.has(story.source)) continue // re-fetched: apply new items
    byId.set(story.id, story)
  }
  for (const story of refreshed) byId.set(story.id, story)
  return [...byId.values()].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

/**
 * Merge a (possibly partial) refresh's per-feed statuses into the stored list
 * (issue #25). A feed that was re-fetched this tick gets its new status; a
 * feed that was skipped keeps its previous status (so the health panel still
 * lists every active feed, not just the ones fetched this tick). Statuses for
 * feeds no longer active are pruned.
 *
 * `activeKeys` is the set of normalised URLs currently active, used to prune
 * removed feeds.
 */
export function mergeFeedStatuses(
  prev: readonly FeedStatus[],
  fetched: readonly FeedStatus[],
  activeKeys: ReadonlySet<string>,
): FeedStatus[] {
  const byKey = new Map<string, FeedStatus>()
  for (const s of prev) {
    const key = normalizeFeedKey(s.url)
    if (activeKeys.has(key)) byKey.set(key, s)
  }
  for (const s of fetched) byKey.set(normalizeFeedKey(s.url), s)
  return [...byKey.values()]
}

/**
 * The active feeds whose next attempt is due now (issue #25). A feed with no
 * backoff state yet (never attempted) is due immediately; otherwise it is due
 * when {@link isFeedDue} says so. Pure (issue #25).
 */
export function dueFeeds(
  feeds: readonly RSSFeedConfig[],
  backoff: ReadonlyMap<string, FeedBackoffState>,
  now = Date.now(),
): RSSFeedConfig[] {
  return feeds.filter((feed) => {
    const state = backoff.get(normalizeFeedKey(feed.url))
    return state ? isFeedDue(state, now) : true
  })
}

/**
 * Format a backoff interval for the error chip tooltip ("retrying in 45m").
 * Minutes under an hour render as `Xm`; otherwise rounded whole hours as `Xh`.
 * Pure (issue #25).
 */
export function formatBackoffInterval(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
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

/**
 * The feeds the pipeline should fetch on the next refresh: the built-in
 * `RSS_FEEDS` plus any user-added feeds that are still enabled (issue #16).
 *
 * User feeds are read from the persisted store at call time, so adding or
 * removing a feed takes effect on the *next* refresh without a reload. The
 * user list is de-duplicated against the built-in list by normalised URL, in
 * case the user adds a feed that already ships with the app.
 */
export function getActiveFeeds(userFeeds: readonly UserFeed[] = []): RSSFeedConfig[] {
  const builtInKeys = new Set(RSS_FEEDS.map((f) => normalizeFeedKey(f.url)))
  const user = userFeeds.filter(
    (f) => f.enabled && !builtInKeys.has(normalizeFeedKey(f.url)),
  )
  return [...RSS_FEEDS, ...user]
}

/**
 * Map a feed's source name to its editorial category, for the feeds that will
 * actually be fetched. Built from the *active* feed list each call so user
 * feeds (which may carry a category) are classified the same way as built-in
 * ones.
 */
export function feedCategoryByName(
  feeds: readonly RSSFeedConfig[] = getActiveFeeds(),
): Map<string, string | undefined> {
  return new Map(feeds.map((f) => [f.name, f.category]))
}

export const useFeedStore = create<FeedState>()((set, get) => {
  /**
   * Fetch the given feeds, fold the per-feed results into the backoff state,
   * and merge the items + statuses into the store. Shared by {@link refresh}
   * (every active feed) and {@link tick} (only the feeds whose next attempt is
   * due), so the two code paths agree on exactly what "a refresh produced"
   * means. Skipped feeds' stories and statuses survive the merge (issue #25).
   */
  const runRefresh = async (feedsToFetch: RSSFeedConfig[]): Promise<void> => {
    const transport = await resolveFeedTransport()
    const activeFeeds = getActiveFeeds(useUserFeedStore.getState().userFeeds)
    const categoryByName = feedCategoryByName(activeFeeds)

    const result: FeedResult = await fetchAllFeeds(
      feedsToFetch,
      transport ? { transport } : {},
    )
    const now = new Date()
    const nowIso = now.toISOString()
    const refreshedStories = result.items.map((item) =>
      toStory(item, categoryByName.get(item.source)),
    )

    set((s) => ({
      // Stories: keep the feeds skipped this call, replace the ones fetched,
      // prune feeds the user removed.
      liveStories: mergeLiveStories(
        s.liveStories,
        refreshedStories,
        new Set(activeFeeds.map((f) => f.name)),
        new Set(feedsToFetch.map((f) => f.name)),
      ),
      // Statuses: one per active feed — refreshed feeds get their new status,
      // skipped feeds keep their previous one, removed feeds are pruned.
      feedStatuses: mergeFeedStatuses(
        s.feedStatuses,
        result.feedStatuses,
        new Set(activeFeeds.map((f) => normalizeFeedKey(f.url))),
      ),
      // Backoff: reset on success, increment on failure, skip untouched feeds.
      backoff: updateFeedBackoff(s.backoff, result.feedStatuses, now),
      failedFeeds: result.failed,
      succeededFeeds: result.succeeded,
      lastRefreshedAt: nowIso,
      isRefreshing: false,
      hasRefreshed: true,
    }))
  }

  return {
    liveStories: [],
    failedFeeds: 0,
    succeededFeeds: 0,
    feedStatuses: [],
    backoff: new Map<string, FeedBackoffState>(),
    lastRefreshedAt: null,
    isRefreshing: false,
    hasRefreshed: false,

    refresh: async () => {
      // Never run two refreshes at once — manual clicks and the poller share it.
      if (get().isRefreshing) return
      set({ isRefreshing: true })
      try {
        // Built-in feeds plus any enabled user-added feeds (issue #16). Read at
        // call time so add/remove takes effect on the next refresh.
        const activeFeeds = getActiveFeeds(useUserFeedStore.getState().userFeeds)
        // A manual Sync always fetches every active feed, regardless of backoff.
        await runRefresh(activeFeeds)
      } catch (error) {
        // fetchAllFeeds settles everything itself; this is a defensive catch so
        // the UI can never be left stuck in the "refreshing" state.
        console.error('Feed refresh failed', error)
        set((s) => ({ failedFeeds: s.succeededFeeds + s.failedFeeds, isRefreshing: false }))
      }
    },

    tick: async () => {
      if (get().isRefreshing) return
      set({ isRefreshing: true })
      try {
        const activeFeeds = getActiveFeeds(useUserFeedStore.getState().userFeeds)
        // Only the feeds whose next attempt is due now (issue #25): healthy
        // feeds stay on the base 5-minute cadence, a repeatedly-failing feed is
        // suspended for its (growing) backoff interval, and a never-attempted
        // feed is due immediately.
        const due = dueFeeds(activeFeeds, get().backoff)
        // Nothing due this tick: don't even touch the transport — the poller
        // simply does nothing until a feed becomes due again.
        if (due.length === 0) {
          set({ isRefreshing: false })
          return
        }
        await runRefresh(due)
      } catch (error) {
        console.error('Feed refresh failed', error)
        set((s) => ({ failedFeeds: s.succeededFeeds + s.failedFeeds, isRefreshing: false }))
      }
    },
  }
})

/**
 * React hook: fetches the full feed set on mount, then lets the poller
 * refresh only the feeds whose next attempt is due every
 * {@link REFRESH_INTERVAL_MS} while the tab is visible (issue #25), pausing
 * in background tabs. Bookmarks live in a separate persisted store, so
 * refreshes never disturb the saved archive.
 */
export function useFeedAutoRefresh() {
  const refresh = useFeedStore((s) => s.refresh)
  const tick = useFeedStore((s) => s.tick)

  useEffect(() => {
    // Initial fetch on mount: a full refresh so every feed is attempted once
    // (and each gets a backoff state) before the due-only polling takes over.
    // Both actions are idempotent via the isRefreshing guard, so this is safe
    // even if a manual refresh is already in flight.
    void refresh()

    // Poll on an interval; skip the tick while the tab is hidden so
    // background tabs don't hammer the upstream feeds. tick() fetches only
    // the feeds whose next attempt is due now — a healthy feed stays on the
    // base cadence, a failing feed is suspended for its (growing) backoff.
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void tick()
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [refresh, tick])
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
