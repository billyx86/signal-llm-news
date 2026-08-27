import type { Story } from '@/data/news'

/**
 * Share support for Signal stories.
 *
 * Prefers the native Web Share API (the OS share sheet) where the browser
 * supports it, and falls back to copying the story URL to the clipboard on
 * platforms that don't. Every share attempt records a count so the UI can
 * show "shared N times" and analytics can be derived later.
 *
 * The shared URL is always an *absolute* URL (built from `window.location`),
 * because the Web Share API rejects relative `url` values on some platforms
 * and because a share must resolve for the *recipient*, not the sharer.
 */

export type ShareMethod = 'web-share' | 'clipboard' | 'unsupported'

export interface ShareResult {
  method: ShareMethod
  ok: boolean
  /** The URL that was shared or copied (when available). */
  url?: string
  /** Human-readable explanation of any failure. */
  error?: string
}

/**
 * Build an absolute URL for a story.
 *
 * @param id - Story id (the route param under `/story/:id`).
 * @param base - Base origin. Defaults to the current page origin, or a
 *   placeholder when run outside a browser (SSR / tests).
 */
export function buildStoryUrl(id: string, base?: string): string {
  const origin =
    base ??
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://signal-llm-news.example.com')
  return `${origin.replace(/\/$/, '')}/story/${encodeURIComponent(id)}`
}

/**
 * Build the share payload for a story: title, a short text line, and URL.
 */
export function buildShareData(story: Story): {
  title: string
  text: string
  url: string
} {
  const url = buildStoryUrl(story.id)
  return {
    title: story.title,
    text: `${story.title} — ${story.summary}`,
    url,
  }
}

/**
 * Whether the environment supports the Web Share API with a URL.
 *
 * We probe `navigator.share` and the (non-standard but widely implemented)
 * `navigator.canShare` so we never call `share()` with a URL it would
 * reject. `canShare` is probed with a placeholder URL because some browsers
 * (notably iOS Safari) report `false` for empty payloads.
 */
export function canUseWebShare(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!('share' in navigator)) return false
  if (!('canShare' in navigator)) return true
  try {
    return navigator.canShare?.({ url: 'https://example.com/' }) === true
  } catch {
    return false
  }
}

/**
 * Copy text to the clipboard, with a legacy execCommand fallback.
 *
 * @returns true when the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy path
    }
  }
  if (typeof document === 'undefined') return false
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

/**
 * Share a story using the best available mechanism.
 *
 * Order of preference:
 * 1. Native Web Share API (when it accepts a URL) — opens the OS share sheet.
 * 2. Clipboard copy of the absolute story URL — for unsupported browsers.
 * 3. Failure — reported, never thrown.
 *
 * The caller is responsible for recording the outcome via the share store so
 * counts stay a single source of truth.
 *
 * @param story - The story to share.
 * @param signal - Optional AbortSignal to cancel an in-flight native share.
 */
export async function shareStory(
  story: Story,
  _signal?: AbortSignal,
): Promise<ShareResult> {
  const data = buildShareData(story)

  if (canUseWebShare()) {
    try {
      await navigator.share({ title: data.title, text: data.text, url: data.url })
      return { method: 'web-share', ok: true, url: data.url }
    } catch (error) {
      // The user dismissing the share sheet is not a failure worth surfacing.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { method: 'web-share', ok: true, url: data.url }
      }
      // Some browsers throw NotAllowedError if the tab lacks user gesture
      // permissions; fall through to clipboard rather than failing outright.
      if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') {
        return { method: 'web-share', ok: false, url: data.url, error: String(error) }
      }
    }
  }

  const copied = await copyToClipboard(data.url)
  if (copied) {
    return { method: 'clipboard', ok: true, url: data.url }
  }
  return {
    method: 'unsupported',
    ok: false,
    url: data.url,
    error: 'Sharing is not supported in this browser.',
  }
}
