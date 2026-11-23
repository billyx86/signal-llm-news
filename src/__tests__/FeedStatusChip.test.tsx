import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { FeedStatusChip, feedChipState } from '@/components/FeedStatusChip'
import type { UserFeed } from '@/lib/feed-store'
import type { FeedStatus } from '@/lib/rss'
import type { FeedBackoffState } from '@/lib/feed'

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

/** A feed suspended by retry backoff: 2 consecutive failures, last tried 1m ago. */
function backoff(over: Partial<FeedBackoffState> = {}): FeedBackoffState {
  return { consecutiveFailures: 2, lastAttemptAt: recent, ...over }
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

  it('adds "retrying in Xm" to the tooltip when the failed feed is suspended by backoff (issue #25)', () => {
    // 2 consecutive failures, last tried 1m ago → next attempt in ~44m.
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x' }),
      status({ ok: false, status: 404, reason: 'HTTP 404' }),
      now,
      backoff(),
    )
    expect(info.state).toBe('error')
    expect(info.title).toContain('retrying in 44m')
  })

  it('omits the retry hint once the backoff window has elapsed (issue #25)', () => {
    // Last tried long enough ago that the 45m window is over → due again.
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x' }),
      status({ ok: false, status: 404, reason: 'HTTP 404' }),
      now,
      backoff({ lastAttemptAt: new Date(now - 2 * 60 * 60_000).toISOString() }),
    )
    expect(info.state).toBe('error')
    expect(info.title).not.toContain('retrying in')
  })

  it('omits the retry hint when no backoff state is provided (issue #25)', () => {
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x' }),
      status({ ok: false, status: 404, reason: 'HTTP 404' }),
      now,
    )
    expect(info.state).toBe('error')
    expect(info.title).not.toContain('retrying in')
  })

  it('is a visible "stale" state (not just a tooltip prefix) when the last ok fetch is older than the stale window (issue #26)', () => {
    // Just past 2 × REFRESH_INTERVAL_MS (10m) → classifyFeedHealth says stale.
    const staleAt = new Date(now - 2 * (5 * 60_000) - 1_000).toISOString()
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x' }),
      status({ ok: true, fetchedAt: staleAt }),
      now,
    )
    expect(info.state).toBe('stale')
    expect(info.label).toBe('stale')
    // The item count + age stay in the tooltip.
    expect(info.title).toContain('3 items')
  })

  it('stays healthy (not stale) when the last ok fetch is within the stale window (issue #26)', () => {
    const info = feedChipState(
      userFeed({ url: 'https://a.com/x' }),
      status({ ok: true, fetchedAt: recent }),
      now,
    )
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

  it('exposes the retry hint in the title tooltip for a suspended failed feed (issue #25)', () => {
    render(
      <FeedStatusChip
        feed={userFeed({ url: 'https://a.com/x' })}
        status={status({ ok: false, status: 404, reason: 'HTTP 404' })}
        now={now}
        backoff={backoff()}
      />,
    )
    expect(screen.getByTestId('feed-status-chip')).toHaveAttribute(
      'title',
      expect.stringContaining('retrying in 44m'),
    )
  })

  it('renders the visible "stale" state with data-chip-state="stale" (issue #26)', () => {
    const staleAt = new Date(now - 2 * (5 * 60_000) - 1_000).toISOString()
    render(
      <FeedStatusChip
        feed={userFeed({ url: 'https://a.com/x' })}
        status={status({ ok: true, fetchedAt: staleAt })}
        now={now}
      />,
    )
    const chip = screen.getByTestId('feed-status-chip')
    expect(chip).toHaveAttribute('data-chip-state', 'stale')
    // The label is visible inline, not only in the tooltip.
    expect(chip).toHaveTextContent('stale')
  })
})
