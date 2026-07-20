# Signal — LLM & AI News Aggregator

Editorial news aggregator for LLM/AI coverage. Built with TanStack Start, React 19, Vite, and Tailwind v4.

## Features

- ~30 seeded realistic stories across Models, Research, Open Source, Policy, Industry, Tools
- Topic filters + full-text search
- Featured lead story + dense wire feed
- Story detail routes
- Bookmarks persisted in localStorage (zustand)
- Dark editorial design (ink neutrals + amber accent)

## Scripts

```bash
npm run dev        # 0.0.0.0:8080
npm run build
npm run typecheck
bash startup.sh    # idempotent dev server start
```

## Stack

TanStack Start / Router, React 19, Vite 7/8, Tailwind v4, zustand, lucide, zod.
