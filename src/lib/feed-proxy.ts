/**
 * Server-function declaration for the feed proxy (issue #13).
 *
 * This module is **safe to import from client code**: it only declares a
 * {@link createServerFn} — `fetchFeedXml` — and contains no server-only logic
 * itself. The heavy lifting (and the only `*.server.*` import) happens inside
 * the handler, which TanStack Start compiles away on the client (replacing the
 * handler body with a same-origin fetcher). The server executes
 * {@link proxyFeedXml} from `feed-proxy.server.ts`, which gates requests to
 * the {@link RSS_FEEDS} allowlist to prevent SSRF.
 */
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { proxyFeedXml, type FeedProxyResult } from './feed-proxy.server'

/**
 * Fetch a feed's raw XML **server-side** to bypass browser CORS.
 *
 * The client passes a feed URL; the server validates it against the
 * {@link RSS_FEEDS} allowlist (rejecting anything else with `403`) and
 * returns the raw document. Call this from the client via
 * `fetchFeedXml({ data: { url }, signal })`.
 */
export const fetchFeedXml = createServerFn()
  .validator(z.object({ url: z.string() }))
  .handler(async ({ data }): Promise<FeedProxyResult> => {
    return proxyFeedXml(data.url)
  })
