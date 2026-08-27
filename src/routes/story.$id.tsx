import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { ArrowLeft, Bookmark, ExternalLink } from 'lucide-react'
import { getStoryById, stories } from '@/data/news'
import { relativeTime } from '@/lib/time'
import { useBookmarkStore } from '@/lib/store'
import { useFeedStore } from '@/lib/feed'
import { ShareButton } from '@/components/ShareButton'
import { useShareStore } from '@/lib/share-store'

export const Route = createFileRoute('/story/$id')({
  component: StoryPage,
})

function StoryPage() {
  const { id } = Route.useParams()
  const liveStories = useFeedStore((s) => s.liveStories)

  // Resolve the story from the live RSS feed first, then the seeded archive.
  // The deploy target is a static SPA, so lookup happens client-side instead
  // of in a loader.
  const story = useMemo(() => {
    return liveStories.find((s) => s.id === id) ?? getStoryById(id)
  }, [liveStories, id])

  const bookmarked = useBookmarkStore((s) => s.bookmarks.includes(story?.id ?? ''))
  const toggle = useBookmarkStore((s) => s.toggleBookmark)
  const shareCount = useShareStore((s) => s.counts[story?.id ?? ''] ?? 0)

  if (!story) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-2xl text-ink-200">Story not found</h1>
        <p className="mt-2 text-sm text-ink-500">
          It may have been removed, or the feed item it came from has rotated out.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block text-xs font-semibold uppercase tracking-wider text-amber-soft hover:text-amber-accent"
        >
          Back to feed
        </Link>
      </div>
    )
  }

  const related = [...liveStories, ...stories]
    .filter((s) => s.topic === story.topic && s.id !== story.id)
    .slice(0, 4)

  const paragraphs = story.body.split('\n\n').filter(Boolean)

  return (
    <article className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500 transition hover:text-amber-soft"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to feed
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            <span className="text-amber-dim">{story.topic}</span>
            <span className="text-ink-700">·</span>
            <span>{story.source}</span>
            <span className="text-ink-700">·</span>
            <time dateTime={story.publishedAt}>{relativeTime(story.publishedAt)}</time>
            <span className="text-ink-700">·</span>
            <span>{story.readTime} min read</span>
          </div>

          <h1 className="font-display text-3xl font-semibold leading-[1.12] tracking-tight text-ink-50 sm:text-4xl lg:text-[2.75rem]">
            {story.title}
          </h1>

          <p className="mt-5 border-l-2 border-amber-accent/70 pl-4 text-base leading-relaxed text-ink-300 sm:text-lg">
            {story.summary}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-ink-700/50 pb-6">
            <button
              type="button"
              onClick={() => toggle(story.id)}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                bookmarked
                  ? 'border-amber-accent/50 bg-amber-accent/10 text-amber-soft'
                  : 'border-ink-600 text-ink-300 hover:border-ink-400'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
              {bookmarked ? 'Saved' : 'Save story'}
            </button>
            <ShareButton story={story} variant="full" />
            {shareCount > 0 && (
              <span className="text-xs text-ink-500">
                Shared {shareCount} {shareCount === 1 ? 'time' : 'times'}
              </span>
            )}
            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-amber-soft"
            >
              Original source
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-xs text-ink-500">By {story.author}</span>
          </div>

          <div className="prose-signal mt-8 space-y-5">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-[1.75] text-ink-200 sm:text-base">
                {p}
              </p>
            ))}
          </div>
        </div>

        <aside className="lg:border-l lg:border-ink-700/50 lg:pl-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500">
            More in {story.topic}
          </h2>
          <ul className="mt-3 space-y-4">
            {related.map((r) => (
              <li key={r.id} className="border-b border-ink-800 pb-4 last:border-0">
                <Link
                  to="/story/$id"
                  params={{ id: r.id }}
                  className="font-display text-sm font-semibold leading-snug text-ink-100 transition hover:text-amber-soft"
                >
                  {r.title}
                </Link>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-500">
                  {r.source} · {relativeTime(r.publishedAt)}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </article>
  )
}
