import { z } from 'zod'

export interface RSSFeedConfig {
  name: string
  url: string
  enabled: boolean
  category?: string
}

export const RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog/rss.xml',
    enabled: true,
    category: 'Models'
  },
  {
    name: 'Anthropic Blog',
    url: 'https://www.anthropic.com/news/rss.xml',
    enabled: true,
    category: 'Models'
  },
  {
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    enabled: true,
    category: 'Open Source'
  },
  {
    name: 'DeepMind Blog',
    url: 'https://deepmind.google/discover/blog/rss.xml',
    enabled: true,
    category: 'Research'
  }
]

export interface RSSItem {
  title: string
  link: string
  description: string
  pubDate: string
  source: string
}

export async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
  try {
    const response = await fetch(url)
    const text = await response.text()
    return parseRSS(text)
  } catch (error) {
    console.error(`Failed to fetch RSS feed: ${url}`, error)
    return []
  }
}

function parseRSS(xml: string): RSSItem[] {
  // Simple RSS parser - in production use a proper parser
  const items: RSSItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const title = extractTag(itemXml, 'title')
    const link = extractTag(itemXml, 'link')
    const description = extractTag(itemXml, 'description')
    const pubDate = extractTag(itemXml, 'pubDate')
    
    if (title && link) {
      items.push({
        title: title.trim(),
        link,
        description: description?.trim() || '',
        pubDate: pubDate || new Date().toISOString(),
        source: 'RSS'
      })
    }
  }
  
  return items
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1] : null
}

export async function fetchAllFeeds(): Promise<RSSItem[]> {
  const enabledFeeds = RSS_FEEDS.filter(f => f.enabled)
  const results = await Promise.allSettled(
    enabledFeeds.map(feed => fetchRSSFeed(feed.url))
  )
  
  return results
    .filter((r): r is PromiseFulfilledResult<RSSItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
