import type { UserFeed } from '@/lib/feed-store'
import type { FeedStatus } from '@/lib/rss'
import {
  classifyFeedHealth,
  formatBackoffInterval,
  nextAttemptAt,
  type FeedBackoffState,
} from '@/lib/feed'
import { relativeTime } from '@/lib/time'

/** The states the settings-panel chip can be in (issues #23, #26). */
export type FeedChipState = 'healthy' | 'stale' | 'error' | 'disabled'

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
 *   reason (HTTP status / timeout / network). When a backoff state is known
 *   and the feed's next attempt is in the future, the tooltip adds
 *   "retrying in Xm" so the user sees how long until the next attempt
 *   (issue #25).
 * - `healthy`  — the last refresh succeeded (or no refresh has run yet this
 *   session); a neutral chip.
 *
 * The state is *derived* from `feed.enabled` + the last `FeedStatus`, so
 * disabling then re-enabling a feed "resets" automatically: it shows `off`
 * while disabled and falls back to the last known `healthy`/`error` the moment
 * it is switched back on — no manual reset and no new fetch required.
 *
 * `backoff` is optional so the chip keeps working where no backoff state is
 * available (e.g. the built-in feeds' rows render their own status elsewhere).
 */
export function feedChipState(
  feed: { enabled: boolean; name: string },
  status: FeedStatus | undefined,
  now = Date.now(),
  backoff?: FeedBackoffState,
): FeedChipInfo {
  if (!feed.enabled) {
    return { state: 'disabled', label: 'off', title: `${feed.name} — disabled` }
  }
  if (status && !status.ok) {
    const reason = status.reason ?? 'unknown error'
    const retryHint = backoff ? retryHintFor(backoff, now) : null
    const retrySuffix = retryHint ? ` · retrying in ${retryHint}` : ''
    return {
      state: 'error',
      label: reason,
      title: `${feed.name} — last refresh failed (${reason}) · ${relativeTime(status.fetchedAt, now)}${retrySuffix}`,
    }
  }
  if (status && status.ok) {
    const health = classifyFeedHealth(status, now)
    if (health === 'stale') {
      // A stale-but-ok feed gets its own *visible* state (issue #26): the
      // label is no longer a plain "ok" with a tooltip-only "stale · " prefix,
      // so users can see at a glance which feeds have stopped delivering
      // fresh items and can pause them.
      return {
        state: 'stale',
        label: 'stale',
        title: `${feed.name} — stale · ${status.itemCount} item${
          status.itemCount === 1 ? '' : 's'
        } · ${relativeTime(status.fetchedAt, now)}`,
      }
    }
    return {
      state: 'healthy',
      label: 'ok',
      title: `${feed.name} — ${status.itemCount} item${
        status.itemCount === 1 ? '' : 's'
      } · ${relativeTime(status.fetchedAt, now)}`,
    }
  }
  // Enabled but no refresh has recorded a status for it this session yet.
  return { state: 'healthy', label: 'ok', title: `${feed.name} — not fetched yet` }
}

/**
 * "in 45m" for a feed suspended until a future attempt; `null` when the feed
 * is not suspended (it has no backoff state, or its next attempt is due now).
 * Pure (issue #25).
 */
function retryHintFor(backoff: FeedBackoffState, now: number): string | null {
  const next = nextAttemptAt(backoff.lastAttemptAt, backoff)
  if (next === null || next <= now) return null
  return formatBackoffInterval(next - now)
}

/**
 * A small per-feed state chip for the settings panel (issue #23):
 * healthy / error (with the failure reason inline) / disabled. The failure
 * reason also appears in the hover tooltip, along with how long until the
 * next attempt when the feed is suspended by retry backoff (issue #25).
 */
export function FeedStatusChip(props: {
  feed: UserFeed
  status: FeedStatus | undefined
  now?: number
  /** Per-feed retry backoff state, when available (issue #25). */
  backoff?: FeedBackoffState
}) {
  const { feed, status, now, backoff } = props
  const info = feedChipState(feed, status, now, backoff)
  const tone =
    info.state === 'error'
      ? 'border-amber-accent/40 bg-amber-accent/10 text-amber-soft'
      : info.state === 'stale'
        ? 'border-amber-dim/40 bg-amber-dim/10 text-amber-dim'
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
