import { describe, it, expect } from 'vitest'
import { stories, getStoryById, getFeaturedStory, filterStories, TOPICS } from '@/data/news'

describe('News utilities', () => {
  it('should return all stories', () => {
    expect(stories.length).toBeGreaterThan(0)
  })

  it('should get story by id', () => {
    const story = getStoryById('openai-o3-reasoning')
    expect(story).toBeDefined()
    expect(story?.title).toContain('OpenAI')
  })

  it('should return undefined for unknown id', () => {
    const story = getStoryById('unknown-id')
    expect(story).toBeUndefined()
  })

  it('should get featured story', () => {
    const featured = getFeaturedStory()
    expect(featured).toBeDefined()
    expect(featured?.featured).toBe(true)
  })

  it('should filter by topic', () => {
    const filtered = filterStories({ topic: 'Models' })
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every(s => s.topic === 'Models')).toBe(true)
  })

  it('should filter by query', () => {
    const filtered = filterStories({ query: 'OpenAI' })
    expect(filtered.length).toBeGreaterThan(0)
    // Filter should find stories related to OpenAI via title, summary, source, topic, author
    expect(filtered.some(s => s.title.toLowerCase().includes('openai') || s.source.toLowerCase().includes('openai'))).toBe(true)
  })

  it('should filter bookmarked stories', () => {
    const filtered = filterStories({ 
      bookmarkedOnly: true, 
      bookmarkIds: ['openai-o3-reasoning'] 
    })
    expect(filtered.length).toBe(1)
    expect(filtered[0].id).toBe('openai-o3-reasoning')
  })

  it('should have all expected topics', () => {
    expect(TOPICS).toEqual([
      'Models',
      'Research',
      'Open Source',
      'Policy',
      'Industry',
      'Tools'
    ])
  })
})
