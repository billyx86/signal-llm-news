import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getActiveFeeds } from '@/lib/feed'
import type { UserFeed } from '@/lib/feed-store'

const KEY = 'signal-user-feeds'

// Deliberately NOT any built-in feed URL, so `getActiveFeeds` (which always
// returns the built-ins plus user feeds) reflects only the user feed we add.
const USER_FEED_URL = 'https://example.com/feed.xml'

/**
 * Simulate the browser notifying the *current* tab that another tab wrote to
 * localStorage. A real second tab can't be spawned in jsdom, so two
 * independent store instances (via `vi.resetModules()` + dynamic import) stand
 * in for the two tabs; a `StorageEvent` dispatched on `window` is what a real
 * browser delivers to every *other* open document for the same key.
 */
function fireStorageSyncFrom(newValue: string | null): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: KEY,
      newValue,
      oldValue: null,
      url: '',
      storageArea: localStorage,
    }),
  )
}

async function freshFeedStore() {
  // A re-imported module gets a fresh store AND a fresh module-scope storage
  // listener (the fix for #22). Two of these = two simulated tabs.
  vi.resetModules()
  const mod = await import('@/lib/feed-store')
  return mod.useUserFeedStore
}

/** Is our user feed currently part of the fetch set? */
function fetchesUserFeed(userFeeds: readonly UserFeed[]): boolean {
  return getActiveFeeds(userFeeds).some((f) => f.url === USER_FEED_URL)
}

describe('user-feeds cross-tab sync (issue #22)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('a feed added in tab A is picked up by tab B on its next refresh, no reload', async () => {
    const tabA = await freshFeedStore()
    const tabB = await freshFeedStore()

    // Sanity: they are distinct documents (distinct store instances).
    expect(tabA).not.toBe(tabB)

    // Tab A adds a feed. The persist middleware writes it to localStorage.
    const res = tabA.getState().addFeed({ url: USER_FEED_URL })
    expect(res.ok).toBe(true)
    const persisted = localStorage.getItem(KEY)
    expect(persisted).toBeTruthy()

    // Until the storage event arrives, tab B still sees its (empty) set.
    expect(fetchesUserFeed(tabB.getState().userFeeds)).toBe(false)

    // The browser notifies tab B of tab A's write.
    fireStorageSyncFrom(persisted)

    // Tab B rehydrated: its next refresh now includes the new feed, no reload.
    expect(tabB.getState().userFeeds).toHaveLength(1)
    expect(fetchesUserFeed(tabB.getState().userFeeds)).toBe(true)
  })

  it('removing a feed in tab A stops tab B from polling it on the next refresh', async () => {
    const tabA = await freshFeedStore()
    const tabB = await freshFeedStore()

    // Start both tabs in agreement with one shared feed.
    tabA.getState().addFeed({ url: USER_FEED_URL })
    fireStorageSyncFrom(localStorage.getItem(KEY))
    expect(tabB.getState().userFeeds).toHaveLength(1)
    expect(fetchesUserFeed(tabB.getState().userFeeds)).toBe(true)

    // Tab A removes it (persist writes the updated, empty set).
    tabA.getState().removeFeed(USER_FEED_URL)
    fireStorageSyncFrom(localStorage.getItem(KEY))

    // Tab B no longer polls it.
    expect(tabB.getState().userFeeds).toHaveLength(0)
    expect(fetchesUserFeed(tabB.getState().userFeeds)).toBe(false)
  })

  it('disabling a feed in tab A makes tab B stop fetching it (enabled=false)', async () => {
    const tabA = await freshFeedStore()
    const tabB = await freshFeedStore()

    tabA.getState().addFeed({ url: USER_FEED_URL })
    fireStorageSyncFrom(localStorage.getItem(KEY))
    expect(tabB.getState().userFeeds[0].enabled).toBe(true)
    expect(fetchesUserFeed(tabB.getState().userFeeds)).toBe(true)

    // Tab A disables it; sync to tab B.
    tabA.getState().toggleFeed(USER_FEED_URL)
    fireStorageSyncFrom(localStorage.getItem(KEY))

    expect(tabB.getState().userFeeds[0].enabled).toBe(false)
    // Disabled feeds are filtered out of the fetch set.
    expect(fetchesUserFeed(tabB.getState().userFeeds)).toBe(false)
  })

  it('ignores storage events for other keys and malformed payloads', async () => {
    const tabA = await freshFeedStore()
    const tabB = await freshFeedStore()
    tabA.getState().addFeed({ url: USER_FEED_URL })

    // A different key must not touch the feed store.
    fireStorageOtherKey()
    expect(tabB.getState().userFeeds).toHaveLength(0)

    // A malformed payload on the right key must be ignored, not crash.
    fireStorageSyncFrom('this is not json')
    expect(tabB.getState().userFeeds).toHaveLength(0)

    // A well-formed write still works afterwards.
    fireStorageSyncFrom(localStorage.getItem(KEY))
    expect(tabB.getState().userFeeds).toHaveLength(1)
  })
})

function fireStorageOtherKey(): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'signal-bookmarks',
      newValue: '{"state":{"bookmarks":["x"]},"version":1}',
      oldValue: null,
      url: '',
      storageArea: localStorage,
    }),
  )
}
