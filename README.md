# Signal — LLM & AI News Aggregator

**Signal** is an editorial news aggregator for LLM and AI coverage: models, research, open source, policy, industry, and tools.

## ✨ New Features

- **Keyboard Navigation**: `j/k` to navigate stories, `/` to focus search
- **Accessibility**: Skip links, ARIA labels, improved focus management
- **Cross-Tab Sync**: Bookmarks sync across browser tabs
- **RSS Feeds**: Automated ingestion from AI news sources
- **User-managed feeds**: add, toggle, rename, and remove your own RSS/Atom feeds (gear button in the header)
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
   gracefully and never blocks the others. Each fetch is also bounded by a
   per-feed timeout (default **15 s**, `DEFAULT_FEED_TIMEOUT_MS`) so a feed
   that connects but never responds is dropped as a failure instead of stalling
   the whole refresh. In the browser, fetches are routed through a
   **server-side proxy** (`src/lib/feed-proxy.ts` → `feed-proxy.server.ts`) so
   feeds without permissive CORS headers still load; the proxy accepts built-in
   `RSS_FEEDS` URLs plus any user feed URL that passes the SSRF-safe guard
   (see the note below). Outside a browser
   (SSR, unit tests) it falls back to a direct `fetch`.
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
| `fetchAllFeeds(feeds?, opts?)`  | Fetch every enabled feed in parallel; returns `FeedResult`. `opts.timeoutMs` sets the per-feed timeout (default `DEFAULT_FEED_TIMEOUT_MS`, 15 s). |
| `DEFAULT_FEED_TIMEOUT_MS`       | Per-feed abort timeout used by `fetchAllFeeds` when `opts.timeoutMs` is unset. |
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
- **Per-feed timeout** — every fetch in `fetchAllFeeds` is wrapped in an
  `AbortController` that fires after `opts.timeoutMs` (default
  `DEFAULT_FEED_TIMEOUT_MS`, 15 s). A hung feed resolves as a failure and is
  counted in `failed`, so it can never stall the parallel batch or the UI. The
  timer is cleared in a `finally` block once the fetch settles, so a fast feed
  never gets aborted late by a stray timer.
- **Parse resilience** — `parseRSS` drops items missing a title or link and
  never throws on malformed markup; unknown HTML entities are left as-is.
- **Polling guard** — `useFeedAutoRefresh` in `feed.ts` is idempotent: a
  refresh already in flight is never stacked, and polling pauses in hidden
  tabs to keep the performance impact minimal.

> 🔒 **Server-side feed proxy (CORS)** — In the browser, feed fetches are routed
> through a server function (`src/lib/feed-proxy.ts`) that fetches upstream on
> the server and returns the raw XML, so feeds without permissive CORS headers
> still load instead of silently failing. Because a `?url=` proxy is otherwise an
> SSRF vector, two gates apply (see `src/lib/feed-url-guard.ts`):
> 1. a URL that exactly matches a built-in `RSS_FEEDS` entry is trusted as-is;
> 2. any other URL (a user-added feed) is accepted only if it passes the
>    SSRF-safe guard — `http:`/`https:` with a public host (no loopback,
>    private, link-local, CGNAT, or reserved range, no `localhost`).
>
> Everything else is rejected with `403` before any network call is made, and
> the proxy fetches the guard's *normalised* URL, never the raw user input.
> The proxy also keeps a short-TTL in-process cache per feed (120 s, see
> `FEED_CACHE_TTL_MS` in `feed-proxy.server.ts`) and revalidates expired
> entries with `If-None-Match` / `If-Modified-Since`, so multiple tabs or
> users polling the same feed do not each hit the upstream publisher. Since
> user feeds make the set of fetchable URLs unbounded, the cache is now capped
> at `MAX_FEED_CACHE_ENTRIES` (200) with LRU eviction.
> Outside a browser (SSR / unit tests) the pipeline uses a direct `fetch`.

### User-managed feeds (issue #16)

The gear button in the header opens the **feed settings panel**
(`src/components/FeedSettings.tsx`). Users can:

- **Add** a feed by URL (plus an optional name and category). The URL is
  validated inline by `validateFeedUrl` — rejections (bad scheme, private /
  loopback host, malformed URL, duplicate) are shown verbatim in the panel.
- **Toggle** a feed on/off, **rename** it, or **remove** it.

State lives in the persisted zustand store `useUserFeedStore`
(`src/lib/feed-store.ts`, storage key `signal-user-feeds`), so feeds survive
reloads. `UserFeed` reuses the `RSSFeedConfig` shape, and `getActiveFeeds()`
in `src/lib/feed.ts` merges the built-in `RSS_FEEDS` with enabled user feeds —
de-duplicated by normalised URL, so adding a feed that already ships with the
app does not poll it twice. Changes take effect on the next 5-minute refresh
(or the next manual Sync) without a reload.

| Export (`src/lib/feed-store.ts`) | Purpose |
| -------------------------------- | ------- |
| `useUserFeedStore`               | Persisted zustand store: `userFeeds`, `addFeed`, `removeFeed`, `toggleFeed`, `renameFeed`, `clearUserFeeds`, `hasFeed`. |
| `addFeed({ url, name?, category? })` | Validates via the guard, derives a name from the URL when omitted, rejects duplicates. Returns `{ ok, feed } \| { ok: false, reason }`. |
| `normalizeFeedKey(url)`          | Canonical URL key used for dedupe (lowercase host, default port and trailing slash dropped). |
| `nameFromFeedUrl(url)`           | Derives a display name from the host when the user gives none. |
| `validateFeedUrl(raw)` (`src/lib/feed-url-guard.ts`) | SSRF-safe validation: `http(s)` + public host only. Pure and synchronous; shared by the proxy and the settings panel. |
| `getActiveFeeds(userFeeds?)` (`src/lib/feed.ts`) | Built-in `RSS_FEEDS` + enabled, de-duplicated user feeds — what the pipeline fetches. |

> ⚠️ **Known limitation (by design)** — a public *DNS hostname* is accepted
> because the guard is pure and synchronous and cannot resolve DNS. DNS
> rebinding of a public name to a private IP is out of scope; the literal-IP
> and `localhost` rejection covers the SSRF vectors that matter here.

