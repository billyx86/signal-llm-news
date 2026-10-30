/**
 * Server-side feed proxy — the server-only fetch (issue #13), with a
 * short-TTL revalidation cache (issue #17).
 *
 * The live-RSS feature normally does a plain **browser** `fetch` of each
 * upstream feed URL, which fails from the browser for any feed that does not
 * send permissive CORS headers (even though it works in a terminal). This app
 * is a TanStack Start SSR app, so the feed body is fetched **here, on the
 * server**, and the raw XML is handed back to the client — sidestepping
 * browser CORS entirely.
 *
 * This module is server-only (the `.server.` suffix opts it into Start's
 * import protection; the client never imports it directly — it calls it via
 * the `fetchFeedXml` server function in `feed-proxy.ts`).
 *
 * **SSRF safety:** a proxy that accepts an arbitrary `?url=` is an
 * open server-side-request-forgery vector — an attacker could point it at
 * internal hosts (`http://169.254.169.254/...`, `http://127.0.0.1/...`) and
 * read the response. Two gates apply:
 *
 * 1. **Built-in allowlist** — a URL that exactly matches one of the app's
 *    curated {@link RSS_FEEDS} entries is trusted as-is.
 * 2. **SSRF-safe guard** (issue #16) — any other URL (i.e. a user-added
 *    feed) is accepted only if it passes {@link validateFeedUrl}: an
 *    `http:`/`https:` URL whose host is a public address (no loopback,
 *    private, link-local, CGNAT, or reserved range, no `localhost`).
 *    Anything else is rejected with `403` before any network call is made,
 *    and the proxy fetches the guard's *normalised* URL, never the raw
 *    user input.
 *
 * **Caching (issue #17):** every client polls this proxy every
 * `REFRESH_INTERVAL_MS`, and multiple tabs/users poll the same upstream
 * feeds — without a cache the proxy would re-fetch the same upstream document
 * on every request, wasting bandwidth and adding rate-limit pressure on
 * upstream publishers. The proxy now keeps one in-process entry per
 * allowlisted URL:
 *
 * - while within {@link FEED_CACHE_TTL_MS} of the last upstream fetch, the
 *   cached body is served with **no** network call;
 * - once the TTL expires, the next upstream request carries `If-None-Match`
 *   / `If-Modified-Since` (from the cached `ETag` / `Last-Modified`), and a
 *   `304 Not Modified` reuses the cached body (the TTL is extended — the
 *   upstream has just re-certified it);
 * - only `2xx` responses are cached. A failed fetch never poisons the cache,
 *   so the next request retries immediately, and the stale entry is kept
 *   only as a revalidation source.
 *
 * The cache is bounded by {@link MAX_FEED_CACHE_ENTRIES} with LRU eviction
 * (user feeds, issue #16, make the set of fetchable URLs unbounded, so a cap
 * keeps memory safe against a flood of distinct one-off URLs) and is
 * per-process — multiple server instances
 * each keep their own copy, which is still a strict improvement over none.
 * {@link feedCacheStats} exposes hit/miss counters so the TTL can be tuned.
 */
import { RSS_FEEDS, DEFAULT_FEED_TIMEOUT_MS } from '@/lib/rss'
import { validateFeedUrl } from '@/lib/feed-url-guard'

/** Serializable result of a proxied feed fetch. */
export interface FeedProxyResult {
  /** Whether the upstream feed responded 2xx (or the cache supplied the body). */
  ok: boolean
  /** Upstream HTTP status, or a synthetic status for a rejection/failure. */
  status: number
  /** Raw feed document (XML) on success; a short message otherwise. */
  body: string
  /** True when the body was served from the in-process cache (TTL hit or a
   *  `304` revalidation) instead of a fresh upstream body. */
  fromCache?: boolean
}

interface FeedCacheEntry {
  body: string
  etag: string | null
  lastModified: string | null
  fetchedAt: number
}

/**
 * How long a fetched feed body is served from cache without revalidating
 * against the upstream. The client polls every 5 minutes, so this mainly
 * deduplicates bursts (several tabs/users refreshing around the same time).
 */
export const FEED_CACHE_TTL_MS = 120_000

const cache = new Map<string, FeedCacheEntry>()
let cacheHits = 0
let cacheMisses = 0

/** Cache counters for tuning {@link FEED_CACHE_TTL_MS}. */
export function feedCacheStats(): { hits: number; misses: number; entries: number } {
  return { hits: cacheHits, misses: cacheMisses, entries: cache.size }
}

/** Drop all cached entries and reset the counters (used by tests). */
export function clearFeedCache(): void {
  cache.clear()
  cacheHits = 0
  cacheMisses = 0
}

/**
 * Upper bound on the number of cached feed bodies.
 *
 * Before issue #16 the cache could only ever hold entries for the built-in
 * {@link RSS_FEEDS} allowlist, so it was bounded for free. User feeds make
 * the set of fetchable URLs unbounded, so the cache now enforces this cap and
 * evicts the least-recently-used entry first to keep memory bounded.
 */
export const MAX_FEED_CACHE_ENTRIES = 200

/**
 * Insert or refresh a cache entry, evicting the least-recently-used entry
 * when the cap is exceeded. `Map` keeps insertion order and re-setting an
 * existing key does not move it, so we delete + re-set to refresh position —
 * that is also what makes evictions least-recently-used.
 */
function setCacheEntry(url: string, entry: FeedCacheEntry): void {
  cache.delete(url)
  cache.set(url, entry)
  while (cache.size > MAX_FEED_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/**
 * Resolve the URL the proxy is allowed to fetch for `url`, or `null` when the
 * request must be rejected with `403` before any network call.
 *
 * Two gates (see the module header):
 * 1. an exact match on the curated {@link RSS_FEEDS} list is trusted as-is;
 * 2. anything else (a user-added feed, issue #16) must pass the SSRF-safe
 *    {@link validateFeedUrl} guard — `http:`/`https:` only, public host only.
 *    The guard's *normalised* URL is what gets fetched, never the raw input.
 *
 * URLs carrying embedded credentials are refused as well: the proxy must not
 * be a tunnel for pushing `user:pass` pairs at arbitrary upstreams.
 */
function resolveFetchableUrl(url: string): string | null {
  if (RSS_FEEDS.some((f) => f.url === url)) return url
  const validation = validateFeedUrl(url)
  if (!validation.ok) return null
  let parsed: URL
  try {
    parsed = new URL(validation.url)
  } catch {
    return null
  }
  if (parsed.username !== '' || parsed.password !== '') return null
  return validation.url
}

/**
 * Fetch a feed's raw XML **on the server**, with a short-TTL cache and
 * `ETag`/`Last-Modified` revalidation (issue #17).
 *
 * @param url - The feed URL. Accepted only if it is an entry in the built-in
 *   {@link RSS_FEEDS} allowlist **or** it passes the SSRF-safe
 *   {@link validateFeedUrl} guard (issue #16 user feeds). Anything else is
 *   rejected with `403` and no request is made.
 */
export async function proxyFeedXml(url: string): Promise<FeedProxyResult> {
  // Gate: never fetch a URL the proxy is not allowed to fetch (built-in
  // allowlist, or a user feed that passes the SSRF-safe guard). Rejected
  // before any network call, using the normalised URL for everything below.
  const fetchableUrl = resolveFetchableUrl(url)
  if (fetchableUrl === null) {
    return { ok: false, status: 403, body: 'Feed URL is not in the allowlist.' }
  }

  const now = Date.now()
  const entry = cache.get(fetchableUrl)
  if (entry && now - entry.fetchedAt < FEED_CACHE_TTL_MS) {
    // Within the TTL: serve the cached body, no network call. Refresh the
    // entry's LRU position so a frequently-polled user feed is not evicted.
    setCacheEntry(fetchableUrl, entry)
    cacheHits += 1
    return { ok: true, status: 200, body: entry.body, fromCache: true }
  }

  cacheMisses += 1

  // Revalidation headers for a stale (TTL-expired) entry, so the upstream
  // can answer `304 Not Modified` and we keep its cached body.
  const headers: Record<string, string> = {}
  if (entry?.etag) {
    headers['If-None-Match'] = entry.etag
  } else if (entry?.lastModified) {
    headers['If-Modified-Since'] = entry.lastModified
  }

  try {
    const upstream = await fetch(fetchableUrl, {
      signal: AbortSignal.timeout(DEFAULT_FEED_TIMEOUT_MS),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    })

    if (upstream.status === 304 && entry) {
      // Upstream certified the cached body as still current — reuse it and
      // extend its TTL. (A 304 without an entry is defensive: we only send
      // revalidation headers when one exists, but never trust it blindly.)
      entry.fetchedAt = now
      setCacheEntry(fetchableUrl, entry)
      cacheHits += 1
      return { ok: true, status: 200, body: entry.body, fromCache: true }
    }

    const body = await upstream.text()
    if (upstream.ok) {
      // Only successful responses are cached — a failed fetch must not
      // shadow the next request.
      setCacheEntry(fetchableUrl, {
        body,
        etag: upstream.headers.get('etag'),
        lastModified: upstream.headers.get('last-modified'),
        fetchedAt: now,
      })
    }
    return { ok: upstream.ok, status: upstream.status, body }
  } catch {
    // Upstream unreachable / timed out. The client maps this to a per-feed
    // failure exactly like a failed browser fetch would. The cache is left
    // untouched so the retry can still revalidate.
    return { ok: false, status: 502, body: 'Upstream feed fetch failed.' }
  }
}
