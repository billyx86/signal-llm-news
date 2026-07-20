# Signal — LLM & AI News Aggregator

**Signal** is an editorial news aggregator for LLM and AI coverage: models, research, open source, policy, industry, and tools.

## Live demo (static SPA)

A self-contained demo lives on the `gh-pages` branch (single `index.html` with seeded data, filters, search, story detail, bookmarks).

- Repo: https://github.com/billyx86/signal-llm-news
- Branch: `gh-pages`

## TanStack Start app (`main`)

Full stack on `main`:

- React 19 + TanStack Start / Router
- Vite + Tailwind v4
- zustand bookmarks (localStorage)
- ~30 seeded stories in `src/data/news.ts`
- Routes: `/`, `/story/$id`
- Dark editorial UI (Newsreader + IBM Plex Sans, ink neutrals + amber accent)

### Scripts

```bash
npm install
npm run dev        # 0.0.0.0:8080
npm run build
npm run typecheck
bash startup.sh    # idempotent non-blocking start
```

### Layout

```
src/
  components/   Header, FeaturedStory, StoryCard, TopicFilters, Footer
  data/news.ts  Seeded stories + filters
  lib/store.ts  Bookmarks (zustand + persist)
  lib/time.ts   Relative timestamps
  routes/       __root, index, story.$id
```

## Design

Cool ink neutrals, single amber accent, magazine density, hairline dividers, strong type hierarchy. Not purple AI gradient slop.
