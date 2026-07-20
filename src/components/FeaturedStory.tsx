import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Bookmark } from 'lucide-react'
import type { Story } from '@/data/news'
import { relativeTime } from '@/lib/time'
import { useBookmarkStore } from '@/lib/store'

export function FeaturedStory({ story }: { story: Story }) {
  const bookmarked = useBookmarkStore((s) => s.bookmarks.includes(story.id))
  const toggle = useBookmarkStore((s) => s.toggleBookmark)

  return (
    <section className="relative overflow-hidden border border-ink-700/50 bg-ink-900/40">
      <div className="absolute inset-y-0 left-0 w-1 bg-amber-accent" />
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.4fr_1fr] lg:gap-10">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
            <span className="rounded-sm bg-amber-accent px-1.5 py-0.5 text-ink-950">Lead</span>
            <span className="text-amber-dim">{story.topic}</span>
            <span className="text-ink-600">/</span>
            <span className="text-ink-400">{story.source}</span>
            <span className="text-ink-600">/</span>
            <time className="text-ink-400" dateTime={story.publishedAt}>
              {relativeTime(story.publishedAt)}
            </time>
          </div>
          <h2 className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-ink-50 sm:text-4xl lg:text-[2.65rem]">
            <Link
              to="/story/$id"
              params={{ id: story.id }}
              className="transition hover:text-amber-soft"
            >
              {story.title}
            </Link>
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-300 sm:text-base">
            {story.summary}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/story/$id"
              params={{ id: story.id }}
              className="inline-flex items-center gap-1.5 rounded-sm bg-ink-50 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-ink-950 transition hover:bg-amber-soft"
            >
              Read briefing
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => toggle(story.id)}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                bookmarked
                  ? 'border-amber-accent/50 bg-amber-accent/10 text-amber-soft'
                  : 'border-ink-600 text-ink-300 hover:border-ink-400 hover:text-ink-100'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
              {bookmarked ? 'Saved' : 'Save'}
            </button>
            <span className="text-xs text-ink-500">{story.readTime} min read · {story.author}</span>
          </div>
        </div>
        <aside className="flex flex-col justify-between border-t border-ink-700/50 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500">
              Why it matters
            </div>
            <p className="mt-2 font-display text-lg leading-snug text-ink-200">
              Frontier reasoning systems are competing on deliberate compute, not just pretraining
              scale — and open weights are closing the gap faster than policy can track.
            </p>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">Source</dt>
              <dd className="mt-0.5 font-medium text-ink-200">{story.source}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">Desk</dt>
              <dd className="mt-0.5 font-medium text-ink-200">{story.author}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">Topic</dt>
              <dd className="mt-0.5 font-medium text-amber-dim">{story.topic}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">Length</dt>
              <dd className="mt-0.5 font-medium text-ink-200">{story.readTime} minutes</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  )
}
