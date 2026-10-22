import { describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedHealth } from '@/components/FeedHealth'
import { useFeedStore } from '@/lib/feed'
import type { FeedStatus } from '@/lib/rss'

const now = Date.now()

function feedStatus(over: Partial<FeedStatus> & { name: string }): FeedStatus {
  return {
    url: 'https://example.com/rss',
    ok: true,
    status: 200,
    reason: null,
    itemCount: 2,
    fetchedAt: new Date(now - 60_000).toISOString(),
    ...over,
  }
}

beforeEach(() => {
  useFeedStore.setState({ feedStatuses: [] })
})

describe('FeedHealth', () => {
  it('renders nothing before the first refresh', () => {
    render(<FeedHealth />)
    expect(screen.queryByTestId('feed-health')).toBeNull()
  })

  it('renders a collapsed summary and hides rows until expanded', async () => {
    const user = userEvent.setup()
    useFeedStore.setState({
      feedStatuses: [feedStatus({ name: 'OpenAI Blog' })],
    })
    render(<FeedHealth />)

    // Collapsed by default: the panel body is not in the document yet.
    expect(screen.queryByTestId('feed-health-panel')).toBeNull()
    const toggle = screen.getByRole('button', { name: /feed health/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('feed-health-panel')).toBeTruthy()
  })

  it('renders each per-feed state (ok / failed / stale) and its failure reason', async () => {
    const user = userEvent.setup()
    useFeedStore.setState({
      feedStatuses: [
        feedStatus({ name: 'OpenAI Blog', ok: true, itemCount: 5 }),
        feedStatus({
          name: 'Anthropic Blog',
          ok: false,
          status: 404,
          reason: 'HTTP 404',
          itemCount: 0,
        }),
        feedStatus({
          name: 'Hugging Face Blog',
          ok: true,
          // older than 2× the refresh interval, but the last fetch succeeded
          fetchedAt: new Date(now - 2 * 5 * 60 * 1000 - 60_000).toISOString(),
        }),
        feedStatus({
          name: 'DeepMind Blog',
          ok: false,
          status: null,
          reason: 'timeout',
          itemCount: 0,
        }),
      ],
    })
    render(<FeedHealth />)
    await user.click(screen.getByRole('button', { name: /feed health/i }))

    const panel = screen.getByTestId('feed-health-panel')
    const rows = within(panel).getAllByTestId('feed-health-row')
    expect(rows).toHaveLength(4)

    const byName = (name: string) =>
      rows.find((r) => within(r).queryByText(name) !== null)

    // Each state is distinguishable via data-health.
    expect(byName('OpenAI Blog')?.getAttribute('data-health')).toBe('ok')
    expect(byName('Anthropic Blog')?.getAttribute('data-health')).toBe('failed')
    expect(byName('Hugging Face Blog')?.getAttribute('data-health')).toBe('stale')
    expect(byName('DeepMind Blog')?.getAttribute('data-health')).toBe('failed')

    // Failure reason is visible (HTTP code for a bad URL, timeout for a hung feed).
    expect(within(byName('Anthropic Blog')!).getAllByText(/HTTP 404/).length).toBeGreaterThanOrEqual(1)
    expect(within(byName('DeepMind Blog')!).getAllByText(/timeout/).length).toBeGreaterThanOrEqual(1)

    // The collapsed summary badge reflects the number of down feeds.
    expect(screen.getByText('2 down')).toBeTruthy()
  })

  it('shows an "all good" summary when every feed is healthy', async () => {
    useFeedStore.setState({
      feedStatuses: [
        feedStatus({ name: 'OpenAI Blog' }),
        feedStatus({ name: 'Anthropic Blog' }),
      ],
    })
    render(<FeedHealth />)
    expect(screen.getByText('all good')).toBeTruthy()
  })
})
