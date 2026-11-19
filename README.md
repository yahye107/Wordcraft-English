# Wordcraft

A personal English writing-development platform. See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the build plans.

## Run

```
npm install
npm run content:seed   # load content/ into data/wordcraft.sqlite
npm run dev
```

## Tech notes

- SQLite driver: Node's built-in `node:sqlite` (FTS5 verified on Node 26). No native build step.
- Optional AI features need `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`). The app works without it.
- Tests: `npm test` (Vitest), `npm run test:e2e` (Playwright).
