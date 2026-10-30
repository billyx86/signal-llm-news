import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RSSFeedConfig } from '@/lib/rss'
import { validateFeedUrl } from '@/lib/feed-url-guard'

const STORAGE_KEY = 'signal-user-feeds'

/**
 * A feed the user adds themselves (issue #16). Same shape as the built-in
 * {@link RSSFeedConfig}, so the refresh pipeline can treat user and built-in
 * feeds identically once they are merged (see `feed.ts`).
 */
export type UserFeed = RSSFeedConfig

export type AddFeedInput = {
  name?: string
  url: string
  category?: string
}

export type AddFeedResult =
  | { ok: true; feed: UserFeed }
  | { ok: false; reason: string }

interface UserFeedState {
  userFeeds: UserFeed[]
  /**
   * Add a user feed. Validates the URL via the SSRF-safe guard, derives a
   * sensible name when none is given, and rejects duplicates (same normalised
   * URL). Returns a result the settings panel can show verbatim.
   */
  addFeed: (input: AddFeedInput) => AddFeedResult
  /** Remove a user feed by its (normalised) URL. */
  removeFeed: (url: string) => void
  /** Toggle a user feed's enabled flag, matched by URL. */
  toggleFeed: (url: string) => void
  /** Rename a user feed, matched by URL. */
  renameFeed: (url: string, name: string) => void
  clearUserFeeds: () => void
  /** The set of normalised URLs currently present (for dedupe / tests). */
  hasFeed: (url: string) => boolean
}

/**
 * Normalise a URL for dedupe: lowercase host, drop a trailing slash on the
 * path, and drop the default port. We compare on host + path + query so the
 * same feed entered slightly differently is not stored twice.
 */
export function normalizeFeedKey(url: string): string {
  try {
    const parsed = new URL(url)
    // `parsed.hostname` already excludes the port, so default-port variants
    // (`:80` / `:443`) collapse to the same key as the portless form.
    const host = parsed.hostname.toLowerCase()
    let path = parsed.pathname
    if (path.endsWith('/')) path = path.slice(0, -1)
    return `${parsed.protocol}//${host}${path}${parsed.search}`
  } catch {
    return url.trim().toLowerCase()
  }
}

/**
 * Derive a human-friendly name from a feed URL when the user did not supply
 * one: the host with a leading `www.` removed and the TLD stripped, title-cased
 * per dot/word. `https://www.openai.com/blog/rss.xml` -> `Openai`.
 */
export function nameFromFeedUrl(url: string): string {
  try {
    const host = new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/\.[a-z]{2,}$/, '')
      .replace(/[\.\-_]+/g, ' ')
    if (host === '') return 'Feed'
    return host
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  } catch {
    return 'Feed'
  }
}

export const useUserFeedStore = create<UserFeedState>()(
  persist(
    (set, get) => ({
      userFeeds: [],

      addFeed: (input) => {
        const urlRes = validateFeedUrl(input.url)
        if (!urlRes.ok) return { ok: false, reason: urlRes.reason }

        const name = (input.name ?? '').trim() || nameFromFeedUrl(urlRes.url)
        const key = normalizeFeedKey(urlRes.url)
        if (get().userFeeds.some((f) => normalizeFeedKey(f.url) === key)) {
          return { ok: false, reason: 'You already have that feed added.' }
        }

        const feed: UserFeed = {
          name,
          url: urlRes.url,
          enabled: true,
          ...(input.category ? { category: input.category } : {}),
        }
        set((s) => ({ userFeeds: [...s.userFeeds, feed] }))
        return { ok: true, feed }
      },

      removeFeed: (url) => {
        const key = normalizeFeedKey(url)
        set((s) => ({
          userFeeds: s.userFeeds.filter((f) => normalizeFeedKey(f.url) !== key),
        }))
      },

      toggleFeed: (url) => {
        const key = normalizeFeedKey(url)
        set((s) => ({
          userFeeds: s.userFeeds.map((f) =>
            normalizeFeedKey(f.url) === key ? { ...f, enabled: !f.enabled } : f,
          ),
        }))
      },

      renameFeed: (url, name) => {
        const trimmed = name.trim()
        if (trimmed === '') return
        const key = normalizeFeedKey(url)
        set((s) => ({
          userFeeds: s.userFeeds.map((f) =>
            normalizeFeedKey(f.url) === key ? { ...f, name: trimmed } : f,
          ),
        }))
      },

      clearUserFeeds: () => set({ userFeeds: [] }),

      hasFeed: (url) => {
        const key = normalizeFeedKey(url)
        return get().userFeeds.some((f) => normalizeFeedKey(f.url) === key)
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      onRehydrateStorage: () => {
        if (typeof window !== 'undefined') {
          const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY && e.newValue) {
              try {
                const parsed = JSON.parse(e.newValue)
                if (parsed.state && Array.isArray(parsed.state.userFeeds)) {
                  useUserFeedStore.setState({ userFeeds: parsed.state.userFeeds })
                }
              } catch {}
            }
          }
          window.addEventListener('storage', handleStorageChange)
          return () => window.removeEventListener('storage', handleStorageChange)
        }
      },
    },
  ),
)
