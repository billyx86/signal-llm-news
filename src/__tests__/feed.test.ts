import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useFeedStore,
  mergeStories,
  classifyFeedHealth,
  getActiveFeeds,
  feedCategoryByName,
  REFRESH_INTERVAL_MS,
  backoffInterval,
  nextAttemptAt,
  isFeedDue,
  updateFeedBackoff,
  dueFeeds,
  mergeFeedStatuses,
  mergeLiveStories,
  formatBackoffInterval,
  BACKOFF_FACTOR,
  MAX_BACKOFF_STEPS,
  MAX_BACKOFF_INTERVAL_MS,
  type FeedBackoffState,
} from '@/lib/feed'
import type { FeedStatus, RSSFeedConfig } from '@/lib/rss'
import { RSS_FEEDS } from '@/lib/rss'
import { useUserFeedStore, normalizeFeedKey } from '@/lib/feed-store'
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
    backoff: new Map(),
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

describe('backoff core (issue #25)', () => {
  const failures = (n: number): FeedBackoffState => ({
    consecutiveFailures: n,
    lastAttemptAt: null,
  })

  describe('backoffInterval', () => {
    it('returns the base interval with no failures', () => {
      expect(backoffInterval(failures(0))).toBe(REFRESH_INTERVAL_MS)
    })

    it('widens by BACKOFF_FACTOR per consecutive failure', () => {
      expect(backoffInterval(failures(1))).toBe(REFRESH_INTERVAL_MS * BACKOFF_FACTOR)
      expect(backoffInterval(failures(2))).toBe(
        REFRESH_INTERVAL_MS * BACKOFF_FACTOR ** 2,
      )
    })

    it('caps at MAX_BACKOFF_INTERVAL_MS once the step budget is spent', () => {
      expect(backoffInterval(failures(MAX_BACKOFF_STEPS))).toBe(MAX_BACKOFF_INTERVAL_MS)
      // Even many more failures stay capped, not unbounded.
      expect(backoffInterval(failures(MAX_BACKOFF_STEPS + 10))).toBe(MAX_BACKOFF_INTERVAL_MS)
    })

    it('treats a negative failure count as zero', () => {
      expect(backoffInterval(failures(-5))).toBe(REFRESH_INTERVAL_MS)
    })

    it('honours an injected base interval', () => {
      expect(backoffInterval(failures(1), 60_000)).toBe(60_000 * BACKOFF_FACTOR)
    })
  })

  describe('nextAttemptAt', () => {
    it('is null when the feed has never been attempted', () => {
      expect(nextAttemptAt(null, failures(1))).toBeNull()
    })

    it('is null for an unparseable timestamp', () => {
      expect(
        nextAttemptAt('not-a-date', failures(1)),
      ).toBeNull()
    })

    it('adds the backoff interval to the last attempt', () => {
      const last = '2026-10-22T00:00:00.000Z'
      expect(nextAttemptAt(last, failures(0))).toBe(
        Date.parse(last) + REFRESH_INTERVAL_MS,
      )
      expect(nextAttemptAt(last, failures(1))).toBe(
        Date.parse(last) + REFRESH_INTERVAL_MS * BACKOFF_FACTOR,
      )
    })
  })

  describe('isFeedDue', () => {
    const last = '2026-10-22T00:00:00.000Z'
    const now = Date.parse(last)

    it('is due immediately when never attempted', () => {
      expect(isFeedDue(failures(0), now)).toBe(true)
    })

    it('is not due before its next attempt time', () => {
      const state = { consecutiveFailures: 1, lastAttemptAt: last }
      // 1s before the widened next-attempt → still suspended.
      expect(isFeedDue(state, now + REFRESH_INTERVAL_MS * BACKOFF_FACTOR - 1)).toBe(false)
    })

    it('is due at or past its next attempt time', () => {
      const state = { consecutiveFailures: 1, lastAttemptAt: last }
      expect(isFeedDue(state, now + REFRESH_INTERVAL_MS * BACKOFF_FACTOR)).toBe(true)
      expect(isFeedDue(state, now + REFRESH_INTERVAL_MS * BACKOFF_FACTOR + 5_000)).toBe(true)
    })

    it('a healthy feed (0 failures) is due after the base interval', () => {
      const state = { consecutiveFailures: 0, lastAttemptAt: last }
      expect(isFeedDue(state, now + REFRESH_INTERVAL_MS - 1)).toBe(false)
      expect(isFeedDue(state, now + REFRESH_INTERVAL_MS)).toBe(true)
    })
  })

  describe('updateFeedBackoff', () => {
    const key = (url: string) => normalizeFeedKey(url)
    const okStatus = (url: string): FeedStatus => ({
      name: 'Feed', url, ok: true, status: 200, reason: null, itemCount: 1,
      fetchedAt: '2026-10-22T01:00:00.000Z',
    })
    const errStatus = (url: string): FeedStatus => ({
      name: 'Feed', url, ok: false, status: 404, reason: 'HTTP 404', itemCount: 0,
      fetchedAt: '2026-10-22T01:00:00.000Z',
    })
    const at = new Date('2026-10-22T01:00:00.000Z')

    it('resets a feed to zero failures on success', () => {
      const prev = new Map([[key('https://a.com/rss'), failures(3)]])
      const next = updateFeedBackoff(prev, [okStatus('https://a.com/rss')], at)
      expect(next.get(key('https://a.com/rss'))).toMatchObject({ consecutiveFailures: 0 })
    })

    it('increments a feed on failure', () => {
      const prev = new Map([[key('https://a.com/rss'), failures(2)]])
      const next = updateFeedBackoff(prev, [errStatus('https://a.com/rss')], at)
      expect(next.get(key('https://a.com/rss'))).toMatchObject({ consecutiveFailures: 3 })
    })

    it('starts a never-seen failing feed at one failure', () => {
      const next = updateFeedBackoff(new Map(), [errStatus('https://b.com/rss')], at)
      expect(next.get(key('https://b.com/rss'))).toMatchObject({ consecutiveFailures: 1 })
    })

    it('records the attempt time', () => {
      const next = updateFeedBackoff(new Map(), [okStatus('https://a.com/rss')], at)
      expect(next.get(key('https://a.com/rss'))?.lastAttemptAt).toBe(at.toISOString())
    })

    it('carries through feeds that were not fetched this tick', () => {
      const prev = new Map([
        [key('https://skipped.com/rss'), failures(2)],
        [key('https://a.com/rss'), failures(1)],
      ])
      const next = updateFeedBackoff(prev, [okStatus('https://a.com/rss')], at)
      // Skipped feed untouched.
      expect(next.get(key('https://skipped.com/rss'))).toMatchObject({
        consecutiveFailures: 2,
        lastAttemptAt: null,
      })
      // Fetched feed reset.
      expect(next.get(key('https://a.com/rss'))).toMatchObject({ consecutiveFailures: 0 })
    })

    it('does not mutate the previous map', () => {
      const prev = new Map([[key('https://a.com/rss'), failures(2)]])
      const before = prev.get(key('https://a.com/rss'))
      updateFeedBackoff(prev, [errStatus('https://a.com/rss')], at)
      expect(prev.get(key('https://a.com/rss'))).toBe(before)
      expect(prev.get(key('https://a.com/rss'))?.consecutiveFailures).toBe(2)
    })
  })

  describe('dueFeeds', () => {
    const feeds = [
      { name: 'A', url: 'https://a.com/rss', enabled: true },
      { name: 'B', url: 'https://b.com/rss', enabled: true },
    ] as RSSFeedConfig[]
    const key = (url: string) => normalizeFeedKey(url)
    const now = Date.now()

    it('includes a feed with no backoff state (never attempted)', () => {
      expect(dueFeeds(feeds, new Map(), now).map((f) => f.name)).toEqual(['A', 'B'])
    })

    it('excludes a feed suspended in its backoff window', () => {
      // B failed moments ago with a high count → next attempt far in the future.
      const backoff = new Map<string, FeedBackoffState>([
        [key(feeds[1].url), { consecutiveFailures: 3, lastAttemptAt: new Date(now).toISOString() }],
      ])
      expect(dueFeeds(feeds, backoff, now).map((f) => f.name)).toEqual(['A'])
    })

    it('includes a feed whose backoff window has elapsed', () => {
      const dueAgo = new Date(now - MAX_BACKOFF_INTERVAL_MS - 1000).toISOString()
      const backoff = new Map<string, FeedBackoffState>([
        [key(feeds[0].url), { consecutiveFailures: 3, lastAttemptAt: dueAgo }],
        [key(feeds[1].url), { consecutiveFailures: 3, lastAttemptAt: new Date(now).toISOString() }],
      ])
      expect(dueFeeds(feeds, backoff, now).map((f) => f.name)).toEqual(['A'])
    })
  })

  describe('mergeFeedStatuses (issue #25)', () => {
    const mk = (name: string, url: string, ok: boolean): FeedStatus => ({
      name, url, ok, status: ok ? 200 : 404, reason: ok ? null : 'HTTP 404',
      itemCount: ok ? 2 : 0, fetchedAt: '2026-10-22T01:00:00.000Z',
    })
    const a = mk('A', 'https://a.com/rss', true)
    const b = mk('B', 'https://b.com/rss', false)

    it('updates a re-fetched feed and keeps a skipped feed', () => {
      const active = new Set([normalizeFeedKey('https://a.com/rss'), normalizeFeedKey('https://b.com/rss')])
      const merged = mergeFeedStatuses([a, b], [{ ...a, ok: false, reason: 'HTTP 404', status: 404 }], active)
      expect(merged).toHaveLength(2)
      const byUrl = Object.fromEntries(merged.map((s) => [s.url, s]))
      expect(byUrl['https://a.com/rss'].ok).toBe(false) // updated
      expect(byUrl['https://b.com/rss'].ok).toBe(false) // carried through
    })

    it('prunes statuses for feeds no longer active', () => {
      const active = new Set([normalizeFeedKey('https://a.com/rss')])
      const merged = mergeFeedStatuses([a, b], [], active)
      expect(merged.map((s) => s.url)).toEqual(['https://a.com/rss'])
    })
  })

  describe('mergeLiveStories (issue #25)', () => {
    const names = RSS_FEEDS.map((f) => f.name)
    const active = new Set(names)
    const storyFor = (name: string, title: string, at: string): Story =>
      makeStory({ id: `rss:${title}`, title, source: name, publishedAt: at })

    it('keeps stories from feeds skipped this tick, replaces the ones fetched', () => {
      const prev = names.map((n) => storyFor(n, `${n}-old`, '2026-08-20T00:00:00.000Z'))
      const refreshed = [storyFor('OpenAI Blog', 'OpenAI Blog-new', '2026-08-27T00:00:00.000Z')]
      const fetched = new Set(['OpenAI Blog'])
      const merged = mergeLiveStories(prev, refreshed, active, fetched)

      // The 3 non-fetched feeds survive, openai's old item is replaced.
      expect(merged).toHaveLength(4)
      const openai = merged.filter((s) => s.source === 'OpenAI Blog')
      expect(openai).toHaveLength(1)
      expect(openai[0].title).toBe('OpenAI Blog-new')
      for (const n of names.filter((n) => n !== 'OpenAI Blog')) {
        expect(merged.find((s) => s.source === n)?.title).toBe(`${n}-old`)
      }
    })

    it('drops an item a re-fetched feed no longer returns (no stale union)', () => {
      const prev = [
        storyFor('OpenAI Blog', 'dropped', '2026-08-20T00:00:00.000Z'),
        storyFor('OpenAI Blog', 'kept', '2026-08-20T00:00:00.000Z'),
      ]
      // The feed returns only "kept" this time.
      const refreshed = [storyFor('OpenAI Blog', 'kept', '2026-08-20T00:00:00.000Z')]
      const merged = mergeLiveStories(prev, refreshed, active, new Set(['OpenAI Blog']))
      expect(merged.map((s) => s.title)).toEqual(['kept'])
    })

    it('prunes stories for feeds the user removed', () => {
      const prev = [
        storyFor('OpenAI Blog', 'a', '2026-08-20T00:00:00.000Z'),
        storyFor('Removed Feed', 'gone', '2026-08-20T00:00:00.000Z'),
      ]
      const merged = mergeLiveStories(prev, [], active, new Set())
      expect(merged.map((s) => s.title)).toEqual(['a'])
    })

    it('re-sorts newest first across kept and fresh stories', () => {
      const prev = [storyFor('Anthropic Blog', 'old', '2026-08-01T00:00:00.000Z')]
      const refreshed = [storyFor('OpenAI Blog', 'new', '2026-08-27T00:00:00.000Z')]
      const merged = mergeLiveStories(prev, refreshed, active, new Set(['OpenAI Blog']))
      expect(merged.map((s) => s.title)).toEqual(['new', 'old'])
    })
  })

  describe('formatBackoffInterval (issue #25)', () => {
    it('renders minutes under an hour as Xm', () => {
      expect(formatBackoffInterval(5 * 60_000)).toBe('5m')
      expect(formatBackoffInterval(45 * 60_000)).toBe('45m')
    })
    it('renders an hour or more as whole hours', () => {
      expect(formatBackoffInterval(60 * 60_000)).toBe('1h')
      // 135m ≈ 2h15m rounds to 2h.
      expect(formatBackoffInterval(MAX_BACKOFF_INTERVAL_MS)).toBe('2h')
    })
  })
})

describe('useFeedStore.tick (issue #25)', () => {
  const key = (url: string) => normalizeFeedKey(url)
  const openaiUrl = RSS_FEEDS[0].url

  it('fetches only the feeds whose next attempt is due and preserves the rest', async () => {
    // Seed statuses for all 4 feeds so we can tell updated from carried.
    const seedStatus = (feed: RSSFeedConfig): FeedStatus => ({
      name: feed.name, url: feed.url, ok: true, status: 200, reason: null,
      itemCount: 0, fetchedAt: new Date().toISOString(),
    })
    // Only openai is due (never attempted). The other three are suspended
    // (failed moments ago with a high count → next attempt far in the future).
    const backoff = new Map<string, FeedBackoffState>()
    for (const feed of RSS_FEEDS.slice(1)) {
      backoff.set(key(feed.url), {
        consecutiveFailures: 3,
        lastAttemptAt: new Date().toISOString(),
      })
    }
    useFeedStore.setState({
      feedStatuses: RSS_FEEDS.map(seedStatus),
      backoff,
    })

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('openai')) {
        return new Response(
          `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Due feed item</title>
    <link>https://openai.com/due</link>
    <description>Only this feed was fetched.</description>
    <pubDate>Wed, 27 Aug 2026 01:00:00 GMT</pubDate>
  </item>
</channel></rss>`,
          { status: 200 },
        )
      }
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeedStore.getState().tick()

    // Exactly one request: the single due feed.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('openai')

    const state = useFeedStore.getState()
    // The due feed's item is live and its backoff reset to zero.
    expect(state.liveStories.find((s) => s.title === 'Due feed item')).toBeDefined()
    expect(state.backoff.get(key(openaiUrl))).toMatchObject({ consecutiveFailures: 0 })
    // Skipped feeds' backoff is untouched (still suspended at 3 failures).
    for (const feed of RSS_FEEDS.slice(1)) {
      expect(state.backoff.get(key(feed.url))).toMatchObject({ consecutiveFailures: 3 })
    }
    // Skipped feeds' statuses survived (not wiped, not re-fetched).
    expect(state.feedStatuses).toHaveLength(RSS_FEEDS.length)
    expect(state.feedStatuses.find((s) => s.url === openaiUrl)).toMatchObject({ ok: true })
  })

  it('does nothing when no feed is due', async () => {
    const backoff = new Map<string, FeedBackoffState>()
    for (const feed of RSS_FEEDS) {
      backoff.set(key(feed.url), {
        consecutiveFailures: 3,
        lastAttemptAt: new Date().toISOString(),
      })
    }
    const prevStatuses: FeedStatus[] = RSS_FEEDS.map((f) => ({
      name: f.name, url: f.url, ok: true, status: 200, reason: null, itemCount: 0,
      fetchedAt: new Date().toISOString(),
    }))
    useFeedStore.setState({ feedStatuses: prevStatuses, backoff })

    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeedStore.getState().tick()

    expect(fetchMock).not.toHaveBeenCalled()
    // State untouched: still suspended, statuses intact.
    const state = useFeedStore.getState()
    expect(state.isRefreshing).toBe(false)
    expect(state.feedStatuses).toHaveLength(RSS_FEEDS.length)
    for (const feed of RSS_FEEDS) {
      expect(state.backoff.get(key(feed.url))).toMatchObject({ consecutiveFailures: 3 })
    }
  })

  it('a full refresh() always fetches every feed and resets healthy backoff', async () => {
    // Pre-suspend one feed, then a manual Sync must still fetch it.
    useFeedStore.setState({
      backoff: new Map([[key(openaiUrl), { consecutiveFailures: 3, lastAttemptAt: new Date().toISOString() }]]),
    })
    const fetchMock = vi.fn(async () => new Response('<rss version="2.0"><channel></channel></rss>', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await useFeedStore.getState().refresh()

    // Manual sync ignores backoff → all 4 built-ins fetched.
    expect(fetchMock).toHaveBeenCalledTimes(RSS_FEEDS.length)
    expect(useFeedStore.getState().backoff.get(key(openaiUrl))).toMatchObject({ consecutiveFailures: 0 })
  })
})
