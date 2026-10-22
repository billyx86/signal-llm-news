import { useState } from 'react'
import { Activity } from 'lucide-react'
import { useFeedStore, classifyFeedHealth } from '@/lib/feed'
import { relativeTime } from '@/lib/time'

/**
 * A per-feed "health" panel (issue #18).
 *
 * The blended `failedFeeds` count in the header can't tell "the publisher is
 * down" from "I misconfigured a feed". This panel lists every enabled feed
 * with its own last status, failure reason (HTTP code / timeout / network),
 * and last-updated time, and marks feeds whose data is stale (fetched more
 * than 2× the refresh interval ago) distinctly from outright failures.
 *
 * Collapsed by default so it never competes with the story feed; expands on
 * click, and is keyboard/AT-operable.
 */
export function FeedHealth() {
  const feedStatuses = useFeedStore((s) => s.feedStatuses)
  const [open, setOpen] = useState(false)

  if (feedStatuses.length === 0) return null

  const failed = feedStatuses.filter((s) => !s.ok).length

  return (
    <section
      aria-label="Feed health"
      data-testid="feed-health"
      className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="feed-health-panel"
        className="flex w-full items-center gap-2 rounded-sm border border-ink-800/80 bg-ink-900/50 px-3 py-2 text-left text-xs text-ink-400 transition hover:border-ink-700 hover:text-ink-200"
      >
        <Activity className="h-3.5 w-3.5 text-ink-500" strokeWidth={2} />
        <span className="font-medium">Feed health</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            failed > 0
              ? 'bg-amber-accent/15 text-amber-soft'
              : 'bg-emerald-400/15 text-emerald-300'
          }`}
        >
          {failed > 0 ? `${failed} down` : 'all good'}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-ink-600">
          {open ? 'hide' : 'show'}
        </span>
      </button>

      {open && (
        <div
          id="feed-health-panel"
          data-testid="feed-health-panel"
          className="mt-2 grid gap-1.5 rounded-sm border border-ink-800/80 bg-ink-900/30 p-3 sm:grid-cols-2"
        >
          {feedStatuses.map((s) => {
            const health = classifyFeedHealth(s)
            const stateLabel =
              health === 'failed'
                ? s.reason === 'timeout'
                  ? 'timeout'
                  : 'failed'
                : health === 'stale'
                  ? 'stale'
                  : 'ok'
            const detail = s.ok
              ? `${s.itemCount} items · ${relativeTime(s.fetchedAt)}`
              : `${s.reason ?? 'error'} · ${relativeTime(s.fetchedAt)}`
            return (
              <div
                key={s.name}
                data-testid={`feed-health-row`}
                data-health={health}
                title={`${s.name} — ${stateLabel} — ${detail}`}
                className="flex items-center gap-2.5 rounded-sm bg-ink-950/40 px-3 py-2"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    health === 'failed'
                      ? 'bg-amber-accent'
                      : health === 'stale'
                        ? 'bg-ink-400'
                        : 'bg-emerald-400'
                  }`}
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-xs font-medium text-ink-100">{s.name}</div>
                  <div className="truncate text-[10px] text-ink-500">{detail}</div>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider ${
                    health === 'failed'
                      ? 'text-amber-soft'
                      : health === 'stale'
                        ? 'text-ink-400'
                        : 'text-emerald-300'
                  }`}
                >
                  {stateLabel}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
