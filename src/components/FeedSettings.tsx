import { useEffect, useRef, useState } from 'react'
import { Plus, Radio, Settings2, Trash2 } from 'lucide-react'
import { TOPICS } from '@/data/news'
import {
  useUserFeedStore,
  type UserFeed,
} from '@/lib/feed-store'

/**
 * User-managed feed settings (issue #16).
 *
 * A gear button in the header opens a panel where the user can add their own
 * RSS/Atom feeds, toggle them, rename them, and remove them. Feeds persist in
 * `localStorage` (see `feed-store.ts`) and are merged into the refresh
 * pipeline (see `feed.ts`); the server proxy only fetches them after they pass
 * the SSRF-safe guard, so the UI surfaces the guard's rejection reason
 * verbatim when an unsafe URL is entered.
 *
 * Collapsed by default and operable by keyboard/AT: `aria-expanded` on the
 * toggle, Escape and outside-click to close, labelled inputs and per-row
 * actions.
 */
export function FeedSettings() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The row currently being renamed (by URL), if any.
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const userFeeds = useUserFeedStore((s) => s.userFeeds)
  const addFeed = useUserFeedStore((s) => s.addFeed)
  const removeFeed = useUserFeedStore((s) => s.removeFeed)
  const toggleFeed = useUserFeedStore((s) => s.toggleFeed)
  const renameFeed = useUserFeedStore((s) => s.renameFeed)

  // Close on Escape and on a click outside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  const enabledCount = userFeeds.filter((f) => f.enabled).length

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (url.trim() === '') {
      setError('Enter a feed URL.')
      return
    }
    const res = addFeed({
      url: url.trim(),
      name: name.trim() || undefined,
      category: category || undefined,
    })
    if (!res.ok) {
      setError(res.reason)
      return
    }
    // Success: reset the form and keep the panel open so the new feed is
    // visible in the list.
    setUrl('')
    setName('')
    setCategory('')
    setError(null)
  }

  function startRename(feed: UserFeed) {
    setRenaming(feed.url)
    setRenameValue(feed.name)
  }

  function saveRename(feed: UserFeed) {
    renameFeed(feed.url, renameValue)
    setRenaming(null)
    setRenameValue('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="feed-settings-panel"
        title={
          userFeeds.length > 0
            ? `Custom feeds (${enabledCount} of ${userFeeds.length} enabled)`
            : 'Custom feeds'
        }
        aria-label="Feed settings"
        className="inline-flex items-center gap-1.5 rounded-sm border border-ink-700/80 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-ink-200 transition hover:border-amber-accent/40 hover:text-amber-soft"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Feeds</span>
        {userFeeds.length > 0 && (
          <span className="ml-0.5 min-w-[1.1rem] rounded-full bg-amber-accent/15 px-1.5 text-center text-[10px] font-semibold text-amber-soft">
            {enabledCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="feed-settings-panel"
          data-testid="feed-settings-panel"
          role="dialog"
          aria-label="Custom feed settings"
          className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,24rem)] rounded-sm border border-ink-700/80 bg-ink-900 p-3 shadow-xl shadow-black/40"
        >
          <div className="mb-3 flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-amber-accent" strokeWidth={2.25} />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-300">
              Custom feeds
            </h2>
          </div>

          <form data-testid="feed-settings-form" onSubmit={handleAdd} className="space-y-2">
            <div>
              <label
                htmlFor="feed-settings-url"
                className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink-500"
              >
                Feed URL
              </label>
              <input
                id="feed-settings-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="w-full rounded-sm border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 focus:border-amber-accent/60 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="feed-settings-name"
                  className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink-500"
                >
                  Name <span className="normal-case text-ink-600">(optional)</span>
                </label>
                <input
                  id="feed-settings-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Blog"
                  className="w-full rounded-sm border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 focus:border-amber-accent/60 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="feed-settings-topic"
                  className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink-500"
                >
                  Topic
                </label>
                <select
                  id="feed-settings-topic"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-sm border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs text-ink-100 focus:border-amber-accent/60 focus:outline-none"
                >
                  <option value="">Auto</option>
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && (
              <p role="alert" data-testid="feed-settings-error" className="text-[11px] text-amber-soft">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-sm border border-amber-accent/40 bg-amber-accent/10 px-2.5 py-1.5 text-xs font-medium text-amber-soft transition hover:bg-amber-accent/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Add feed
            </button>
          </form>

          <div className="mt-3 border-t border-ink-800 pt-3">
            {userFeeds.length === 0 ? (
              <p className="text-[11px] text-ink-500">
                No custom feeds yet. Add one above — it will be polled along
                with the built-in feeds.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="Custom feeds">
                {userFeeds.map((feed) => (
                  <li
                    key={feed.url}
                    data-testid="feed-settings-row"
                    data-feed-url={feed.url}
                    data-enabled={feed.enabled}
                    className="flex items-center gap-2 rounded-sm bg-ink-950/50 px-2.5 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        feed.enabled ? 'bg-emerald-400' : 'bg-ink-600'
                      }`}
                    />
                    <div className="min-w-0 flex-1 leading-tight">
                      {renaming === feed.url ? (
                        <div className="flex items-center gap-1">
                          <input
                            aria-label={`Rename ${feed.name}`}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                saveRename(feed)
                              }
                            }}
                            className="w-full min-w-0 rounded-sm border border-ink-700 bg-ink-950 px-1.5 py-0.5 text-xs text-ink-100 focus:border-amber-accent/60 focus:outline-none"
                          />
                          <button
                            type="button"
                            aria-label={`Save name for ${feed.name}`}
                            onClick={() => saveRename(feed)}
                            className="shrink-0 rounded-sm border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-300 hover:text-amber-soft"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="truncate text-xs font-medium text-ink-100">
                            {feed.name}
                            {feed.category && (
                              <span className="ml-1.5 text-[10px] text-ink-500">
                                {feed.category}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[10px] text-ink-500">
                            {feed.url}
                          </div>
                        </>
                      )}
                    </div>
                    {renaming !== feed.url && (
                      <>
                        <button
                          type="button"
                          aria-label={`Rename ${feed.name}`}
                          onClick={() => startRename(feed)}
                          title="Rename"
                          className="shrink-0 text-[10px] font-medium text-ink-400 hover:text-amber-soft"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Toggle ${feed.name}`}
                          title={feed.enabled ? 'Disable feed' : 'Enable feed'}
                          onClick={() => toggleFeed(feed.url)}
                          className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${
                            feed.enabled
                              ? 'border-emerald-400/40 text-emerald-300'
                              : 'border-ink-700 text-ink-400'
                          }`}
                        >
                          {feed.enabled ? 'On' : 'Off'}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${feed.name}`}
                          title="Remove feed"
                          onClick={() => removeFeed(feed.url)}
                          className="shrink-0 text-ink-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
