/**
 * Server-side feed proxy — the server-only fetch (issue #13).
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
 * read the response. We therefore only ever fetch URLs that are already
 * present in the app's own {@link RSS_FEEDS} allowlist. Anything else is
 * rejected with `403` before any network call is made.
 */
import { RSS_FEEDS, DEFAULT_FEED_TIMEOUT_MS } from '@/lib/rss'

/** Serializable result of a proxied feed fetch. */
export interface FeedProxyResult {
  /** Whether the upstream feed responded 2xx. */
  ok: boolean
  /** Upstream HTTP status, or a synthetic status for a rejection/failure. */
  status: number
  /** Raw feed document (XML) on success; a short message otherwise. */
  body: string
}

/**
 * Fetch a feed's raw XML **on the server**, gated to the allowlist.
 *
 * @param url - The feed URL. Must exactly match an entry in {@link RSS_FEEDS};
 *   anything else is rejected with `403` and no request is made.
 */
export async function proxyFeedXml(url: string): Promise<FeedProxyResult> {
  // Allowlist check: never fetch a URL the app does not already trust.
  const feed = RSS_FEEDS.find((f) => f.url === url)
  if (!feed) {
    return { ok: false, status: 403, body: 'Feed URL is not in the allowlist.' }
  }

  try {
    const upstream = await fetch(feed.url, {
      signal: AbortSignal.timeout(DEFAULT_FEED_TIMEOUT_MS),
    })
    const body = await upstream.text()
    return { ok: upstream.ok, status: upstream.status, body }
  } catch {
    // Upstream unreachable / timed out. The client maps this to a per-feed
    // failure exactly like a failed browser fetch would.
    return { ok: false, status: 502, body: 'Upstream feed fetch failed.' }
  }
}
