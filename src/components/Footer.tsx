export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink-700/50">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-display text-sm text-ink-300">Signal</span>
          <span className="mx-2 text-ink-700">—</span>
          Editorial LLM &amp; AI intelligence. Seeded demo feed; no live API required.
        </p>
        <p className="uppercase tracking-wider">© {new Date().getFullYear()} Signal Desk</p>
      </div>
    </footer>
  )
}
