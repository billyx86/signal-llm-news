import { describe, it, expect } from 'vitest'
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
  absoluteStoryUrl,
  buildRobotsTxt,
  buildSitemapXml,
  homeHead,
  storyHead,
  storyNotFoundHead,
  truncateForMeta,
} from '@/lib/seo'
import { stories, type Story } from '@/data/news'

function makeSyntheticStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'synthetic-story',
    title: 'Synthetic story',
    summary: 'Short summary.',
    body: 'Body text.',
    topic: 'Research',
    source: 'Test Lab',
    sourceUrl: 'https://example.com/post',
    author: 'Editorial Desk',
    publishedAt: '2026-11-25T12:00:00.000Z',
    readTime: 3,
    ...overrides,
  }
}

describe('truncateForMeta (#30)', () => {
  it('returns short text unchanged without an ellipsis', () => {
    expect(truncateForMeta('Concise summary.')).toBe('Concise summary.')
    expect(truncateForMeta('a'.repeat(160), 160)).toBe('a'.repeat(160))
  })

  it('collapses internal and surrounding whitespace', () => {
    expect(truncateForMeta('  Hello\n\tworld   from   Signal  ')).toBe(
      'Hello world from Signal',
    )
  })

  it('cuts long text at a word boundary, appends an ellipsis, and stays within max + 1', () => {
    const long =
      'OpenAI shipped a new stepwise reasoning model with adaptive inference budgets across math, coding, scientific research, and multi-step agentic tool workflows for labs.'
    const out = truncateForMeta(long, 60)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(61)
    // Cut at a word boundary (does not slice through the middle of a word).
    const prefix = out.slice(0, -1)
    expect(long.startsWith(`${prefix} `)).toBe(true)
  })

  it('respects max + 1 even for a single token with no spaces', () => {
    const out = truncateForMeta('x'.repeat(200), 40)
    expect(out).toBe(`${'x'.repeat(40)}…`)
    expect(out.length).toBe(41)
  })
})

describe('absoluteStoryUrl (#30, #32)', () => {
  it('builds a canonical story URL under /story/<id>', () => {
    expect(absoluteStoryUrl('openai-o3-reasoning')).toBe(
      `${SITE_ORIGIN}/story/openai-o3-reasoning`,
    )
    expect(absoluteStoryUrl('a/b c', 'https://example.com/')).toBe(
      'https://example.com/story/a%2Fb%20c',
    )
  })
})

describe('storyHead (#30)', () => {
  it('emits full Open Graph, article, twitter, and canonical metadata for a real story', () => {
    const story = stories[0]
    const head = storyHead(story)
    const canonical = head.links.find((l) => l.rel === 'canonical')?.href

    const titleTag = head.meta.find((m) => m.title !== undefined)
    expect(titleTag?.title).toBe(`${story.title} — ${SITE_NAME}`)

    const expectedUrl = absoluteStoryUrl(story.id)
    expect(canonical).toBe(expectedUrl)

    const byProp = (prop: string) => head.meta.find((m) => m.property === prop)?.content
    const byName = (name: string) => head.meta.find((m) => m.name === name)?.content

    expect(byName('description')).toBe(truncateForMeta(story.summary))
    expect(byProp('og:title')).toBe(story.title)
    expect(byProp('og:description')).toBe(truncateForMeta(story.summary))
    expect(byProp('og:type')).toBe('article')
    expect(byProp('og:url')).toBe(canonical)
    expect(byProp('og:site_name')).toBe(SITE_NAME)
    expect(byProp('og:image')).toBeUndefined()

    expect(byProp('article:published_time')).toBe(story.publishedAt)
    expect(byProp('article:modified_time')).toBe(story.publishedAt)
    expect(byProp('article:section')).toBe(story.topic)
    expect(byProp('article:author')).toBe(story.author)

    expect(byName('twitter:card')).toBe('summary')
    expect(byName('twitter:title')).toBe(story.title)
    expect(byName('twitter:description')).toBe(truncateForMeta(story.summary))

    // No duplicate meta `property` or `name` keys.
    const props = head.meta.map((m) => m.property).filter((v): v is string => v !== undefined)
    const names = head.meta.map((m) => m.name).filter((v): v is string => v !== undefined)
    expect(new Set(props).size).toBe(props.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('prefers updatedAt over publishedAt for article:modified_time when present', () => {
    const story = makeSyntheticStory({
      publishedAt: '2026-11-24T10:00:00.000Z',
      updatedAt: '2026-11-25T15:30:00.000Z',
    })
    const head = storyHead(story)
    const modified = head.meta.find((m) => m.property === 'article:modified_time')?.content
    expect(modified).toBe('2026-11-25T15:30:00.000Z')
  })
})

describe('storyNotFoundHead (#30)', () => {
  it('sets a fallback title, noindex robots meta, and no canonical link', () => {
    const head = storyNotFoundHead()
    expect(head.meta.find((m) => m.title !== undefined)?.title).toBe(
      `Story not found — ${SITE_NAME}`,
    )
    expect(head.meta.find((m) => m.name === 'robots')?.content).toBe('noindex')
    expect(head.links).toEqual([])
  })
})

describe('homeHead (#30)', () => {
  it('emits website Open Graph metadata and canonical home URL', () => {
    const head = homeHead()
    const expectedUrl = `${SITE_ORIGIN}/`

    expect(head.meta.find((m) => m.title !== undefined)?.title).toBe(
      `${SITE_NAME} — LLM & AI News`,
    )
    expect(head.meta.find((m) => m.name === 'description')?.content).toBe(SITE_DESCRIPTION)
    expect(head.meta.find((m) => m.property === 'og:title')?.content).toBe(
      `${SITE_NAME} — LLM & AI News`,
    )
    expect(head.meta.find((m) => m.property === 'og:description')?.content).toBe(
      SITE_DESCRIPTION,
    )
    expect(head.meta.find((m) => m.property === 'og:type')?.content).toBe('website')
    expect(head.meta.find((m) => m.property === 'og:url')?.content).toBe(expectedUrl)
    expect(head.links).toEqual([{ rel: 'canonical', href: expectedUrl }])
  })
})

describe('buildSitemapXml & buildRobotsTxt (#32)', () => {
  it('escapes XML special characters in interpolated sitemap values', () => {
    const synthetic = makeSyntheticStory({
      id: 'q&a<test>',
      title: 'R&D < 2026: "fast" & \'open\'',
      summary: 'Covers A&B < C benchmarks.',
      updatedAt: '2026-11-25T12:00:00Z&<tag>',
    })

    const xml = buildSitemapXml([synthetic], 'https://example.com/?a=1&b=<2>')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml.endsWith('\n')).toBe(true)
    expect(xml).toContain(
      '<loc>https://example.com/?a=1&amp;b=&lt;2&gt;/</loc>',
    )
    expect(xml).toContain(
      '<loc>https://example.com/?a=1&amp;b=&lt;2&gt;/story/q%26a%3Ctest%3E</loc>',
    )
    expect(xml).toContain('<lastmod>2026-11-25T12:00:00Z&amp;&lt;tag&gt;</lastmod>')
    // No unescaped `&` (every ampersand starts a known XML entity).
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
    expect(xml).not.toContain('<tag>')
  })

  it('builds a valid robots.txt pointing at the sitemap', () => {
    expect(buildRobotsTxt()).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
    )
    expect(buildRobotsTxt('https://example.com/')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
    )
  })
})
