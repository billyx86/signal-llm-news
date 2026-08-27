import { Link } from '@tanstack/react-router'
import { Bookmark } from 'lucide-react'
import type { Story } from '@/data/news'
import { relativeTime } from '@/lib/time'
import { useBookmarkStore } from '@/lib/store'
import { ShareButton } from '@/components/ShareButton'

interface Props {
  story: Story
  dense?: boolean
}

export function StoryCard({ story, dense }: Props) {
  const bookmarked = useBookmarkStore((s) => s.bookmarks.includes(story.id))
  const toggle = useBookmarkStore((s) => s.toggleBookmark)

  return (
    <article className="group relative border-b border-ink-700/40 py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            <span className="text-amber-dim">{story.topic}</span>
            <span className="text-ink-700">·</span>
            <span>{story.source}</span>
            <span className="text-ink-700">·</span>
            <time dateTime={story.publishedAt}>{relativeTime(story.publishedAt)}</time>
            <span className="text-ink-700">·</span>
            <span>{story.readTime} min</span>
          </div>
          <h3
            className={`font-display font-semibold leading-snug tracking-tight text-ink-50 transition group-hover:text-amber-soft ${
              dense ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
            }`}
          >
            <Link to="/story/$id" params={{ id: story.id }} className="after:absolute after:inset-0">
              {story.title}
            </Link>
          </h3>
          {!dense && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-400">
              {story.summary}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ShareButton story={story} />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggle(story.id)
            }}
            className={`relative z-10 shrink-0 rounded-sm border p-1.5 transition ${
              bookmarked
                ? 'border-amber-accent/50 bg-amber-accent/10 text-amber-soft'
                : 'border-ink-700/60 text-ink-500 hover:border-ink-500 hover:text-ink-200'
            }`}
            aria-label={bookmarked ? 'Remove bookmark' : 'Save story'}
          >
            <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </article>
  )
}
