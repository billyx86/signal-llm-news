import { Bookmark } from 'lucide-react'
import { useBookmarkStore } from '@/lib/store'

export function BookmarkButton({
  id,
  label,
  className = '',
}: {
  id: string
  label?: boolean
  className?: string
}) {
  const bookmarked = useBookmarkStore((s) => s.bookmarks.includes(id))
  const toggle = useBookmarkStore((s) => s.toggleBookmark)

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle(id)
      }}
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
        bookmarked
          ? 'border-amber-accent/50 bg-amber-accent/10 text-amber-soft'
          : 'border-ink-700/60 text-ink-500 hover:border-ink-500 hover:text-ink-200'
      } ${className}`}
      aria-label={bookmarked ? 'Remove bookmark' : 'Save story'}
    >
      <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
      {label ? (bookmarked ? 'Saved' : 'Save') : null}
    </button>
  )
}
