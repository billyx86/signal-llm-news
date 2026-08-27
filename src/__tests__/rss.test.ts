import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseRSS,
  decodeEntities,
  stripCdata,
  extractTag,
  fetchRSSFeed,
  fetchAllFeeds,
  categoryToTopic,
  RSS_FEEDS,
} from '@/lib/rss'

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <link>https://example.com</link>
    <description>A test feed</description>
    <item>
      <title><![CDATA[Breaking: <Model> ships today]]></title>
      <link>https://example.com/posts/model-launch</link>
      <description>It's a big day for &laquo;models&raquo;.</description>
      <pubDate>Tue, 26 Aug 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.com/posts/second</link>
      <description>
        <![CDATA[<p>Paragraph with <b>bold</b> text.</p>]]>
      </description>
      <pubDate>Mon, 25 Aug 2026 09:30:00 GMT</pubDate>
    </item>
    <item>
      <description>Item without title or link should be dropped</description>
    </item>
  </channel>
</rss>`

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test</title>
  <entry>
    <title>Atom entry one</title>
    <link rel="alternate" href="https://atom.example.com/one"/>
    <summary>Summary &amp; more</summary>
    <updated>2026-08-26T10:00:00Z</updated>
  </entry>
  <entry>
    <title>Atom entry two (id fallback)</title>
    <id>https://atom.example.com/two</id>
    <published>2026-08-25T08:00:00Z</published>
  </entry>
</feed>`

describe('decodeEntities', () => {
  it('decodes common named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt; c &gt; d')).toBe('a & b < c > d')
    expect(decodeEntities('&#65;&#x42;')).toBe('AB')
    expect(decodeEntities('&quot;quoted&quot; &apos;apos&apos;')).toBe('"quoted" \'apos\'')
  })
})

describe('stripCdata', () => {
  it('unwraps CDATA sections', () => {
    expect(stripCdata('<![CDATA[hello <world>]]>')).toBe('hello <world>')
  })
  it('passes through non-CDATA text', () => {
    expect(stripCdata('plain text')).toBe('plain text')
  })
})

describe('extractTag', () => {
  const singleItem = `
    <item>
      <title><![CDATA[Breaking: <Model> ships today]]></title>
      <link>https://example.com/posts/model-launch</link>
      <description>It's a big day for &laquo;models&raquo;.</description>
      <pubDate>Tue, 26 Aug 2026 12:00:00 GMT</pubDate>
    </item>`

  it('extracts tag contents with CDATA + entities from one item', () => {
    expect(extractTag(singleItem, 'title')).toBe('Breaking: <Model> ships today')
  })
  it('decodes entities in extracted text', () => {
    expect(extractTag(singleItem, 'description')).toBe("It's a big day for «models».")
  })
  it('returns null for missing tags', () => {
    expect(extractTag('<feed></feed>', 'missing')).toBeNull()
  })
})

describe('parseRSS', () => {
  it('parses RSS 2.0 items, dropping incomplete ones', () => {
    const items = parseRSS(RSS_SAMPLE, 'Test Blog')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: 'Breaking: <Model> ships today',
      link: 'https://example.com/posts/model-launch',
      source: 'Test Blog',
    })
    expect(items[0].description).toBe("It's a big day for «models».")
    expect(items[1].description).toContain('<b>bold</b>')
  })

  it('parses Atom entries with link href and id fallback', () => {
    const items = parseRSS(ATOM_SAMPLE, 'Atom Test')
    expect(items).toHaveLength(2)
    expect(items[0].link).toBe('https://atom.example.com/one')
    expect(items[0].description).toBe('Summary & more')
    expect(items[0].pubDate).toBe('2026-08-26T10:00:00Z')
    expect(items[1].link).toBe('https://atom.example.com/two')
  })

  it('returns an empty list for garbage input', () => {
    expect(parseRSS('not xml at all')).toEqual([])
    expect(parseRSS('<html><body>hi</body></html>')).toEqual([])
  })
})

describe('fetchRSSFeed', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns items on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(RSS_SAMPLE, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } })),
    )
    const items = await fetchRSSFeed('https://example.com/feed', 'Example')
    expect(items).toHaveLength(2)
    expect(items[0].source).toBe('Example')
  })

  it('returns [] on non-200 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    await expect(fetchRSSFeed('https://example.com/feed')).resolves.toEqual([])
  })

  it('returns [] when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await expect(fetchRSSFeed('https://example.com/feed')).resolves.toEqual([])
  })

  it('returns [] on abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      // Respect the abort signal like real fetch does.
      await new Promise((_, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 50)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }))
    const controller = new AbortController()
    controller.abort()
    const p = fetchRSSFeed('https://example.com/feed', 'Example', controller.signal)
    await expect(p).resolves.toEqual([])
  })
})

describe('fetchAllFeeds', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('aggregates successful feeds and counts failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('good')) {
          return new Response(RSS_SAMPLE, { status: 200 })
        }
        throw new TypeError('Failed to fetch')
      }),
    )
    const result = await fetchAllFeeds([
      { name: 'Good', url: 'https://good.example.com/rss', enabled: true },
      { name: 'Bad', url: 'https://bad.example.com/rss', enabled: true },
    ])
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.items).toHaveLength(2)
  })

  it('skips disabled feeds', async () => {
    const spy = vi.fn(async () => new Response(RSS_SAMPLE, { status: 200 }))
    vi.stubGlobal('fetch', spy)
    const result = await fetchAllFeeds([
      { name: 'Off', url: 'https://off.example.com/rss', enabled: false },
    ])
    expect(spy).not.toHaveBeenCalled()
    expect(result.items).toEqual([])
    expect(result.succeeded).toBe(0)
  })

  it('ships at least one enabled feed by default', () => {
    expect(RSS_FEEDS.some((f) => f.enabled)).toBe(true)
  })
})

describe('categoryToTopic', () => {
  it('maps known categories and defaults unknown ones to Industry', () => {
    expect(categoryToTopic('Models')).toBe('Models')
    expect(categoryToTopic('Research')).toBe('Research')
    expect(categoryToTopic('Open Source')).toBe('Open Source')
    expect(categoryToTopic('Blogging')).toBe('Industry')
    expect(categoryToTopic(undefined)).toBe('Industry')
  })
})
