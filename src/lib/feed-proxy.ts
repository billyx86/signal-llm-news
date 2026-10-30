/**
 * Server-function declaration for the feed proxy (issue #13).
 *
 * This module is **safe to import from client code**: it only declares a
 * {@link createServerFn} — `fetchFeedXml` — and contains no server-only logic
 * itself. The heavy lifting (and the only `*.server.*` import) happens inside
 * the handler, which TanStack Start compiles away on the client (replacing the
 * handler body with a same-origin fetcher). The server executes
 * {@link proxyFeedXml} from `feed-proxy.server.ts`, which gates requests to
 * either the built-in {@link RSS_FEEDS} allowlist or a public host that
 * passes the SSRF-safe {@link validateFeedUrl} guard (issue #16 user feeds),
 * so the proxy can never be pointed at internal addresses.
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { proxyFeedXml, type FeedProxyResult } from './feed-proxy.server'

/**
 * Fetch a feed's raw XML **server-side** to bypass browser CORS.
 *
 * The client passes a feed URL; the server accepts it only if it is in the
 * built-in {@link RSS_FEEDS} allowlist or it passes the SSRF-safe guard
 * (public host, issue #16), returning the raw document. Call this from the
 * client via `fetchFeedXml({ data: { url }, signal })`.
 */
export const fetchFeedXml = createServerFn()
  .validator(z.object({ url: z.string() }))
  .handler(async ({ data }): Promise<FeedProxyResult> => {
    return proxyFeedXml(data.url)
  })
