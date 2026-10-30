import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useFeedStore,
  mergeStories,
  classifyFeedHealth,
  getActiveFeeds,
  feedCategoryByName,
  REFRESH_INTERVAL_MS,
} from '@/lib/feed'
import type { FeedStatus } from '@/lib/rss'
import { RSS_FEEDS } from '@/lib/rss'
import { useUserFeedStore } from '@/lib/feed-store'
import { stories, type Story } from '@/data/news'

function makeStory(overrides: Partial<Story> & { id: string }): Story {
  return {
    title: 'Title',
    summary: 'Summary',
    body: 'Body',
    topic: 'Industry',
    source: 'Test Source',
    sourceUrl: 'https://example.com',
    author: 'Author',
    publishedAt: '2026-08-26T12:00:00.000Z',
    readTime: 3,
    ...overrides,
  }
}

beforeEach(() => {
  useFeedStore.setState({
    liveStories: [],
    failedFeeds: 0,
    succeededFeeds: 0,
    feedStatuses: [],
    lastRefreshedAt: null,
    isRefreshing: false,
    hasRefreshed: false,
  })
  // Start each test with no user-added feeds so the built-in-only assertions
  // below are deterministic, and so a feed added in one test cannot leak into
  // the next.
  useUserFeedStore.setState({ userFeeds: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mergeStories', () => {
  it('returns the base list unchanged when there are no live stories', () => {
    expect(mergeStories(stories, [])).toBe(stories)
  })

  it('prepends live stories and dedupes by id', () => {
    const live = [
      makeStory({ id: 'rss:a', publishedAt: '2026-08-27T00:00:00.000Z' }),
      makeStory({ id: stories[0].id, publishedAt: '2026-08-27T00:00:00.000Z' }),
    ]
    const merged = mergeStories(stories, live)
    const ids = merged.map((s) => s.id)
    expect(ids.filter((id) => id === stories[0].id)).toHaveLength(1)
    expect(ids).toContain('rss:a')
  })

  it('orders by publishedAt descending', () => {
    const live = [
      makeStory({ id: 'rss:old', publishedAt: '2026-01-01T00:00:00.000Z' }),
      makeStory({ id: 'rss:new', publishedAt: '2026-08-27T00:00:00.000Z' }),
    ]
    const merged = mergeStories([], live)
    expect(merged[0].id).toBe('rss:new')
    expect(merged[merged.length - 1].id).toBe('rss:old')
  })
})

describe('useFeedStore.refresh', () => {
  it('stores live stories from successful feeds and records the refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('openai')) {
          return new Response(
            `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Live item</title>
    <link>https://openai.com/live</link>
    <description>Just happened.</description>
    <pubDate>Wed, 27 Aug 2026 01:00:00 GMT</pubDate>
  </item>
</channel></rss>`,
            { status: 200 },
          )
        }
        throw new TypeError('Failed to fetch')
      }),
    )

    await useFeedStore.getState().refresh()

    const state = useFeedStore.getState()
    expect(state.hasRefreshed).toBe(true)
    expect(state.isRefreshing).toBe(false)
    expect(state.liveStories.length).toBeGreaterThan(0)
    expect(state.liveStories[0].title).toBe('Live item')
    expect(state.liveStories[0].source).toBe('OpenAI Blog')
    expect(state.liveStories[0].topic).toBe('Models')
    expect(state.liveStories[0].id).toBe('rss:https://openai.com/live')
    expect(state.succeededFeeds).toBe(1)
    expect(state.failedFeeds).toBeGreaterThanOrEqual(1)
    expect(state.feedStatuses).toHaveLength(4)
    const openai = state.feedStatuses.find((s) => s.name === 'OpenAI Blog')
    expect(openai).toMatchObject({ ok: true, itemCount: 1, reason: null })
    expect(state.feedStatuses.find((s) => s.name === 'Anthropic Blog')?.ok).toBe(false)
    expect(state.lastRefreshedAt).toBeTruthy()
  })

  it('threads per-feed status (name, ok, reason, status) into feedStatuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('openai')) {
          return new Response('<rss version="2.0"><channel></channel></rss>', { status: 200 })
        }
        if (String(url).includes('anthropic')) {
          return new Response('nope', { status: 404 })
        }
        if (String(url).includes('huggingface')) {
          return new Response('upstream down', { status: 503 })
        }
        throw new TypeError('Failed to fetch')
      }),
    )

    await useFeedStore.getState().refresh()

    const byName = Object.fromEntries(
      useFeedStore.getState().feedStatuses.map((s) => [s.name, s]),
    )
    expect(byName['OpenAI Blog']).toMatchObject({ ok: true, status: 200, reason: null })
    expect(byName['Anthropic Blog']).toMatchObject({ ok: false, status: 404, reason: 'HTTP 404' })
    expect(byName['Hugging Face Blog']).toMatchObject({
      ok: false,
      status: 503,
      reason: 'HTTP 503',
    })
    expect(byName['DeepMind Blog']).toMatchObject({ ok: false, status: null, reason: 'network' })
  })

  it('never stacks concurrent refreshes', async () => {
    // Every fetch hangs until we resolve it, so we can observe which refresh
    // actually issued requests.
    const resolvers: Array<(r: Response) => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve)
          }),
      ),
    )

    const first = useFeedStore.getState().refresh()
    await new Promise((r) => setTimeout(r, 5))
    expect(resolvers.length).toBe(4) // first refresh fanned out to all feeds

    // A second refresh started mid-flight must be a no-op.
    const second = useFeedStore.getState().refresh()
    await new Promise((r) => setTimeout(r, 5))
    expect(resolvers.length).toBe(4) // no new requests were issued

    resolvers.forEach((resolve) =>
      resolve(new Response('<rss version="2.0"><channel></channel></rss>', { status: 200 })),
    )
    await first
    await second

    expect(useFeedStore.getState().isRefreshing).toBe(false)
    expect(useFeedStore.getState().hasRefreshed).toBe(true)
  })

  it('exposes a 5-minute polling interval constant', () => {
    expect(REFRESH_INTERVAL_MS).toBe(5 * 60 * 1000)
  })
})

describe('getActiveFeeds', () => {
  it('returns only the built-in feeds when the user list is empty', () => {
    expect(getActiveFeeds([])).toEqual(RSS_FEEDS)
  })

  it('appends enabled user feeds to the built-in list', () => {
    const userFeeds = [
      { name: 'My Feed', url: 'https://myblog.example/rss.xml', enabled: true },
    ]
    const active = getActiveFeeds(userFeeds)
    expect(active).toHaveLength(RSS_FEEDS.length + 1)
    expect(active[active.length - 1]).toMatchObject({
      name: 'My Feed',
      url: 'https://myblog.example/rss.xml',
    })
  })

  it('excludes disabled user feeds', () => {
    const userFeeds = [
      { name: 'Off', url: 'https://off.example/rss.xml', enabled: false },
      { name: 'On', url: 'https://on.example/rss.xml', enabled: true },
    ]
    const active = getActiveFeeds(userFeeds)
    expect(active).toHaveLength(RSS_FEEDS.length + 1)
    expect(active.map((f) => f.name)).not.toContain('Off')
    expect(active.map((f) => f.name)).toContain('On')
  })

  it('dedupes a user feed that matches a built-in feed URL', () => {
    const builtInUrl = RSS_FEEDS[0].url
    const userFeeds = [
      { name: 'Duplicate', url: builtInUrl, enabled: true },
    ]
    // Normalisation must treat the same URL (even with a trailing slash) as a
    // duplicate so we do not fetch the built-in feed twice.
    const active = getActiveFeeds(userFeeds)
    expect(active).toHaveLength(RSS_FEEDS.length)
  })

  it('dedupes a user feed that differs only by trailing slash / host case', () => {
    const builtIn = RSS_FEEDS[0]
    const url = new URL(builtIn.url)
    url.hostname = url.hostname.toUpperCase()
    url.pathname = url.pathname.replace(/\/$/, '') + '/'
    const userFeeds = [{ name: 'Case Dup', url: url.toString(), enabled: true }]
    expect(getActiveFeeds(userFeeds)).toHaveLength(RSS_FEEDS.length)
  })
})

describe('feedCategoryByName', () => {
  it('maps built-in feed names to their categories', () => {
    const map = feedCategoryByName()
    for (const feed of RSS_FEEDS) {
      expect(map.get(feed.name)).toBe(feed.category)
    }
  })

  it('includes user feed categories in the map', () => {
    const userFeeds = [
      { name: 'Research Feed', url: 'https://research.example/rss.xml', enabled: true, category: 'Research' },
    ]
    const map = feedCategoryByName(getActiveFeeds(userFeeds))
    expect(map.get('Research Feed')).toBe('Research')
  })
})

describe('useFeedStore.refresh — user feeds (issue #16)', () => {
  const USER_FEED_URL = 'https://myblog.example/rss.xml'

  it('fetches a user-added feed and surfaces its items under the right topic', async () => {
    useUserFeedStore
      .getState()
      .addFeed({ url: USER_FEED_URL, name: 'My Blog', category: 'Research' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('openai')) {
          return new Response(
            `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>OpenAI item</title>
    <link>https://openai.com/live</link>
    <description>OpenAI news.</description>
    <pubDate>Wed, 27 Aug 2026 01:00:00 GMT</pubDate>
  </item>
</channel></rss>`,
            { status: 200 },
          )
        }
        if (String(url).includes('myblog.example')) {
          return new Response(
            `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>User feed item</title>
    <link>https://myblog.example/post</link>
    <description>A post from the user's own blog.</description>
    <pubDate>Wed, 27 Aug 2026 02:00:00 GMT</pubDate>
  </item>
</channel></rss>`,
            { status: 200 },
          )
        }
        throw new TypeError('Failed to fetch')
      }),
    )

    await useFeedStore.getState().refresh()

    const state = useFeedStore.getState()
    // 4 built-in + 1 user feed.
    expect(state.feedStatuses).toHaveLength(RSS_FEEDS.length + 1)
    expect(state.succeededFeeds).toBe(2)

    const userStatus = state.feedStatuses.find((s) => s.name === 'My Blog')
    expect(userStatus).toMatchObject({ ok: true, itemCount: 1, reason: null })

    const userStory = state.liveStories.find((s) => s.source === 'My Blog')
    expect(userStory).toBeDefined()
    expect(userStory?.title).toBe('User feed item')
    // The user feed's category maps to the Research topic.
    expect(userStory?.topic).toBe('Research')
  })

  it('does not fetch a user feed the user has disabled', async () => {
    const res = useUserFeedStore
      .getState()
      .addFeed({ url: USER_FEED_URL, name: 'My Blog' })
    if (!res.ok) throw new Error(res.reason)
    useUserFeedStore.getState().toggleFeed(USER_FEED_URL)

    const fetchMock = vi.fn(async (_url: string) => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeedStore.getState().refresh()

    // No request should have gone out for the disabled user feed.
    const calledForUserFeed = fetchMock.mock.calls.some(([u]) =>
      String(u).includes('myblog.example'),
    )
    expect(calledForUserFeed).toBe(false)
    expect(useFeedStore.getState().feedStatuses).toHaveLength(RSS_FEEDS.length)
  })

  it('drops a user feed from the next refresh after it is removed', async () => {
    const res = useUserFeedStore
      .getState()
      .addFeed({ url: USER_FEED_URL, name: 'My Blog' })
    if (!res.ok) throw new Error(res.reason)

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('myblog.example')) {
        return new Response('<rss version="2.0"><channel></channel></rss>', { status: 200 })
      }
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeedStore.getState().refresh()
    expect(useFeedStore.getState().feedStatuses).toHaveLength(RSS_FEEDS.length + 1)

    useUserFeedStore.getState().removeFeed(USER_FEED_URL)
    await useFeedStore.getState().refresh()
    expect(useFeedStore.getState().feedStatuses).toHaveLength(RSS_FEEDS.length)
  })
})

describe('classifyFeedHealth', () => {
  const now = Date.parse('2026-10-22T03:00:00.000Z')
  const status = (over: Partial<FeedStatus>): FeedStatus => ({
    name: 'Feed',
    url: 'https://example.com/rss',
    ok: true,
    status: 200,
    reason: null,
    itemCount: 3,
    fetchedAt: new Date(now).toISOString(),
    ...over,
  })

  it('classifies a recent successful fetch as ok', () => {
    expect(classifyFeedHealth(status({ fetchedAt: new Date(now - 60_000).toISOString() }), now)).toBe('ok')
  })

  it('classifies any errored fetch as failed regardless of age', () => {
    expect(classifyFeedHealth(status({ ok: false, reason: 'HTTP 404', status: 404 }), now)).toBe('failed')
    expect(classifyFeedHealth(status({ ok: false, reason: 'timeout' }), now)).toBe('failed')
    expect(classifyFeedHealth(status({ ok: false, reason: 'network', status: null }), now)).toBe('failed')
  })

  it('classifies an old but successful fetch as stale', () => {
    const stale = status({ fetchedAt: new Date(now - 2 * REFRESH_INTERVAL_MS - 1).toISOString() })
    expect(classifyFeedHealth(stale, now)).toBe('stale')
  })

  it('keeps a successful fetch within the stale window as ok', () => {
    const fresh = status({ fetchedAt: new Date(now - 2 * REFRESH_INTERVAL_MS + 1000).toISOString() })
    expect(classifyFeedHealth(fresh, now)).toBe('ok')
  })

  it('lets callers override the stale window', () => {
    const stale = status({ fetchedAt: new Date(now - 60_000).toISOString() })
    expect(classifyFeedHealth(stale, now, 30_000)).toBe('stale')
  })
})
