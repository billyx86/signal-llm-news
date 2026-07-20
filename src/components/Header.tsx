import { Link } from '@tanstack/react-router'
import { Bookmark, Radio } from 'lucide-react'
import { useBookmarkStore } from '@/lib/store'

export function Header() {
  const count = useBookmarkStore((s) => s.bookmarks.length)

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-amber-accent/40 bg-ink-900 text-amber-accent">
            <Radio className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="leading-none">
            <div className="font-display text-lg font-semibold tracking-tight text-ink-50">
              Signal
            </div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
              LLM Intelligence
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            to="/"
            className="hidden px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-ink-400 transition hover:text-ink-100 sm:inline"
          >
            Feed
          </Link>
          <Link
            to="/"
            search={{ topic: 'All', q: '', saved: true }}
            className="inline-flex items-center gap-1.5 rounded-sm border border-ink-700/80 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-ink-200 transition hover:border-amber-accent/40 hover:text-amber-soft"
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span>Saved</span>
            {count > 0 && (
              <span className="ml-0.5 min-w-[1.1rem] rounded-full bg-amber-accent/15 px-1.5 text-center text-[10px] font-semibold text-amber-soft">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  )
}
