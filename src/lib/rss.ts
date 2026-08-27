import type { Topic } from '@/data/news'

/**
 * Configuration for a single upstream RSS/Atom feed.
 *
 * `category` maps a feed to one of the editorial `Topic`s so items fetched
 * from it are filed under the right section of the app. Feeds whose category
 * is not a known Topic fall back to `'Industry'` at ingestion time.
 */
export interface RSSFeedConfig {
  name: string
  url: string
  enabled: boolean
  category?: string
}

/**
 * Feeds polled by the app. Toggle `enabled` to take a feed in/out of the
 * rotation without removing it; add your own entries here to extend coverage.
 */
export const RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog/rss.xml',
    enabled: true,
    category: 'Models'
  },
  {
    name: 'Anthropic Blog',
    url: 'https://www.anthropic.com/news/rss.xml',
    enabled: true,
    category: 'Models'
  },
  {
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    enabled: true,
    category: 'Open Source'
  },
  {
    name: 'DeepMind Blog',
    url: 'https://deepmind.google/discover/blog/rss.xml',
    enabled: true,
    category: 'Research'
  }
]

/** Normalised feed item, independent of the upstream RSS/Atom dialect. */
export interface RSSItem {
  title: string
  link: string
  description: string
  pubDate: string
  source: string
}

/** Outcome of a multi-feed fetch, including per-feed success/failure counts. */
export interface FeedResult {
  items: RSSItem[]
  succeeded: number
  failed: number
}

/** Named entities that commonly appear in feed text (beyond the XML core set). */
const NAMED_ENTITIES: Record<string, string> = {
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
}

/**
 * Minimal decode for the entities that actually appear in feed text: the XML
 * core set, numeric references, and a small table of common HTML5 named
 * entities. Unknown entities are left as-is.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/gi, '&')
}

/** Unwrap `<![CDATA[ ... ]]>` if present, otherwise return the text as-is. */
export function stripCdata(text: string): string {
  const cdata = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  return cdata ? cdata[1] : text
}

/**
 * Extract the contents of the first `<tag>…</tag>` element, unwrapping CDATA
 * and decoding HTML entities. Returns `null` when the tag is absent.
 */
export function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const match = xml.match(regex)
  if (!match) return null
  return decodeEntities(stripCdata(match[1].trim()))
}

/**
 * Parse an RSS 2.0 or Atom document into normalised items.
 *
 * Handles `<item>` (RSS) and `<entry>` (Atom) elements, CDATA sections, and
 * HTML entities. Items without both a title and a link are dropped.
 *
 * @param xml - Raw feed document text.
 * @param source - Label attached to every returned item (usually the feed name).
 */
export function parseRSS(xml: string, source = 'RSS'): RSSItem[] {
  const items: RSSItem[] = []
  const entryRegex = /<(item|entry)\b[\s\S]*?<\/\1>/g
  let match

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[0]
    const title = extractTag(entryXml, 'title')
    const link = extractTag(entryXml, 'link') ?? atomLink(entryXml)
    const description =
      extractTag(entryXml, 'description') ??
      extractTag(entryXml, 'summary') ??
      extractTag(entryXml, 'content')
    const pubDate =
      extractTag(entryXml, 'pubDate') ??
      extractTag(entryXml, 'published') ??
      extractTag(entryXml, 'updated')

    if (title && link) {
      items.push({
        title: title.trim(),
        link,
        description: description?.trim() || '',
        pubDate: (pubDate || new Date().toISOString()).trim(),
        source
      })
    }
  }

  return items
}

/** Atom puts the URL in `<link href="…"/>` (or an `<id>` fallback). */
function atomLink(entryXml: string): string | null {
  const href = entryXml.match(/<link[^>]*\bhref\s*=\s*["']([^"']+)["']/i)
  if (href) return href[1]
  const id = extractTag(entryXml, 'id')
  return id && /^https?:/i.test(id) ? id : null
}

/** Outcome of a single feed fetch, with success/failure tracking. */
export interface FeedFetchResult {
  items: RSSItem[]
  ok: boolean
}

/**
 * Fetch and parse a single feed, distinguishing success from failure.
 *
 * @param url - Feed URL.
 * @param source - Label for items returned from this feed.
 * @param signal - Optional AbortSignal to cancel an in-flight request.
 */
export async function fetchFeedWithStatus(
  url: string,
  source = 'RSS',
  signal?: AbortSignal,
): Promise<FeedFetchResult> {
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      console.error(`RSS feed returned HTTP ${response.status}: ${url}`)
      return { items: [], ok: false }
    }
    const text = await response.text()
    return { items: parseRSS(text, source), ok: true }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { items: [], ok: false }
    }
    console.error(`Failed to fetch RSS feed: ${url}`, error)
    return { items: [], ok: false }
  }
}

/**
 * Fetch and parse a single feed, swallowing failures.
 *
 * Network or parse failures are reported as an empty list so a single dead
 * feed can never take down the rest of the rotation. Use
 * {@link fetchFeedWithStatus} or {@link fetchAllFeeds} when per-feed success
 * matters.
 *
 * @param url - Feed URL.
 * @param source - Label for items returned from this feed.
 * @param signal - Optional AbortSignal to cancel an in-flight request.
 */
export async function fetchRSSFeed(
  url: string,
  source = 'RSS',
  signal?: AbortSignal,
): Promise<RSSItem[]> {
  const result = await fetchFeedWithStatus(url, source, signal)
  return result.items
}

/**
 * Fetch every enabled feed in parallel.
 *
 * Uses per-feed status tracking so one failing feed degrades gracefully:
 * callers get the union of successful items plus `succeeded`/`failed` counts
 * they can surface to the user.
 */
export async function fetchAllFeeds(
  feeds: RSSFeedConfig[] = RSS_FEEDS,
): Promise<FeedResult> {
  const enabledFeeds = feeds.filter((f) => f.enabled)
  const results = await Promise.all(
    enabledFeeds.map((feed) => fetchFeedWithStatus(feed.url, feed.name)),
  )

  let succeeded = 0
  let failed = 0
  const items = results.flatMap((r) => {
    if (r.ok) {
      succeeded += 1
      return r.items
    }
    failed += 1
    return []
  })

  return { items, succeeded, failed }
}

/**
 * Map a feed category to an editorial Topic, defaulting to `'Industry'` for
 * categories the app does not have a section for.
 */
export function categoryToTopic(category?: string): Topic {
  const topics = [
    'Models',
    'Research',
    'Open Source',
    'Policy',
    'Industry',
    'Tools',
  ] as const
  return category && (topics as readonly string[]).includes(category)
    ? (category as Topic)
    : 'Industry'
}
