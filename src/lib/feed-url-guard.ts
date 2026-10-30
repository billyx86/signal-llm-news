/**
 * SSRF-safe feed URL validation (issue #16).
 *
 * When users can add their own RSS feeds, the server-side proxy
 * (`feed-proxy.server.ts`) can no longer gate purely on a hardcoded
 * allowlist — it must accept arbitrary *public* feed URLs while still
 * refusing to fetch internal addresses. Otherwise a malicious (or curious)
 * client could point the proxy at:
 *
 * - `http://127.0.0.1/…` / `http://[::1]/…`            — loopback
 * - `http://169.254.169.254/…`                          — cloud metadata / link-local
 * - `http://10.x` / `http://192.168.x` / `http://172.16-31.x` — RFC1918 private
 * - `http://[fd12::1]/…` / `http://[fe80::…]/…`          — IPv6 ULA / link-local
 *
 * and read the response. This module is the single source of truth for "is
 * this URL safe for the proxy to fetch". It is pure and synchronous so it can
 * be reused in two places:
 *
 * - the **server** proxy, to decide accept (fetch) vs. reject (`403`); and
 * - the **client** settings panel, to give the user an inline validation error
 *   before they even try to add a broken/private feed.
 *
 * ## What it enforces
 * - scheme must be `http:` or `https:` (no `file:`, `ftp:`, `gopher:`,
 *   `data:`, `javascript:`, …);
 * - the host must not be a loopback, private, link-local, CGNAT, or
 *   otherwise non-public address (IPv4 literal, IPv6 literal, or a
 *   `::ffff:a.b.c.d` IPv4-mapped IPv6);
 * - `localhost` / `*.localhost` hostnames are rejected outright.
 *
 * ## Known limitation (honest, by design)
 * A **public DNS hostname** (e.g. `https://example.com/rss`) is accepted
 * because we cannot see the address it resolves to without doing DNS — and
 * doing so synchronously in a pure guard is not possible. The proxy still
 * only ever returns the *document body* to the requesting client (never
 * internal hostnames/ports), and DNS-rebinding of a public name to a private
 * IP is a separate, out-of-scope threat. The literal-IP and `localhost`
 * rejection covers the SSRF vectors the acceptance criteria call out
 * (`http://127.0.0.1`, private/loopback hosts).
 */

/** A successful validation carries the canonical URL to store and fetch. */
export interface FeedUrlValid {
  ok: true
  /** Normalised absolute URL (scheme + host + path + query), safe to store. */
  url: string
}

/** A failed validation carries a human-readable reason for the UI. */
export interface FeedUrlInvalid {
  ok: false
  reason: string
}

export type FeedUrlValidation = FeedUrlValid | FeedUrlInvalid

/**
 * Return `true` when `host` is a **public** address a proxy may fetch.
 *
 * Accepts a hostname (no port, no brackets for IPv6 — as returned by
 * `URL#hostname`). Pure and side-effect free.
 */
export function isPublicHost(host: string): boolean {
  const hostname = normalizeHost(host)
  if (hostname === '') return false

  // `localhost` and the `*.localhost` TLD are reserved by RFC 6761 — never
  // let them through (a classic SSRF / internal-name target). A trailing dot
  // (FQDN form, e.g. `localhost.`) is stripped by {@link normalizeHost}.
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false

  // IPv4 literal (a.b.c.d).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return !isPrivateIPv4(hostname)

  // IPv6 literal (contains a colon; brackets already stripped).
  if (hostname.includes(':')) return !isPrivateIPv6(hostname)

  // Anything else is a public DNS name — allow. (DNS-rebinding caveat is
  // documented at the top of this file.)
  return true
}

/**
 * Normalise a host the way `URL#hostname` exposes it: lowercase, trimmed,
 * with a trailing FQDN dot removed and IPv6 square brackets stripped.
 */
function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase()
  if (h.length > 1 && h.endsWith('.')) h = h.slice(0, -1)
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  return h
}

/**
 * Classify an IPv4 dotted-quad as private / loopback / link-local / CGNAT /
 * reserved. Returns `true` when the address is NOT a normal public address.
 * Malformed inputs are treated as unsafe (fail closed).
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return true
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true

  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8 "this network" (incl. 0.0.0.0)
  if (a === 10) return true // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT (RFC 6598)
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true // 192.168.0.0/16 RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking (RFC 2544)
  if (a >= 240) return true // 240.0.0.0/4 reserved (incl. 255.255.255.255 broadcast)

  // IETF-reserved TEST-NET blocks (RFC 5737 / 5735) and the 6to4 relay.
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 88 && parts[2] === 99) return true // 192.88.99.0/24 (6to4 relay)
  if (a === 198 && b === 51 && parts[2] === 100) return true // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && parts[2] === 113) return true // 203.0.113.0/24 (TEST-NET-3)

  return false
}

/**
 * Classify an IPv6 address literal as private / loopback / link-local.
 *
 * The input is the bracket-stripped host (see {@link normalizeHost}). The
 * address is expanded to its full 8 × 16-bit groups so compressed `::`,
 * zone IDs, dotted-quad suffixes, and **both** IPv4-mapped serializations
 * (`::ffff:a.b.c.d` and Node's normalized `::ffff:7f00:1`) are handled.
 * Malformed input fails closed (treated as private).
 */
function isPrivateIPv6(ip: string): boolean {
  const groups = expandIPv6(ip)
  if (!groups) return true // fail closed on anything unparseable

  // Unspecified (::) and loopback (::1).
  if (groups.every((g) => g === 0)) return true
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true

  const g0 = groups[0]
  // fc00::/7 — unique local (fc00–fdff).
  if ((g0 & 0xfe00) === 0xfc00) return true
  // fe80::/10 — link-local (fe80–febf).
  if ((g0 & 0xffc0) === 0xfe80) return true

  // IPv4-mapped (::ffff:a.b.c.d) or deprecated IPv4-compatible (::a.b.c.d):
  // the last 32 bits carry an IPv4 address — let the IPv4 rules decide.
  const mappedV4 = ipv4FromV6Groups(groups)
  if (mappedV4) return isPrivateIPv4(mappedV4)

  return false
}

/**
 * If the expanded address is an IPv4-mapped/compatible form, return the
 * embedded dotted-quad; otherwise `null`.
 */
function ipv4FromV6Groups(g: number[]): string | null {
  // IPv4-mapped: [0,0,0,0,0,ffff,HH,LL]
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
  }
  // IPv4-compatible (deprecated): [0,0,0,0,0,0,HH,LL]
  if (g.slice(0, 6).every((x) => x === 0)) {
    return `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`
  }
  return null
}

/**
 * Expand an IPv6 literal to exactly 8 16-bit numeric groups, or `null` if it
 * is not a valid literal. Handles compressed `::` (at most one), an optional
 * `%zone` suffix, and a trailing dotted-quad (which contributes two groups).
 */
function expandIPv6(ip: string): number[] | null {
  let addr = ip.trim().toLowerCase()
  const zone = addr.indexOf('%')
  if (zone !== -1) addr = addr.slice(0, zone)
  if (addr === '') return null

  const parseSide = (side: string): number[] | null => {
    if (side === '') return []
    const out: number[] = []
    for (const part of side.split(':')) {
      if (part === '') return null
      if (part.includes('.')) {
        const m = part.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
        if (!m) return null
        const octets = m.slice(1).map(Number)
        if (octets.some((n) => n < 0 || n > 255)) return null
        out.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3])
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) return null
        out.push(parseInt(part, 16))
      }
    }
    return out
  }

  const sides = addr.split('::')
  if (sides.length > 2) return null

  if (sides.length === 2) {
    const left = parseSide(sides[0])
    const right = parseSide(sides[1])
    if (left === null || right === null) return null
    if (left.length + right.length > 8) return null
    const fill = 8 - left.length - right.length
    return [...left, ...Array(fill).fill(0), ...right]
  }

  const full = parseSide(addr)
  if (full === null || full.length !== 8) return null
  return full
}

/**
 * Validate a candidate feed URL.
 *
 * @param raw - The user-supplied feed URL (may be untrimmed / relative).
 * @returns `ok: true` with a normalised URL, or `ok: false` with a reason a
 *   settings panel can show verbatim.
 */
export function validateFeedUrl(raw: string): FeedUrlValidation {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, reason: 'Enter a feed URL.' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      ok: false,
      reason: 'That does not look like a valid URL (e.g. https://example.com/feed.xml).',
    }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only http:// and https:// feeds are supported.' }
  }

  if (!isPublicHost(parsed.hostname)) {
    return {
      ok: false,
      reason: 'This host is not allowed (it looks private, loopback, or reserved).',
    }
  }

  return { ok: true, url: parsed.href }
}
