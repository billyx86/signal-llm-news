import { useCallback, useRef, useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { shareStory } from '@/lib/share-store'
import { useShareStore } from '@/lib/share-store'
import type { Story } from '@/data/news'
import { cn } from '@/lib/utils'

interface Props {
  story: Story
  /** 'icon' is the compact card variant, 'full' adds a text label. */
  variant?: 'icon' | 'full'
  className?: string
}

type Feedback =
  | { kind: 'idle' }
  | { kind: 'shared'; method: 'web-share' | 'clipboard' }
  | { kind: 'error'; message: string }

/**
 * Share button for a story.
 *
 * Uses the native Web Share API where available and falls back to copying
 * the story URL. Shows a brief success/error state inline and displays the
 * per-story share count from the persisted share store.
 */
export function ShareButton({ story, variant = 'icon', className }: Props) {
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const count = useShareStore((s) => s.counts[story.id] ?? 0)
  const timer = useRef<number | null>(null)

  const onClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const { result } = await shareStory(story)
      if (result.ok && result.method === 'clipboard') {
        setFeedback({ kind: 'shared', method: 'clipboard' })
      } else if (result.ok) {
        // Native sheet just closed; no inline state needed.
        setFeedback({ kind: 'idle' })
      } else {
        setFeedback({ kind: 'error', message: result.error ?? 'Share failed' })
      }
    } finally {
      setBusy(false)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setFeedback({ kind: 'idle' }), 2500)
    }
  }, [busy, story])

  const label =
    feedback.kind === 'shared'
      ? feedback.method === 'clipboard'
        ? 'Link copied'
        : 'Shared'
      : feedback.kind === 'error'
        ? feedback.message
        : count > 0
          ? `Share · ${count}`
          : 'Share'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={`Share story: ${story.title}`}
      title={variant === 'icon' ? label : undefined}
      className={cn(
        'relative z-10 inline-flex items-center gap-1.5 rounded-sm border transition disabled:cursor-wait disabled:opacity-60',
        variant === 'icon' ? 'p-1.5' : 'px-3 py-1.5 text-xs font-medium',
        feedback.kind === 'shared'
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : feedback.kind === 'error'
            ? 'border-red-500/40 bg-red-500/10 text-red-300'
            : 'border-ink-700/60 text-ink-500 hover:border-ink-500 hover:text-ink-200',
        className,
      )}
    >
      {feedback.kind === 'shared' ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Share2 className="h-3.5 w-3.5" />
      )}
      {variant === 'full' && <span>{label}</span>}
    </button>
  )
}
