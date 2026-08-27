# RSS Ingestion — API Reference

Reference for the RSS/Atom ingestion utilities in `src/lib/rss.ts` and the live
feed store/poller in `src/lib/feed.ts`. All exports are TypeScript types or
functions; the pure helpers (`parseRSS`, `extractTag`, `decodeEntities`,
`stripCdata`, `categoryToTopic`) are server-safe and have no DOM dependency.

> **TL;DR** — `parseRSS(xml)` turns a feed document into `RSSItem[]`.
> `fetchAllFeeds()` polls every enabled feed in parallel and reports
> `succeeded`/`failed` counts. Nothing here ever throws on bad input.

---

## Types

### `RSSFeedConfig`

Configuration for a single upstream feed.

```ts
interface RSSFeedConfig {
  name: string        // human label, becomes the item's `source`
  url: string         // RSS 2.0 or Atom feed URL
  enabled: boolean    // false = skipped without removal
  category?: string   // maps to an editorial Topic (see categoryToTopic)
}
```

### `RSSItem`

A normalised feed item, independent of the upstream dialect.

```ts
interface RSSItem {
  title: string
  link: string        // absolute URL of the source post
  description: string // may be empty
  pubDate: string     // ISO 8601
  source: string      // the feed's `name`
}
```

### `FeedResult`

Outcome of a multi-feed poll.

```ts
interface FeedResult {
  items: RSSItem[]    // union of all successful feeds
  succeeded: number   // feeds that fetched + parsed cleanly
  failed: number      // feeds that errored (network, HTTP, abort)
}
```

### `FeedFetchResult`

Outcome of a single-feed fetch (see `fetchFeedWithStatus`).

```ts
interface FeedFetchResult {
  items: RSSItem[]
  ok: boolean
}
```

---

## Functions

### `parseRSS(xml: string, source?: string): RSSItem[]`

Parse an RSS 2.0 **or** Atom document into normalised items.

- Handles `<item>` (RSS) and `<entry>` (Atom) elements.
- Unwraps `<![CDATA[…]]>` and decodes HTML entities.
- Atom links are read from `<link href="…"/>` (or an `<id>` fallback).
- **Drops items missing a title or link**; never throws on malformed markup.
- Pure and synchronous — ideal for server-side use and unit tests.

```ts
const items = parseRSS(rawFeedXml, 'Hugging Face Blog')
// [{ title, link, description, pubDate, source }, …]
```

### `fetchFeedWithStatus(url: string, source?: string, signal?: AbortSignal): Promise<FeedFetchResult>`

Fetch + parse a single feed, **distinguishing success from failure**.

- Returns `{ items, ok: true }` on a clean `2xx` + parse.
- Returns `{ items: [], ok: false }` (without throwing) for network errors,
  non-`2xx` responses, and `AbortError`s.

Use this (or `fetchAllFeeds`) whenever per-feed success matters.

### `fetchRSSFeed(url: string, source?: string, signal?: AbortSignal): Promise<RSSItem[]>`

Convenience wrapper around `fetchFeedWithStatus` that returns just the items
and swallows failures. Use when you only need the data and don't care whether
the feed succeeded.

### `fetchAllFeeds(feeds?: RSSFeedConfig[]): Promise<FeedResult>`

Fetch every **enabled** feed in parallel (defaults to `RSS_FEEDS`).

```ts
const { items, succeeded, failed } = await fetchAllFeeds()
console.log(`${succeeded} feeds ok, ${failed} failed, ${items.length} items`)
```

### `categoryToTopic(category?: string): Topic`

Map a feed `category` to an editorial `Topic`. Unknown/missing categories fall
back to `'Industry'`. Known topics: `Models`, `Research`, `Open Source`,
`Policy`, `Industry`, `Tools`.

### `extractTag(xml: string, tag: string): string | null`

Extract the contents of the first `<tag>…</tag>` element, unwrapping CDATA and
decoding entities. Returns `null` when the tag is absent. Primarily a building
block for `parseRSS`, but handy for one-off field reads.

### `decodeEntities(text: string): string`

Decode the XML core entities, numeric references, and a small table of common
HTML5 named entities (`&laquo;`, `&ndash;`, …). Unknown entities are left as-is.
`&amp;` is decoded last to avoid double-decoding.

### `stripCdata(text: string): string`

Unwrap a single `<![CDATA[ … ]]>` section if present; otherwise return the
input unchanged.

---

## The live feed store (`src/lib/feed.ts`)

The ingestion utilities are wired into the app by a small zustand store plus a
polling hook.

### `useFeedStore`

```ts
{
  liveStories: Story[]      // RSS items mapped to the app's Story shape
  succeededFeeds: number
  failedFeeds: number
  lastRefreshedAt: string | null
  isRefreshing: boolean
  hasRefreshed: boolean
  refresh: () => Promise<void>
}
```

`refresh()` calls `fetchAllFeeds()`, maps items into `Story`s via
`categoryToTopic`, de-dupes by id, and stores them. Bookmarks live in a
**separate** persisted store, so refreshing never clears saved stories.

### `useFeedAutoRefresh()`

React hook that:

- runs an initial refresh on mount,
- re-polls every **5 minutes** (`REFRESH_INTERVAL_MS`) while `document.visibilityState === 'visible'`,
- pauses in hidden tabs,
- never stacks a refresh on top of one already in flight.

Call it once from the home route.

### `mergeStories(base: Story[], live: Story[]): Story[]`

Prepend live stories to the seeded archive, de-duplicate by id, and sort by
`publishedAt` descending. Returns the base array unchanged (by reference) when
there are no live stories.

---

## Example: ingest a brand-new source end to end

```ts
import { fetchAllFeeds } from '@/lib/rss'
import { mergeStories } from '@/lib/feed'
import { stories } from '@/data/news'

// 1. Extend the feed list (or pass a custom array).
const feeds = [
  ...RSS_FEEDS,
  {
    name: 'My Research Blog',
    url: 'https://research.example.com/feed.xml',
    enabled: true,
    category: 'Research',
  },
]

// 2. Poll everything in parallel.
const { items, succeeded, failed } = await fetchAllFeeds(feeds)

// 3. Map to Stories and merge with the seeded archive.
//    (feed.ts does this mapping internally via `toStory`; replicate here if
//     you're driving the pipeline yourself outside the store.)
const liveStories = items.map((item) => toStory(item, categoryToTopic('Industry')))
const feed = mergeStories(stories, liveStories)

// 4. Surface health to the UI.
if (failed > 0) console.warn(`${failed} feed(s) failed this poll`)
```

---

## Error-handling contract

| Failure mode                | Behaviour                                             |
| --------------------------- | ----------------------------------------------------- |
| Fetch rejects (network, CORS, DNS) | `{ items: [], ok: false }`; counted as `failed`.  |
| HTTP non-`2xx`              | `{ items: [], ok: false }`; counted as `failed`.        |
| `AbortError` (cancelled)    | `{ items: [], ok: false }`; counted as `failed`.        |
| Malformed / partial XML     | `parseRSS` drops incomplete items, never throws.        |
| Unknown HTML entity         | Left as-is in the decoded text.                         |
| A refresh already in flight | `useFeedAutoRefresh` skips; no stacked requests.        |

**CORS note:** feeds are fetched client-side. A feed without permissive CORS
headers will fail from the browser even if it's reachable from a terminal. For
production, front the fetches with a small server-side proxy — `parseRSS` and
the types above are server-safe and can be reused there unchanged.
