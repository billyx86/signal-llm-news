import { describe, it, expect, vi, afterEach } from 'vitest'
import { proxyFeedXml } from '@/lib/feed-proxy.server'
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
