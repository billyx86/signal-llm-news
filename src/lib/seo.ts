import type { Story } from '@/data/news'

/**
 * Per-route SEO metadata, sitemap, and robots.txt builders for Signal (#30, #32).
 *
 * Keeps the canonical site origin, meta tag shapes, and crawler artefacts in a
 * single source of truth so route heads and static files in `public/` cannot
 * drift apart.
 */

/** Canonical project Pages origin (verified via the GitHub Pages API, #30). */
export const SITE_ORIGIN = 'https://billyx86.github.io/signal-llm-news'
export const SITE_NAME = 'Signal'
export const SITE_DESCRIPTION =
  'Signal is an editorial aggregator for LLM and AI news — models, research, open source, policy, industry, and tools.'

export interface HeadMetaTag {
  title?: string
  name?: string
  property?: string
  content?: string
}

export interface HeadLinkTag {
  rel: string
  href: string
}

export interface RouteHead {
  meta: Array<HeadMetaTag>
  links: Array<HeadLinkTag>
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, '')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Collapse whitespace and truncate text at a word boundary for meta descriptions (#30).
 *
 * Appends `…` only when content was dropped and never returns a string longer
 * than `max + 1` characters.
 */
export function truncateForMeta(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (max <= 0) return ''
  if (clean.length <= max) return clean

  // Look one char past `max` so a word ending exactly at `max` stays intact.
  const window = clean.slice(0, max + 1)
  const lastSpace = window.lastIndexOf(' ')
  if (lastSpace > 0) {
    return `${window.slice(0, lastSpace)}…`
  }
  return `${clean.slice(0, max)}…`
}

/**
 * Build the canonical absolute URL for a story under `/story/<id>` (#30, #32).
 */
export function absoluteStoryUrl(id: string, origin = SITE_ORIGIN): string {
  return `${normalizeOrigin(origin)}/story/${encodeURIComponent(id)}`
}

/**
 * Build `<meta>` and canonical `<link>` entries for an individual story route (#30).
 *
 * Intentionally omits `og:image` until editorial preview images exist.
 */
export function storyHead(story: Story, origin = SITE_ORIGIN): RouteHead {
  const description = truncateForMeta(story.summary)
  const url = absoluteStoryUrl(story.id, origin)

  return {
    meta: [
      { title: `${story.title} — ${SITE_NAME}` },
      { name: 'description', content: description },
      { property: 'og:title', content: story.title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: url },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'article:published_time', content: story.publishedAt },
      { property: 'article:modified_time', content: story.updatedAt ?? story.publishedAt },
      { property: 'article:section', content: story.topic },
      { property: 'article:author', content: story.author },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: story.title },
      { name: 'twitter:description', content: description },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}

/**
 * Fallback head metadata when `/story/$id` does not match a seeded archive story (#30).
 *
 * Omits a canonical link and instructs crawlers not to index missing or rotated-out
 * live-only URLs.
 */
export function storyNotFoundHead(): RouteHead {
  return {
    meta: [
      { title: `Story not found — ${SITE_NAME}` },
      { name: 'robots', content: 'noindex' },
    ],
    links: [],
  }
}

/**
 * Build `<meta>` and canonical `<link>` entries for the home route `/` (#30).
 */
export function homeHead(origin = SITE_ORIGIN): RouteHead {
  const title = `${SITE_NAME} — LLM & AI News`
  const url = `${normalizeOrigin(origin)}/`

  return {
    meta: [
      { title },
      { name: 'description', content: SITE_DESCRIPTION },
      { property: 'og:title', content: title },
      { property: 'og:description', content: SITE_DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: url },
      { property: 'og:site_name', content: SITE_NAME },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: SITE_DESCRIPTION },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}

function newestStoryDate(stories: readonly Story[]): string | undefined {
  let newest: string | undefined
  let newestMs = -Infinity

  for (const story of stories) {
    const candidate = story.updatedAt ?? story.publishedAt
    const ms = Date.parse(candidate)
    if (!Number.isNaN(ms)) {
      if (ms > newestMs) {
        newestMs = ms
        newest = candidate
      }
    } else if (newest === undefined) {
      newest = candidate
    }
  }

  return newest
}

/**
 * Build a Sitemaps 0.9 XML document covering `/` and every archive story (#32).
 *
 * Escapes every interpolated value so synthetic or non-slug inputs can never
 * break XML well-formedness.
 */
export function buildSitemapXml(
  stories: readonly Story[],
  origin = SITE_ORIGIN,
): string {
  const base = normalizeOrigin(origin)
  const homeUrl = `${base}/`
  const latest = newestStoryDate(stories)

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${escapeXml(homeUrl)}</loc>`,
  ]

  if (latest !== undefined) {
    lines.push(`    <lastmod>${escapeXml(latest)}</lastmod>`)
  }

  lines.push(
    '    <changefreq>hourly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
  )

  for (const story of stories) {
    const loc = absoluteStoryUrl(story.id, base)
    const lastmod = story.updatedAt ?? story.publishedAt
    lines.push(
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.7</priority>',
      '  </url>',
    )
  }

  lines.push('</urlset>')
  return `${lines.join('\n')}\n`
}

/**
 * Build the crawler policy in `public/robots.txt` pointing to the sitemap (#32).
 */
export function buildRobotsTxt(origin = SITE_ORIGIN): string {
  const sitemapUrl = `${normalizeOrigin(origin)}/sitemap.xml`
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`
}
