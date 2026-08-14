# Code Style Guide

## TypeScript

- Use explicit types for props and return values
- Prefer `type` over `interface` for data shapes
- Use `readonly` for immutable data
- Avoid `any`, use `unknown` when type is truly unknown

## React

- Functional components only
- Use hooks for state and side effects
- Keep components under 150 lines
- Extract complex logic to custom hooks
- Use composition over props drilling

## Naming

- Components: PascalCase
- Files: PascalCase for components, camelCase for utilities
- Constants: UPPER_SNAKE_CASE
- Variables/functions: camelCase

## Imports

- Group imports: external, internal, relative
- Use absolute imports with `@/` alias
- Import types separately with `import type`

## Tailwind CSS

- Use utility classes directly
- Extract common patterns to components
- Avoid custom CSS unless necessary
- Follow design system: ink neutrals + amber accent

## Git Commits

Conventional commits format:

```
type(scope): description

feat: new feature
fix: bug fix
docs: documentation
style: formatting
refactor: code restructure
test: tests
chore: maintenance
```

Examples:
- `feat(filters): add date range filter`
- `fix(bookmark): persist across tabs`
- `docs: update contributing guide`
