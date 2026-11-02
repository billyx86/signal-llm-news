import type { UserFeed } from '@/lib/feed-store'
import type { FeedStatus } from '@/lib/rss'
import { classifyFeedHealth } from '@/lib/feed'
import { relativeTime } from '@/lib/time'

/** The three states the settings-panel chip can be in (issue #23). */
export type FeedChipState = 'healthy' | 'error' | 'disabled'

/** A chip's rendered label + tooltip, derived purely from the feed + last status. */
export type FeedChipInfo = {
  state: FeedChipState
  /** Short label shown inside the chip. */
  label: string
  /** Tooltip shown on hover. */
  title: string
}

/**
 * Derive the settings-panel chip for one user feed (issue #23). Pure and
 * synchronous so it is trivially unit-testable; `now` is injectable to make
 * staleness and time formatting deterministic in tests.
 *
 * - `disabled` — the feed is toggled off; its last status is irrelevant.
 * - `error`    — the last refresh for this feed failed; the label carries the
 *   reason (HTTP status / timeout / network).
 * - `healthy`  — the last refresh succeeded (or no refresh has run yet this
 *   session); a neutral chip.
 *
 * The state is *derived* from `feed.enabled` + the last `FeedStatus`, so
 * disabling then re-enabling a feed "resets" automatically: it shows `off`
 * while disabled and falls back to the last known `healthy`/`error` the moment
 * it is switched back on — no manual reset and no new fetch required.
 */
export function feedChipState(
  feed: { enabled: boolean; name: string },
  status: FeedStatus | undefined,
  now = Date.now(),
): FeedChipInfo {
  if (!feed.enabled) {
    return { state: 'disabled', label: 'off', title: `${feed.name} — disabled` }
  }
  if (status && !status.ok) {
    const reason = status.reason ?? 'unknown error'
    return {
      state: 'error',
      label: reason,
      title: `${feed.name} — last refresh failed (${reason}) · ${relativeTime(status.fetchedAt, now)}`,
    }
  }
  if (status && status.ok) {
    const health = classifyFeedHealth(status, now)
    const stalePrefix = health === 'stale' ? 'stale · ' : ''
    return {
      state: 'healthy',
      label: 'ok',
      title: `${feed.name} — ${stalePrefix}${status.itemCount} item${
        status.itemCount === 1 ? '' : 's'
      } · ${relativeTime(status.fetchedAt, now)}`,
    }
  }
  // Enabled but no refresh has recorded a status for it this session yet.
  return { state: 'healthy', label: 'ok', title: `${feed.name} — not fetched yet` }
}

/**
 * A small per-feed state chip for the settings panel (issue #23):
 * healthy / error (with the failure reason inline) / disabled. The failure
 * reason also appears in the hover tooltip.
 */
export function FeedStatusChip(props: {
  feed: UserFeed
  status: FeedStatus | undefined
  now?: number
}) {
  const { feed, status, now } = props
  const info = feedChipState(feed, status, now)
  const tone =
    info.state === 'error'
      ? 'border-amber-accent/40 bg-amber-accent/10 text-amber-soft'
      : info.state === 'disabled'
        ? 'border-ink-700 bg-ink-950/40 text-ink-500'
        : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
  return (
    <span
      data-testid="feed-status-chip"
      data-chip-state={info.state}
      title={info.title}
      aria-label={`${feed.name} status: ${info.state}${
        info.state === 'error' ? `, ${info.label}` : ''
      }`}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {info.label}
    </span>
  )
}
