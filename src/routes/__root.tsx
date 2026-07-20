import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: 'Signal — LLM & AI News',
      },
      {
        name: 'description',
        content:
          'Signal is an editorial aggregator for LLM and AI news — models, research, open source, policy, industry, and tools.',
      },
      { name: 'theme-color', content: '#0c0d0f' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h1 className="font-display text-3xl text-ink-50">Story not found</h1>
      <p className="mt-2 text-ink-400">That briefing is not in the Signal archive.</p>
      <a href="/" className="mt-6 inline-block text-sm text-amber-soft underline-offset-4 hover:underline">
        Back to feed
      </a>
    </div>
  ),
})

function RootComponent() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col bg-ink-950 font-sans text-ink-100 antialiased">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <Scripts />
      </body>
    </html>
  )
}
