# Wordcraft

A personal English writing-development platform. See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the build plans.

## Run

```
npm install
npm run dev
```

On first start the library is loaded from `content/` into `data/wordcraft.sqlite` automatically. After you edit or add content files, run `npm run content:validate` and then `npm run content:seed` to apply the changes.

## Tech notes

- SQLite driver: Node's built-in `node:sqlite` (FTS5 verified on Node 26). No native build step.
- Optional AI features need `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`). The app works without it. The Novel lab (`/novel`) analyses pasted passages locally with no key; the tutor layer needs one.
- Tests: `npm test` (Vitest), `npm run test:e2e` (Playwright).
