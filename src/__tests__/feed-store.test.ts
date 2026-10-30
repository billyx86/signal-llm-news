import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  useUserFeedStore,
  nameFromFeedUrl,
  normalizeFeedKey,
} from '@/lib/feed-store'

const STORAGE_KEY = 'signal-user-feeds'

beforeEach(() => {
  localStorage.clear()
  useUserFeedStore.setState({ userFeeds: [] })
})

afterEach(() => {
  localStorage.clear()
  useUserFeedStore.setState({ userFeeds: [] })
})

describe('useUserFeedStore — addFeed', () => {
  it('adds a feed with a derived name when none is given', () => {
    const res = useUserFeedStore.getState().addFeed({ url: 'https://openai.com/blog/rss.xml' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.feed.name).toBe('Openai')
      expect(res.feed.enabled).toBe(true)
      expect(res.feed.url).toBe('https://openai.com/blog/rss.xml')
    }
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(1)
  })

  it('uses an explicit name when provided', () => {
    const res = useUserFeedStore
      .getState()
      .addFeed({ url: 'https://example.com/feed.xml', name: 'My Feed' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.feed.name).toBe('My Feed')
  })

  it('keeps an optional category', () => {
    const res = useUserFeedStore
      .getState()
      .addFeed({ url: 'https://example.com/feed.xml', category: 'Research' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.feed.category).toBe('Research')
  })

  it('rejects a duplicate URL (case / trailing-slash insensitive)', () => {
    useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml' })
    const dup = useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml/' })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.reason).toMatch(/already/i)
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(1)
  })

  it('rejects a non-public (SSRF) URL at the store boundary', () => {
    const res = useUserFeedStore.getState().addFeed({ url: 'http://127.0.0.1/admin' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/not allowed/i)
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(0)
  })

  it('rejects a non-http(s) scheme', () => {
    const res = useUserFeedStore.getState().addFeed({ url: 'file:///etc/passwd' })
    expect(res.ok).toBe(false)
  })

  it('rejects an empty / malformed URL', () => {
    expect(useUserFeedStore.getState().addFeed({ url: '' }).ok).toBe(false)
    expect(useUserFeedStore.getState().addFeed({ url: 'not a url' }).ok).toBe(false)
  })
})

describe('useUserFeedStore — removeFeed / toggleFeed / renameFeed', () => {
  it('removes a feed by URL', () => {
    useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml' })
    useUserFeedStore.getState().removeFeed('https://example.com/feed.xml')
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(0)
  })

  it('toggles the enabled flag', () => {
    useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml' })
    expect(useUserFeedStore.getState().userFeeds[0].enabled).toBe(true)
    useUserFeedStore.getState().toggleFeed('https://example.com/feed.xml')
    expect(useUserFeedStore.getState().userFeeds[0].enabled).toBe(false)
    useUserFeedStore.getState().toggleFeed('https://example.com/feed.xml')
    expect(useUserFeedStore.getState().userFeeds[0].enabled).toBe(true)
  })

  it('renames a feed (ignoring blank names)', () => {
    useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml' })
    useUserFeedStore.getState().renameFeed('https://example.com/feed.xml', '  ')
    expect(useUserFeedStore.getState().userFeeds[0].name).toBe('Example')
    useUserFeedStore.getState().renameFeed('https://example.com/feed.xml', 'Renamed')
    expect(useUserFeedStore.getState().userFeeds[0].name).toBe('Renamed')
  })

  it('clears all user feeds', () => {
    useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml' })
    useUserFeedStore.getState().addFeed({ url: 'https://other.com/feed.xml' })
    useUserFeedStore.getState().clearUserFeeds()
    expect(useUserFeedStore.getState().userFeeds).toHaveLength(0)
  })

  it('hasFeed reports membership by normalised URL', () => {
    useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml' })
    expect(useUserFeedStore.getState().hasFeed('https://example.com/feed.xml')).toBe(true)
    expect(useUserFeedStore.getState().hasFeed('https://example.com/feed.xml/')).toBe(true)
    expect(useUserFeedStore.getState().hasFeed('https://nope.com/feed.xml')).toBe(false)
  })
})

describe('useUserFeedStore — persistence round-trip', () => {
  it('persists user feeds to localStorage under the signal-user-feeds key', () => {
    useUserFeedStore.getState().addFeed({ url: 'https://example.com/feed.xml', name: 'X' })
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed.state.userFeeds).toHaveLength(1)
    expect(parsed.state.userFeeds[0].name).toBe('X')
  })

  it('rehydrates persisted feeds into the store (real round-trip)', async () => {
    // Reset the in-memory store first. This goes through the persist
    // middleware, so it also writes an empty array to storage.
    useUserFeedStore.setState({ userFeeds: [] })

    // Then act as a "previous session": overwrite storage with a persisted
    // state *directly* (bypassing the middleware so it is not clobbered).
    const seed = {
      state: {
        userFeeds: [
          { name: 'Persisted', url: 'https://example.com/feed.xml', enabled: true },
        ],
      },
      version: 1,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))

    // Re-run the persist middleware's rehydration from storage.
    await useUserFeedStore.persist.rehydrate()

    expect(useUserFeedStore.getState().userFeeds).toHaveLength(1)
    expect(useUserFeedStore.getState().userFeeds[0].name).toBe('Persisted')
  })
})

describe('nameFromFeedUrl', () => {
  it('derives a title-cased host name, stripping www and TLD', () => {
    expect(nameFromFeedUrl('https://openai.com/blog/rss.xml')).toBe('Openai')
    expect(nameFromFeedUrl('https://www.anthropic.com/news/rss.xml')).toBe('Anthropic')
    expect(nameFromFeedUrl('https://huggingface.co/blog/feed.xml')).toBe('Huggingface')
  })

  it('handles subdomains and separators', () => {
    expect(nameFromFeedUrl('https://sub.example-domain.com/feed.xml')).toBe('Sub Example Domain')
  })

  it('falls back to "Feed" for unparseable input', () => {
    expect(nameFromFeedUrl('not a url')).toBe('Feed')
  })
})

describe('normalizeFeedKey', () => {
  it('is case-insensitive on the host and drops trailing slashes', () => {
    expect(normalizeFeedKey('https://Example.com/feed.xml')).toBe(
      normalizeFeedKey('https://example.com/feed.xml/'),
    )
  })

  it('collapses default ports', () => {
    expect(normalizeFeedKey('http://example.com:80/feed.xml')).toBe(
      normalizeFeedKey('http://example.com/feed.xml'),
    )
    expect(normalizeFeedKey('https://example.com:443/feed.xml')).toBe(
      normalizeFeedKey('https://example.com/feed.xml'),
    )
  })

  it('preserves query strings as part of the key', () => {
    expect(normalizeFeedKey('https://example.com/feed?x=1')).not.toBe(
      normalizeFeedKey('https://example.com/feed?x=2'),
    )
  })

  it('falls back to a trimmed lowercase string for non-URLs', () => {
    expect(normalizeFeedKey('  not a url  ')).toBe('not a url')
  })
})
