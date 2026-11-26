import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { buildRobotsTxt, buildSitemapXml } from '@/lib/seo'
import { stories } from '@/data/news'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '../../public')

describe('Static SEO assets drift guard (#32)', () => {
  it('keeps public/robots.txt byte-identical to buildRobotsTxt()', () => {
    const actual = fs.readFileSync(path.join(PUBLIC_DIR, 'robots.txt'), 'utf8')
    const expected = buildRobotsTxt()
    expect(
      actual,
      'public/robots.txt is out of sync — regenerate it from buildRobotsTxt() in src/lib/seo.ts',
    ).toBe(expected)
  })

  it('keeps public/sitemap.xml byte-identical to buildSitemapXml(stories)', () => {
    const actual = fs.readFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), 'utf8')
    const expected = buildSitemapXml(stories)
    expect(
      actual,
      'public/sitemap.xml is out of sync with src/data/news.ts — regenerate public/sitemap.xml from buildSitemapXml(stories)',
    ).toBe(expected)
  })

  it('includes a <loc> entry for the home page and every archived story', () => {
    const sitemap = fs.readFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), 'utf8')
    const locs = sitemap.match(/<loc>[^<]+<\/loc>/g) ?? []
    expect(locs).toHaveLength(stories.length + 1)
  })
})
