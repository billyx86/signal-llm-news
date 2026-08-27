import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFeedStore, mergeStories, REFRESH_INTERVAL_MS } from '@/lib/feed'
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
    lastRefreshedAt: null,
    isRefreshing: false,
    hasRefreshed: false,
  })
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
    expect(state.lastRefreshedAt).toBeTruthy()
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
