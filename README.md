# Signal — LLM & AI News Aggregator

**Signal** is an editorial news aggregator for LLM and AI coverage: models, research, open source, policy, industry, and tools.

## ✨ New Features

- **Keyboard Navigation**: `j/k` to navigate stories, `/` to focus search
- **Accessibility**: Skip links, ARIA labels, improved focus management
- **Cross-Tab Sync**: Bookmarks sync across browser tabs
- **RSS Feeds**: Automated ingestion from AI news sources
- **Type Safety**: Improved TypeScript types and readonly data structures
- **Tests**: Vitest setup with coverage for news utilities
- **Documentation**: Contributing guide and code style documentation

## Live demo (static SPA)

A self-contained demo lives on the `gh-pages` branch (single `index.html` with seeded data, filters, search, story detail, bookmarks).

- Repo: https://github.com/billyx86/signal-llm-news
- Branch: `gh-pages`

## TanStack Start app (`main`)

Full stack on `main`:

- React 19 + TanStack Start / Router
- Vite + Tailwind v4
- zustand bookmarks (localStorage)
- ~30 seeded stories in `src/data/news.ts`
- Routes: `/`, `/story/$id`
- Dark editorial UI (Newsreader + IBM Plex Sans, ink neutrals + amber accent)

### Scripts

```bash
npm install
npm run dev        # 0.0.0.0:8080
npm run build
npm run typecheck
bash startup.sh    # idempotent non-blocking start
```

### Layout

```
src/
  components/   Header, FeaturedStory, StoryCard, TopicFilters, Footer
  data/news.ts  Seeded stories + filters
  lib/store.ts  Bookmarks (zustand + persist)
  lib/time.ts   Relative timestamps
  routes/       __root, index, story.$id
```

## Design

Cool ink neutrals, single amber accent, magazine density, hairline dividers, strong type hierarchy. Not purple AI gradient slop.

---

## RSS Integration & Ingestion API

Signal ingests live news from a small set of curated upstream RSS/Atom feeds and
merges them with the seeded archive. The whole pipeline lives in
`src/lib/rss.ts` (fetch + parse) and `src/lib/feed.ts` (store + polling), and is
unit-tested in `src/__tests__/rss.test.ts` and `src/__tests__/feed.test.ts`.
A full API reference with copy-paste examples is in [`docs/rss-api.md`](docs/rss-api.md).

### How it works

1. **Polling** — while the tab is visible, the live feed auto-refreshes every
   **5 minutes** (background tabs pause polling). A manual **Sync** button in
   the header triggers an immediate refresh.
2. **Fetch** — every enabled feed is fetched in parallel; one dead feed degrades
   gracefully and never blocks the others.
3. **Parse** — each feed is normalised to `RSSItem[]`, handling RSS 2.0
   `<item>` and Atom `<entry>`, `<![CDATA[…]]>` sections, and HTML entities.
4. **Merge** — live items are prepended to the seeded archive, de-duplicated by
   id, and sorted by `publishedAt` descending. Bookmarks live in a separate
   persisted store, so refreshes never touch them.

### `RSS_FEEDS` configuration

`RSS_FEEDS` is the single source of truth for which feeds are polled. Each
entry is an `RSSFeedConfig`:

```ts
import { RSS_FEEDS, type RSSFeedConfig } from '@/lib/rss'

const RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: 'OpenAI Blog',              // shown as the item `source`
    url: 'https://openai.com/blog/rss.xml',
    enabled: true,                    // false = skipped without removal
    category: 'Models',               // → editorial Topic (see below)
  },
  // …
]
```

| Field      | Type      | Notes                                                                 |
| ---------- | --------- | --------------------------------------------------------------------- |
| `name`     | `string`  | Human label; attached to every item from this feed as `source`.        |
| `url`      | `string`  | The RSS 2.0 or Atom feed URL.                                          |
| `enabled`  | `boolean` | Toggle a feed in/out of the rotation without deleting it.              |
| `category` | `string?` | Mapped to an editorial `Topic` via `categoryToTopic`. Unknown values fall back to `'Industry'`. |

### Adding a custom feed

To ingest a new source, append to `RSS_FEEDS` (or pass your own array to
`fetchAllFeeds`):

```ts
import { fetchAllFeeds } from '@/lib/rss'

const myFeeds = [
  ...RSS_FEEDS,
  {
    name: 'My Blog',
    url: 'https://myblog.example.com/feed.xml',
    enabled: true,
    category: 'Industry', // any Topic; 'Industry' if unsure
  },
]

const { items, succeeded, failed } = await fetchAllFeeds(myFeeds)
// items: RSSItem[] (union of all successful feeds)
// succeeded / failed: per-feed counts, ready to surface to the user
```

### Core API

| Export                          | Purpose                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `RSS_FEEDS`                     | The default feed list (`RSSFeedConfig[]`).                          |
| `parseRSS(xml, source?)`        | Parse an RSS/Atom document into `RSSItem[]`. Pure & synchronous.     |
| `fetchRSSFeed(url, source?, signal?)` | Fetch + parse a single feed; returns `RSSItem[]`, swallows failures. |
| `fetchFeedWithStatus(url, source?, signal?)` | Like `fetchRSSFeed` but reports `{ items, ok }` so callers can distinguish success from failure. |
| `fetchAllFeeds(feeds?)`         | Fetch every enabled feed in parallel; returns `FeedResult`.         |
| `categoryToTopic(category?)`    | Map a feed category to an editorial `Topic` (`'Industry'` fallback). |
| `extractTag(xml, tag)`          | Pull the first `<tag>` contents (CDATA + entity aware).              |
| `decodeEntities(text)` / `stripCdata(text)` | Low-level text helpers used by `extractTag`.        |

`parseRSS` is the heart of the ingestion pipeline and is intentionally pure —
feed it a raw feed string and it returns normalised items or drops the
incomplete ones (items must have both a title and a link).

### Error handling patterns

The module is built so that **a single bad feed can never break the digest**:

- **Network / HTTP errors** — `fetchFeedWithStatus` catches fetch rejections,
  non-`2xx` responses, and `AbortError`s, and returns `{ items: [], ok: false }`
  instead of throwing. `fetchRSSFeed` wraps this and returns `[]`.
- **Per-feed counting** — `fetchAllFeeds` returns `succeeded` and `failed`
  counts so the UI (the header Sync button) can show a healthy/greyed state and
  surface partial failure without a hard error.
- **Parse resilience** — `parseRSS` drops items missing a title or link and
  never throws on malformed markup; unknown HTML entities are left as-is.
- **Polling guard** — `useFeedAutoRefresh` in `feed.ts` is idempotent: a
  refresh already in flight is never stacked, and polling pauses in hidden
  tabs to keep the performance impact minimal.

> ⚠️ Feeds are fetched **client-side** from the browser. If a feed does not
> send permissive CORS headers it will fail from the browser (and count as a
> failure) even though it works in a terminal. For production you can front the
> fetches with a small server-side proxy; `parseRSS` and the types are all
> server-safe and can be reused there unchanged.

