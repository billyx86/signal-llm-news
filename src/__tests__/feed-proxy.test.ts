import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  proxyFeedXml,
  clearFeedCache,
  feedCacheStats,
  FEED_CACHE_TTL_MS,
} from '@/lib/feed-proxy.server'
import {
  RSS_FEEDS,
  fetchAllFeeds,
  type FeedTransportResponse,
} from '@/lib/rss'

const OPENAI = 'https://openai.com/blog/rss.xml'
const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Server-side item</title>
    <link>https://openai.com/1</link>
    <description>Fetched on the server.</description>
    <pubDate>Wed, 27 Aug 2026 01:00:00 GMT</pubDate>
  </item>
</channel></rss>`

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearFeedCache()
})

describe('proxyFeedXml (server-side, SSRF-allowlisted)', () => {
  it('fetches an allowlisted feed server-side and returns the raw XML', async () => {
    const fetchMock = vi.fn(async () => new Response(SAMPLE, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await proxyFeedXml(OPENAI)

    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(res.body).toBe(SAMPLE)
    // The upstream URL is the allowlisted one, with an abort timeout signal.
    expect(fetchMock).toHaveBeenCalledWith(
      OPENAI,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('rejects a non-allowlisted URL and never issues a network request (SSRF guard)', async () => {
    const fetchMock = vi.fn(async () => new Response('secret', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await proxyFeedXml('http://169.254.169.254/latest/meta-data')

    expect(res.ok).toBe(false)
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a non-2xx upstream status as a per-feed failure', async () => {
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 500 }))

    const res = await proxyFeedXml(OPENAI)

    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(res.body).toBe('boom')
  })

  it('maps an upstream network failure to a synthetic 502', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })

    const res = await proxyFeedXml(OPENAI)

    expect(res.ok).toBe(false)
    expect(res.status).toBe(502)
    expect(res.body).toBe('Upstream feed fetch failed.')
  })
})

describe('feed proxy cache + ETag revalidation (issue #17)', () => {
  it('serves repeated calls within the TTL from the cache — fetch is not called again', async () => {
    const fetchMock = vi.fn(async () => new Response(SAMPLE, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await proxyFeedXml(OPENAI)
    const second = await proxyFeedXml(OPENAI)
    const third = await proxyFeedXml(OPENAI)

    expect(first.fromCache).toBeUndefined()
    expect(second.fromCache).toBe(true)
    expect(second.body).toBe(SAMPLE)
    expect(third.fromCache).toBe(true)
    // Only the very first call touched the network.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // The hit/miss counters expose the same behaviour.
    expect(feedCacheStats().hits).toBe(2)
    expect(feedCacheStats().misses).toBe(1)
  })

  it('after the TTL expires, revalidates with If-None-Match and reuses the cached body on 304', async () => {
    let fakeNow = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(SAMPLE, {
          status: 200,
          headers: { etag: '"abc123"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await proxyFeedXml(OPENAI)
    expect(first.fromCache).toBeUndefined()

    // Expire the TTL, then call again.
    fakeNow += FEED_CACHE_TTL_MS + 1
    const second = await proxyFeedXml(OPENAI)

    expect(second.ok).toBe(true)
    expect(second.status).toBe(200)
    expect(second.body).toBe(SAMPLE)
    expect(second.fromCache).toBe(true)
    // Two network calls: the initial fetch + the revalidation.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The revalidation request carried the cached ETag.
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ headers: { 'If-None-Match': '"abc123"' } }),
    )

    // Restore the real clock; the real Date.now (not the spy) works again.
    vi.restoreAllMocks()
    expect(typeof Date.now()).toBe('number')
  })

  it('does not cache a non-2xx response — the next call hits the network again', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(SAMPLE, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const failed = await proxyFeedXml(OPENAI)
    expect(failed.ok).toBe(false)
    expect(failed.status).toBe(500)

    // A failed fetch must not shadow the retry.
    const retried = await proxyFeedXml(OPENAI)
    expect(retried.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still rejects non-allowlisted URLs without touching the network or the cache', async () => {
    const fetchMock = vi.fn(async () => new Response('secret', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await proxyFeedXml('http://127.0.0.1/admin')

    expect(res.ok).toBe(false)
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(feedCacheStats().entries).toBe(0)
  })
})

describe('feed pipeline transport plumbing', () => {
  it('fetchAllFeeds honours a caller-supplied transport instead of global fetch', async () => {
    // The transport is what the server proxy would hand back; global fetch is
    // deliberately left unstubbed so the test proves it is NOT the source.
    const transport = vi.fn(async (url: string): Promise<FeedTransportResponse> => {
      if (url === OPENAI) {
        return { ok: true, status: 200, text: () => Promise.resolve(SAMPLE) }
      }
      return { ok: false, status: 404, text: () => Promise.resolve('not found') }
    })

    const result = await fetchAllFeeds(RSS_FEEDS, { transport })

    // Only the allowlisted OpenAI feed succeeds; the rest are reported failed.
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(RSS_FEEDS.length - 1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].source).toBe('OpenAI Blog')
    // The transport was used for every enabled feed (not the global fetch).
    expect(transport).toHaveBeenCalledTimes(RSS_FEEDS.length)
  })
})
