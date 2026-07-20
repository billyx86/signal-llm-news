import { Search, X } from 'lucide-react'
import { TOPICS, type Topic } from '@/data/news'

const ALL = 'All' as const
export type TopicFilter = Topic | typeof ALL

interface Props {
  topic: TopicFilter
  query: string
  saved: boolean
  onTopic: (t: TopicFilter) => void
  onQuery: (q: string) => void
  onSaved: (v: boolean) => void
  resultCount: number
}

export function TopicFilters({
  topic,
  query,
  saved,
  onTopic,
  onQuery,
  onSaved,
  resultCount,
}: Props) {
  const chips: TopicFilter[] = [ALL, ...TOPICS]

  return (
    <div className="space-y-3 border-b border-ink-700/50 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search models, labs, policy…"
            className="w-full rounded-sm border border-ink-700/70 bg-ink-900 py-2 pl-9 pr-9 text-sm text-ink-100 placeholder:text-ink-500 outline-none transition focus:border-amber-accent/50 focus:ring-1 focus:ring-amber-accent/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-500 hover:text-ink-200"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink-500">
          <button
            type="button"
            onClick={() => onSaved(!saved)}
            className={`rounded-sm border px-2.5 py-1.5 font-medium transition ${
              saved
                ? 'border-amber-accent/50 bg-amber-accent/10 text-amber-soft'
                : 'border-ink-700/70 text-ink-400 hover:text-ink-200'
            }`}
          >
            {saved ? 'Saved only' : 'All stories'}
          </button>
          <span className="tabular-nums">{resultCount} results</span>
        </div>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
        {chips.map((t) => {
          const active = topic === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTopic(t)}
              className={`shrink-0 rounded-sm border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition ${
                active
                  ? 'border-amber-accent bg-amber-accent text-ink-950'
                  : 'border-ink-700/60 bg-ink-900/60 text-ink-400 hover:border-ink-500 hover:text-ink-200'
              }`}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
