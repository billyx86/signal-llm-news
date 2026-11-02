import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { FeedStatusChip, feedChipState } from '@/components/FeedStatusChip'
import type { UserFeed } from '@/lib/feed-store'
import type { FeedStatus } from '@/lib/rss'

const now = 1_700_000_000_000
const recent = new Date(now - 60_000).toISOString()

function userFeed(over: Partial<UserFeed> & { url: string }): UserFeed {
  return { name: 'Test Feed', enabled: true, ...over }
}

function status(over: Partial<FeedStatus>): FeedStatus {
  return {
    name: 'Test Feed',
    url: 'https://example.com/feed.xml',
    ok: true,
    status: 200,
    reason: null,
    itemCount: 3,
    fetchedAt: recent,
    ...over,
  }
}

describe('feedChipState (pure helper)', () => {
  it('is healthy when the feed is enabled and its last fetch succeeded', () => {
    const info = feedChipState(userFeed({ url: 'https://a.com/x' }), status({ ok: true }), now)
    expect(info.state).toBe('healthy')
    expect(info.label).toBe('ok')
  })

  it('is an error carrying the HTTP reason when the last fetch 404/500s', () => {
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x' }),
      status({ ok: false, status: 404, reason: 'HTTP 404' }),
      now,
    )
    expect(info.state).toBe('error')
    expect(info.label).toBe('HTTP 404')
    expect(info.title).toMatch(/HTTP 404/)
  })

  it('is an error carrying "timeout" when the last fetch hung', () => {
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x' }),
      status({ ok: false, status: null, reason: 'timeout' }),
      now,
    )
    expect(info.state).toBe('error')
    expect(info.label).toBe('timeout')
  })

  it('is disabled (ignoring the last status) when the feed is toggled off', () => {
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x', enabled: false }),
      status({ ok: true }),
      now,
    )
    expect(info.state).toBe('disabled')
    expect(info.label).toBe('off')
  })

  it('is a neutral "ok" when enabled but no refresh has recorded it yet', () => {
    const info = feedChipState(userFeed({ url: 'https://a.com/x' }), undefined, now)
    expect(info.state).toBe('healthy')
    expect(info.label).toBe('ok')
  })
})

describe('FeedStatusChip (component)', () => {
  it('renders all three states with the failure reason inline on error', () => {
    render(
      <>
        <FeedStatusChip
          feed={userFeed({ url: 'https://a.com/x' })}
          status={status({ ok: true, itemCount: 5 })}
          now={now}
        />
        <FeedStatusChip
          feed={userFeed({ url: 'https://b.com/x' })}
          status={status({ ok: false, status: 503, reason: 'HTTP 503' })}
          now={now}
        />
        <FeedStatusChip
          feed={userFeed({ url: 'https://c.com/x', enabled: false })}
          status={status({ ok: true })}
          now={now}
        />
      </>,
    )

    const chips = screen.getAllByTestId('feed-status-chip')
    expect(chips).toHaveLength(3)
    expect(chips[0].getAttribute('data-chip-state')).toBe('healthy')
    expect(chips[1].getAttribute('data-chip-state')).toBe('error')
    expect(chips[2].getAttribute('data-chip-state')).toBe('disabled')

    // The error reason is visible inline, not just in the tooltip.
    expect(screen.getByText('HTTP 503')).toBeTruthy()
  })

  it('disabling then re-enabling a feed resets the chip without a new fetch', () => {
    const failing = status({ ok: false, status: 404, reason: 'HTTP 404' })
    const { rerender } = render(
      <FeedStatusChip feed={userFeed({ url: 'https://a.com/x' })} status={failing} now={now} />,
    )
    expect(screen.getByTestId('feed-status-chip').getAttribute('data-chip-state')).toBe('error')
    expect(screen.getByText('HTTP 404')).toBeTruthy()

    // User disables the feed: the chip goes to a neutral "off" and hides the error.
    rerender(
      <FeedStatusChip
        feed={userFeed({ url: 'https://a.com/x', enabled: false })}
        status={failing}
        now={now}
      />,
    )
    expect(screen.getByTestId('feed-status-chip').getAttribute('data-chip-state')).toBe('disabled')
    expect(screen.queryByText('HTTP 404')).toBeNull()

    // Re-enable: it returns to the last known state (still the 404) — derived
    // from the stored status, no fetch required.
    rerender(
      <FeedStatusChip
        feed={userFeed({ url: 'https://a.com/x', enabled: true })}
        status={failing}
        now={now}
      />,
    )
    expect(screen.getByTestId('feed-status-chip').getAttribute('data-chip-state')).toBe('error')
    expect(screen.getByText('HTTP 404')).toBeTruthy()
  })
})
