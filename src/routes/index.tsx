import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { FeaturedStory } from '@/components/FeaturedStory'
import { StoryCard } from '@/components/StoryCard'
import { TopicFilters, type TopicFilter } from '@/components/TopicFilters'
import {
  TOPICS,
  filterStories,
  getFeaturedStory,
  type Topic,
} from '@/data/news'
import { useBookmarkStore } from '@/lib/store'
import { useKeyboardShortcuts } from '@/lib/keyboard'

const searchSchema = z.object({
  topic: z
    .enum(['All', 'Models', 'Research', 'Open Source', 'Policy', 'Industry', 'Tools'])
    .optional()
    .catch('All'),
  q: z.string().optional().catch(''),
  saved: z.boolean().optional().catch(false),
})

export const Route = createFileRoute('/')({
  validateSearch: searchSchema,
  component: HomePage,
})

function HomePage() {
  const { topic = 'All', q = '', saved = false } = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const featured = getFeaturedStory()
  useKeyboardShortcuts()

  const activeTopic = (TOPICS.includes(topic as Topic) ? topic : 'All') as TopicFilter

  const filtered = filterStories({
    topic: activeTopic,
    query: q,
    bookmarkedOnly: saved,
    bookmarkIds: bookmarks,
  })

  const feed = filtered.filter((s) => s.id !== featured.id || activeTopic !== 'All' || q || saved)
  const showFeatured =
    !saved &&
    !q &&
    (activeTopic === 'All' || featured.topic === activeTopic) &&
    filtered.some((s) => s.id === featured.id)

  const setSearch = (next: { topic?: TopicFilter; q?: string; saved?: boolean }) => {
    void navigate({
      search: (prev) => ({
        topic: next.topic ?? prev.topic ?? 'All',
        q: next.q ?? prev.q ?? '',
        saved: next.saved ?? prev.saved ?? false,
      }),
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-accent focus:text-ink-950 rounded">
        Skip to main content
      </a>
      <div className="mb-6 flex flex-col gap-1 border-b border-ink-700/40 pb-5 sm:mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-dim">
          Daily briefing
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
          What moved in AI today
        </h1>
        <p className="max-w-2xl text-sm text-ink-400">
          Curated signal from labs, regulators, and the open-source frontier — dense, attribution-first,
          no purple gradient noise.
        </p>
      </div>

      <TopicFilters
        topic={activeTopic}
        query={q}
        saved={saved}
        onTopic={(t) => setSearch({ topic: t })}
        onQuery={(query) => setSearch({ q: query })}
        onSaved={(v) => setSearch({ saved: v })}
        resultCount={filtered.length}
        aria-label="Filter and search stories"
      />

      {showFeatured && (
        <div className="mt-6 sm:mt-8">
          <FeaturedStory story={featured} />
        </div>
      )}

      <section className="mt-8" id="main-content" aria-label="Stories feed">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
            {saved ? 'Saved archive' : 'The wire'}
          </h2>
          <span className="text-[11px] tabular-nums text-ink-600">{feed.length} items</span>
        </div>

        {feed.length === 0 ? (
          <div className="border border-dashed border-ink-700/60 px-4 py-16 text-center">
            <p className="font-display text-xl text-ink-300">No stories match.</p>
            <p className="mt-2 text-sm text-ink-500">
              {saved
                ? 'Bookmark briefings from the feed to build your archive.'
                : 'Try another topic or clear the search.'}
            </p>
          </div>
        ) : (
          <div className="divide-y-0">
            {feed.map((story) => (
              <StoryCard key={story.id} story={story} dense={feed.length > 12} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
