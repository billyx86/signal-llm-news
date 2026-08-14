# Contributing to Signal

Thank you for your interest in contributing to Signal — LLM & AI News Aggregator. We welcome contributions from the community.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm or npm
- Git

### Development Setup

```bash
git clone https://github.com/billyx86/signal-llm-news.git
cd signal-llm-news
npm install
npm run dev
```

Open http://localhost:8080 to view the app.

## Code Style

We follow standard TypeScript/React conventions:

- Use functional components with hooks
- Prefer explicit types over `any`
- Keep components small and focused
- Use Tailwind CSS for styling
- Follow existing patterns in the codebase

### Formatting

- 2-space indentation
- Single quotes for strings
- Semicolons optional (Prettier will handle)

## Project Structure

```
src/
  components/   Reusable UI components
  data/         Story data and utilities
  lib/          State management and helpers
  routes/       TanStack Router routes
  styles.css    Global styles
```

## Making Changes

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run tests: `npm test`
4. Run typecheck: `npm run typecheck`
5. Commit with conventional commits: `feat: add feature`
6. Push and open a pull request

## Testing

Run tests with:
```bash
npm test
```

Add tests for new features. Test coverage should be maintained.

## Pull Request Process

1. Update README if needed
2. Add tests for new features
3. Ensure typecheck passes
4. Update CHANGELOG.md
5. Request review from maintainers

## Code of Conduct

Be respectful and constructive in all interactions. We are building a community around AI news, and civility matters.

## Questions?

Open an issue for questions about contributing.
