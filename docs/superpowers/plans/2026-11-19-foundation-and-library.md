# Wordcraft Foundation and Expression Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Wordcraft app skeleton and its first working feature set: a file-based, validated, seeded expression library with category explorer, expression pages, intent-aware search, and a settings page with the Claude client in place.

**Architecture:** One Next.js (App Router, TypeScript) app with a local SQLite database. Learning content lives in YAML files under `content/`, is validated with Zod, and is upserted into SQLite by slug; learner data tables are never touched by seeding. All Claude calls go through one server-only module.

**Tech Stack:** Next.js (latest stable), TypeScript, SQLite (FTS5 required) behind a small `Db` wrapper, Zod, `yaml`, `@anthropic-ai/sdk`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-wordcraft-design.md` (this plan covers its Phases 1 and 2; Phases 3 to 9 get later plans).

## Global Constraints

- Runs on Windows 11 with Node 26; one command starts the app (`npm run dev`).
- Anthropic key lives in `.env.local` as `ANTHROPIC_API_KEY`, used server-side only, never sent to the browser. The app is fully usable with no key.
- Default model `claude-sonnet-5-5`; a cheaper model (`claude-haiku-5-5`) for search-query translation. Both overridable in Settings.
- Content is data: adding an expression means adding a YAML file, with no code changes.
- Content tables and learner tables are separate; seeding never deletes learner data.
- Expression levels: `beginner | intermediate | advanced | literary`. Registers: `formal | neutral | informal | conversational | literary`. Kinds: `word | phrase | idiom | collocation | pattern`. Intensity 1 to 5, optional. Status `draft | published`; only `published` is shown in the UI.
- Every published expression has at least 3 original examples, a simple meaning, a contextual meaning and usage notes.
- No text copied from novels or any copyrighted source; all examples original.
- All explanations in simple English.
- Starter content target: at least 4 published expressions in each of the 26 top-level categories and at least 12 contrast groups.
- Responsive from phone width to desktop; reading-first, calm typographic design.
- Project root: `C:\Users\yaxye\Desktop\english\wordcraft`.

## Review Focus

1. Search input containing FTS5 syntax characters (`"`, `*`, `-`, `:`, `(`, unbalanced quotes) must never throw; it returns results or an empty list.
2. Empty, whitespace-only or very long (over 500 characters) queries show a friendly "try searching for a feeling or situation" state, not an error or a full table scan.
3. "Without saying X" must exclude X and its inflections (disappointed, disappointing, disappointment) from the results.
4. Smart search with no key, a failing API call or invalid model output falls back silently to rule-based search and the page still renders.
5. Re-seeding after editing a file updates in place with no duplicates; after deleting a file the orphan is removed; learner rows survive both.
6. Unknown category or expression slug returns a 404 page; expressions lacking optional fields (intensity, mistakes) render without errors; curly quotes, apostrophes and dashes in text survive seed, search and display.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `tests/smoke.test.ts`, `README.md`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (Vitest), `test:e2e` (Playwright, added in Task 15), `content:validate`, `content:seed` (wired in Tasks 4 and 5). `@/` path alias to `src/`.

- [ ] **Step 1: Write the failing test** `tests/smoke.test.ts`: `it('runs on node 22+ with sqlite fts5', ...)` opens an in-memory SQLite database with the chosen driver, creates `CREATE VIRTUAL TABLE t USING fts5(x)`, inserts `'crestfallen'`, and asserts `MATCH 'crestfallen'` returns one row.
- [ ] **Step 2: Run** `npx vitest run tests/smoke.test.ts`. Expected: FAIL (no project yet).
- [ ] **Step 3: Scaffold** the Next.js TypeScript app in `C:\Users\yaxye\Desktop\english\wordcraft` (App Router, `src/` dir, no Tailwind decision yet: leave styling to Task 2). Add Vitest, Zod, `yaml`, `@anthropic-ai/sdk`. Choose the SQLite driver: try Node's built-in `node:sqlite` first; if FTS5 is unavailable or unstable, use `better-sqlite3` (add it to `serverExternalPackages`). Record the choice in `README.md`.
- [ ] **Step 4: Run** the smoke test. Expected: PASS.
- [ ] **Step 5: Initialise git**, add `.gitignore` (`node_modules`, `.next`, `data/`, `.env.local`), commit `chore: scaffold wordcraft`.

### Task 2: Design system and app shell

**Files:**
- Create: `src/app/globals.css` (design tokens), `src/components/AppShell.tsx`, `src/components/Nav.tsx`, `src/app/page.tsx` (placeholder dashboard), `docs/design-direction.md`
- Test: the shell's e2e check is deferred to Task 15; this task verifies visually.

**Interfaces:**
- Produces: CSS tokens (colour, type scale, spacing, radius), `<AppShell>` wrapping every page, primary nav with entries Dashboard, Explore, Search, Labs, Studio, Tutor, Novel, Notebook, Progress (unbuilt ones render a "coming soon" page), a visible focus style and `prefers-reduced-motion` handling.

- [ ] **Step 1: Invoke the user's design skills in order** (`frontend-design`, then `ui-ux-pro-max` with `--design-system`, then `emil-design-eng`) and record the chosen direction (palette, type pairing, layout principles) in `docs/design-direction.md`. Direction brief: calm reading-first writing tool, strong typography, not a generic AI look.
- [ ] **Step 2: Implement** the tokens, shell and nav (responsive: bottom or collapsible nav on phone width, sidebar or top bar on desktop), light and dark themes.
- [ ] **Step 3: Verify** by running `npm run dev`, opening the dashboard at 375px and 1280px widths in the browser pane and checking: no horizontal scroll, nav reachable, text legible, focus rings visible.
- [ ] **Step 4: Show the user** a screenshot of the shell and ask for a reaction before the style spreads; adjust once if asked.
- [ ] **Step 5: Commit** `feat: design system and app shell`.

### Task 3: Database layer and migrations

**Files:**
- Create: `src/lib/db/index.ts`, `src/lib/db/migrate.ts`, `src/lib/db/migrations/001_content.sql`, `src/lib/db/migrations/002_settings_ai.sql`
- Test: `tests/db/migrate.test.ts`

**Interfaces:**
- Produces:
  - `type Db = { all<T>(sql: string, params?: unknown[]): T[]; get<T>(sql: string, params?: unknown[]): T | undefined; run(sql: string, params?: unknown[]): { changes: number }; exec(sql: string): void; transaction<T>(fn: () => T): T }`
  - `openDb(path: string): Db` (`':memory:'` allowed; app uses `data/wordcraft.sqlite`, creating `data/` if missing; enables foreign keys and WAL).
  - `getDb(): Db` (singleton for the app, runs `migrate`).
  - `migrate(db: Db): void` applies numbered `.sql` files in order, records them in `schema_migrations(version)`, and is idempotent.
- Schema (names fixed here, columns per spec section 6): `categories`, `expressions`, `expression_categories`, `examples`, `relations`, `contrast_groups`, `contrast_group_members`, `mistakes`, `tags`, `expression_tags`, `search_phrases`, `expressions_fts` (FTS5), plus `settings(key PRIMARY KEY, value)` and `ai_usage(id, feature, model, input_tokens, output_tokens, est_cost_usd, created_at)`. All content tables use `slug` UNIQUE where applicable; child rows cascade on expression delete.

- [ ] **Step 1: Write failing tests** in `tests/db/migrate.test.ts`: `migrate creates all content tables`, `migrate is idempotent (run twice, schema_migrations has one row per file)`, `deleting an expression cascades to examples, relations, mistakes and tags`, `expressions_fts matches on text and on a search phrase`.
- [ ] **Step 2: Run** `npx vitest run tests/db`. Expected: FAIL.
- [ ] **Step 3: Implement** `Db`, `openDb`, `migrate`, `getDb`, and the two SQL migration files. FTS rows are populated by the seeder (Task 5), not by triggers.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: sqlite layer and content schema`.

### Task 4: Content schemas, loader and validator

**Files:**
- Create: `src/lib/content/schemas.ts`, `src/lib/content/load.ts`, `scripts/content-validate.ts`, `tests/content/fixtures/` (small valid and invalid YAML)
- Test: `tests/content/load.test.ts`

**Interfaces:**
- Produces (in `schemas.ts`, Zod, with inferred types):
  - `ExpressionFile = { slug, text, kind, pos?, simpleMeaning, contextualMeaning, usageNotes, intensity?: 1..5, register, level, status, categories: string[] (min 1, first is primary), tags: string[] ("kind:slug", kind in emotion|situation|technique), searchPhrases: string[], examples: { text, setting: 'dialogue'|'narration'|'everyday'|'professional'|'academic', contextNote? }[] (min 3 when status is published), relations: { to, type: 'synonym'|'antonym'|'related'|'stronger'|'weaker', note? }[], mistakes: { wrong, right, explanation }[] }`
  - `ContrastFile = { slug, title, explanation, members: { expression, note, example }[] (min 2) }`
  - `CategoryNode = { slug, name, description, children?: CategoryNode[] }` and `CategoriesFile = { categories: CategoryNode[] }`
  - `ContentBundle = { categories: CategoryNode[]; expressions: ExpressionFile[]; contrasts: ContrastFile[] }`
- Produces (in `load.ts`): `loadContent(dir: string): { bundle: ContentBundle; errors: ContentError[] }` where `ContentError = { file: string; message: string }`. It reads `categories.yaml`, `expressions/**/*.yaml`, `contrasts/*.yaml`, and cross-checks: duplicate slugs, unknown category slugs, unknown relation targets, unknown contrast members.
- Script `npm run content:validate` prints each error as `file: message` and exits 1 on any error.

- [ ] **Step 1: Write failing tests** in `tests/content/load.test.ts`: `valid fixture loads with no errors`, `malformed YAML reports the file path`, `published entry with 2 examples is an error`, `duplicate slug is an error naming both files`, `unknown category slug is an error`, `relation to a missing expression is an error`, `curly quotes and em dashes survive loading unchanged`.
- [ ] **Step 2: Run** `npx vitest run tests/content`. Expected: FAIL.
- [ ] **Step 3: Implement** schemas, loader and the validate script (use `yaml` to parse; collect all errors rather than stopping at the first).
- [ ] **Step 4: Run** tests. Expected: PASS. Then `npm run content:validate` against the fixtures dir exits as expected.
- [ ] **Step 5: Commit** `feat: content schemas and validator`.

### Task 5: Idempotent seeder

**Files:**
- Create: `src/lib/content/seed.ts`, `scripts/content-seed.ts`
- Test: `tests/content/seed.test.ts`

**Interfaces:**
- Consumes: `Db`, `migrate` (Task 3); `ContentBundle` (Task 4).
- Produces: `seedContent(db: Db, bundle: ContentBundle): { added: number; updated: number; removed: number }`. Upserts by slug inside one transaction, rebuilds child rows and FTS rows for each expression, removes content rows no longer in the bundle, ignores expressions with `status: 'draft'` for the UI by storing the status (UI filters). Never writes to or deletes from any table outside the content set. `npm run content:seed` validates first (aborts on errors), opens the app DB and seeds from `content/`.

- [ ] **Step 1: Write failing tests**: `seeding twice yields the same row counts`, `editing an expression updates in place with no duplicate`, `removing an expression from the bundle deletes it and its children`, `seeding does not touch a sentinel user table` (create `user_sentinel(id, note)` with one row in the test, assert it is unchanged), `fts finds a seeded expression by a search phrase`.
- [ ] **Step 2: Run** `npx vitest run tests/content/seed.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `seedContent` and the script.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: idempotent content seeder`.

### Task 6: Category tree, content README and exemplar entries

**Files:**
- Create: `content/categories.yaml`, `content/README.md`, `content/contrasts/said-whisper-family.yaml`, and 4 exemplar expression files in `content/expressions/speaking-styles-and-dialogue-tags/` (`whispered`, `murmured`, `muttered`, `mumbled`)

**Interfaces:**
- Produces: the 26 top-level category slugs, fixed here, each with 2 to 5 subcategories: `emotions-and-feelings`, `anger-and-frustration`, `happiness-and-joy`, `sadness-and-disappointment`, `fear-and-anxiety`, `love-and-admiration`, `facial-expressions`, `body-language-and-gestures`, `speaking-styles-and-dialogue-tags`, `thinking-and-decision-making`, `movement-and-actions`, `physical-sensations`, `weather-and-environment`, `nature-and-landscapes`, `personality-and-character`, `relationships-and-social`, `conflict-and-arguments`, `agreement-disagreement-persuasion`, `confidence-and-hesitation`, `intelligence-and-understanding`, `literary-devices-imagery`, `transitions-and-connectors`, `descriptive-adjectives-adverbs`, `professional-and-academic`, `everyday-conversation`, `narrative-and-storytelling`. `content/README.md` is the authoring guide: file layout, field meanings, quality bar (specific situations, real differences between near-synonyms, mistakes that learners actually make, original examples), how to run validate and seed.

- [ ] **Step 1: Write** `categories.yaml` and the README.
- [ ] **Step 2: Write the 4 exemplar entries and the contrast group** so that whispered, murmured, muttered and mumbled each explain a different thing (volume and secrecy; soft and continuous; resentful, under the breath; unclear articulation), with at least 3 original examples each and one realistic mistake each.
- [ ] **Step 3: Run** `npm run content:validate`. Expected: no errors.
- [ ] **Step 4: Run** `npm run content:seed`, then check with a one-off SQL query that 4 expressions and 1 contrast group exist.
- [ ] **Step 5: Commit** `feat: category tree and exemplar content`.

### Task 7: Starter content batch A (categories 1 to 9)

**Files:**
- Create: `content/expressions/<category>/*.yaml` for the first nine categories (`emotions-and-feelings` through `speaking-styles-and-dialogue-tags`), and `content/contrasts/*.yaml`

**Interfaces:**
- Consumes: schemas (Task 4), authoring guide (Task 6).

- [ ] **Step 1: Write at least 4 published expressions per category** (the speaking-styles category already has 4 from Task 6; add at least 6 more there, covering snapped, protested, remarked, exclaimed, drawled, stammered), spanning at least 3 levels overall. Cross-link with relations and tags (`emotion:`, `situation:`).
- [ ] **Step 2: Write at least 5 contrast groups** for this batch (for example irritated / annoyed / exasperated / furious; sad / sorrowful / heartbroken / despondent; grin / smirk / beam / smile).
- [ ] **Step 3: Run** `npm run content:validate`. Expected: no errors.
- [ ] **Step 4: Run** `npm run content:seed`. Expected: counts reported with no errors.
- [ ] **Step 5: Commit** `content: starter batch A`.

### Task 8: Starter content batch B (categories 10 to 18) and C (categories 19 to 26)

**Files:**
- Create: expression files for `thinking-and-decision-making` through `agreement-disagreement-persuasion` (batch B), then `confidence-and-hesitation` through `narrative-and-storytelling` (batch C), plus further contrast groups.

- [ ] **Step 1: Batch B:** at least 4 published expressions per category and at least 4 more contrast groups (for example stroll / stride / trudge / saunter; argue / quarrel / bicker / squabble). Run `npm run content:validate`; fix errors.
- [ ] **Step 2: Commit** `content: starter batch B`.
- [ ] **Step 3: Batch C:** at least 4 published expressions per category and at least 3 more contrast groups. Include real transitions (however / nevertheless / even so), literary devices with original similes and metaphors, and professional email phrases. Run `npm run content:validate`; fix errors.
- [ ] **Step 4: Commit** `content: starter batch C`.

### Task 9: Content coverage gate

**Files:**
- Test: `tests/content/coverage.test.ts`

**Interfaces:**
- Consumes: `loadContent('content')` (Task 4).

- [ ] **Step 1: Write the test**: `all 26 top-level categories exist`, `each top-level category has at least 4 published expressions (counting its subcategories)`, `at least 12 contrast groups`, `no content validation errors`, `every published expression has at least 3 examples and non-empty simpleMeaning, contextualMeaning and usageNotes`.
- [ ] **Step 2: Run** `npx vitest run tests/content/coverage.test.ts`. Expected: PASS (if it fails, add the missing content rather than loosening the test).
- [ ] **Step 3: Seed** the real database with `npm run content:seed`.
- [ ] **Step 4: Commit** `test: content coverage gate`.

### Task 10: Content queries

**Files:**
- Create: `src/lib/content/queries.ts`
- Test: `tests/content/queries.test.ts`

**Interfaces:**
- Consumes: `Db`; seeded content.
- Produces:
  - `getCategoryTree(db: Db): CategoryWithCount[]` where `CategoryWithCount = { slug, name, description, expressionCount: number, children: CategoryWithCount[] }` (counts published expressions, including descendants).
  - `listExpressions(db: Db, opts: { categorySlug?: string; level?: Level; register?: Register; limit?: number; offset?: number }): ExpressionSummary[]` with `ExpressionSummary = { slug, text, simpleMeaning, level, register, intensity: number | null, kind }`.
  - `getExpression(db: Db, slug: string): ExpressionDetail | undefined` with `ExpressionDetail = ExpressionSummary & { pos, contextualMeaning, usageNotes, categories: {slug,name}[], tags: {kind,slug}[], examples: {text,setting,contextNote}[], relations: {slug,text,type,note}[], contrastGroups: {slug,title,explanation,members:{slug,text,note,example}[]}[], mistakes: {wrong,right,explanation}[] }`.
  - `getContrastGroup(db: Db, slug: string)` returning the same group shape.

- [ ] **Step 1: Write failing tests** against a small in-memory seeded bundle: `getCategoryTree counts descendants`, `listExpressions filters by level and register`, `draft expressions are never returned`, `getExpression returns examples, relations and contrast groups`, `getExpression returns undefined for an unknown slug`, `an expression with no intensity and no mistakes returns null and []`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the query functions with plain SQL.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: content queries`.

### Task 11: Search

**Files:**
- Create: `src/lib/search/parse.ts`, `src/lib/search/search.ts`
- Test: `tests/search/parse.test.ts`, `tests/search/search.test.ts`

**Interfaces:**
- Consumes: `Db`; seeded content with tags, search phrases and relations.
- Produces:
  - `parseQuery(raw: string): ParsedQuery` with `ParsedQuery = { raw: string; terms: string[]; exclude: string[]; relation?: { type: 'antonym' | 'stronger' | 'weaker' | 'synonym'; target: string }; empty: boolean }`. Handles "without saying X", "instead of X", "other than X" (exclude); "opposite of X", "stronger than X", "weaker than X", "another word for X" (relation); lowercases, strips FTS special characters, drops stopwords, caps at 500 characters. `empty` is true when no terms and no relation remain.
  - `searchExpressions(db: Db, q: ParsedQuery, opts?: { limit?: number }): SearchResult[]` with `SearchResult = { slug, text, simpleMeaning, level, register, intensity: number | null, matchedVia: 'text' | 'phrase' | 'tag' | 'relation', contrastGroupSlug?: string }`. Ranking: BM25 on `expressions_fts`, boosted by tag and search-phrase matches, widened by one hop through `relations` (synonym/related) from matched expressions; exclusion removes any expression whose text, an inflection-stripped stem of it (shared stem of at least 5 letters, such as "disappoint"), or whose search phrases match an excluded term; never returns drafts.
- The "without saying disappointed" example must return results such as crestfallen, deflated or let down, and none of disappointed, disappointing, disappointment.

- [ ] **Step 1: Write failing tests** in `tests/search/parse.test.ts`: `"ways to express disappointment without saying disappointed" parses terms ["disappointment"] and exclude ["disappointed"]`, `"opposite of furious" sets relation antonym furious`, `"stronger than annoyed" sets relation stronger`, `empty and whitespace queries are empty`, `special characters " * - : ( are stripped`, `a 2000 character query is truncated to 500`.
- [ ] **Step 2: Write failing tests** in `tests/search/search.test.ts` (seeded with fixture content): `finds crestfallen for the disappointment query and excludes disappointed forms`, `matches via a search phrase ("let down")`, `matches via a tag (emotion:disappointment)`, `antonym relation returns the antonym entries`, `unbalanced quote input does not throw`, `no matches returns an empty array`, `drafts are never returned`, `results from one contrast group carry the same contrastGroupSlug`.
- [ ] **Step 3: Run** `npx vitest run tests/search`. Expected: FAIL.
- [ ] **Step 4: Implement** `parseQuery` and `searchExpressions`. Build the FTS MATCH expression from sanitised terms only (never interpolate raw input; bind parameters).
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: intent-aware search`.

### Task 12: Claude client, usage log and settings page

**Files:**
- Create: `src/lib/ai/client.ts`, `src/lib/ai/budget.ts`, `src/lib/ai/smartSearch.ts`, `src/app/settings/page.tsx`, `src/app/api/settings/route.ts`
- Test: `tests/ai/client.test.ts`, `tests/ai/smartSearch.test.ts`

**Interfaces:**
- Consumes: `Db`, `settings` and `ai_usage` tables (Task 3), `ParsedQuery` (Task 11).
- Produces:
  - `class AiUnavailableError extends Error` (no key, over budget, or call failure).
  - `askClaude<T>(opts: { db: Db; feature: string; system: string; user: string; schema: z.ZodType<T>; model?: string; maxTokens?: number }): Promise<T>`: server-only; reads `ANTHROPIC_API_KEY`; asks for JSON and validates it with `schema` (invalid output throws `AiUnavailableError`); logs tokens and estimated cost to `ai_usage`; checks `isOverBudget` first. When `WORDCRAFT_AI_MOCK=1` it returns the value from `setMockResponder(fn)` instead of calling the network (test only).
  - `getMonthlySpendUsd(db: Db, now?: Date): number`, `isOverBudget(db: Db, now?: Date): boolean` (cap from `settings.monthly_cap_usd`, default 5).
  - `translateQuery(db: Db, raw: string): Promise<ParsedQuery>`: asks the cheaper model to turn a natural-language request into `ParsedQuery` fields; caches by lowercase query in `settings`-style cache table or `ai_usage`-adjacent table of your choice; on any error returns `parseQuery(raw)`.
- Settings page shows: key present or missing (never the key itself), model names with override fields, monthly cap, this month's spend. A "Test connection" button makes a tiny live call and reports success or the error message.

- [ ] **Step 1: Write failing tests**: `askClaude throws AiUnavailableError when no key is set`, `askClaude returns parsed output from the mock responder and logs usage`, `invalid model output throws AiUnavailableError`, `isOverBudget is true once spend reaches the cap and false the next calendar month`, `translateQuery falls back to parseQuery when the key is missing`, `translateQuery falls back when the responder throws`, `translateQuery returns the second call from cache`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the modules and the settings page and route (the route only reads and writes non-secret settings; the key is edited in `.env.local`, and the page says so).
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Live smoke test** (only if the user has set a key): click "Test connection" on the settings page and confirm success. If no key is set, confirm the page shows "no key" and the rest of the app still works.
- [ ] **Step 6: Commit** `feat: claude client, budget and settings`.

### Task 13: Explore, category and expression pages

**Files:**
- Create: `src/app/explore/page.tsx`, `src/app/explore/[category]/page.tsx`, `src/app/e/[slug]/page.tsx`, `src/components/ExpressionCard.tsx`, `src/components/ContrastGroup.tsx`, `src/components/LevelBadge.tsx`, `src/components/IntensityMeter.tsx`

**Interfaces:**
- Consumes: `getCategoryTree`, `listExpressions`, `getExpression`, `getContrastGroup` (Task 10).

- [ ] **Step 1: Explore page:** the 26 categories as an overview with subcategories and counts, linking to category pages.
- [ ] **Step 2: Category page** (`/explore/[category]`): subcategory chips, level and register filters via query params, expression cards (text, simple meaning, level, register, intensity); unknown slug calls `notFound()`.
- [ ] **Step 3: Expression page** (`/e/[slug]`): sections for meaning, in context, when and why to use it, intensity and register, examples grouped by setting, related and opposite expressions as links, contrast groups ("how it differs from …") with each member's note and example, and common mistakes shown as wrong then right with the reason. Optional fields absent means the section is simply omitted. Unknown slug calls `notFound()`. Leave a clearly placed (disabled for now) "Save to notebook" button; it is wired in Plan Phase 5.
- [ ] **Step 4: Verify** in the browser pane at 375px and 1280px: open Explore, a category, and the `whispered` page; check the contrast group, the mistakes block, no layout overflow, and a 404 for `/e/does-not-exist`.
- [ ] **Step 5: Commit** `feat: explorer and expression pages`.

### Task 14: Search page

**Files:**
- Create: `src/app/search/page.tsx`, `src/components/SearchBox.tsx`, `src/app/api/search/route.ts`

**Interfaces:**
- Consumes: `parseQuery`, `searchExpressions` (Task 11), `translateQuery`, `AiUnavailableError` (Task 12).

- [ ] **Step 1: Implement** the search page: input with example prompts ("ways to express disappointment without saying disappointed", "words for walking slowly", "opposite of furious"); results grouped by `contrastGroupSlug` so near-synonyms appear together with a link to the group comparison; each card shows level, register, intensity and the simple meaning; a "Smart search" toggle shown only when a key is configured, calling `translateQuery` and falling back silently on failure; empty or unmatched queries show a friendly state with suggestions (no error).
- [ ] **Step 2: Verify** in the browser pane: run the disappointment query, confirm results appear and none is a form of "disappointed"; try `"unbalanced`, `a*b`, `---`, an empty submit and a 600-character string; none may error.
- [ ] **Step 3: Commit** `feat: search page`.

### Task 15: End-to-end tests and wrap-up

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/library.spec.ts`
- Modify: `package.json` (`test:e2e`), `README.md` (run instructions), the Obsidian vault (see Step 4)

**Interfaces:**
- Consumes: everything above; the app is started by Playwright's `webServer` against a seeded database.

- [ ] **Step 1: Write the e2e spec**: `dashboard loads and nav reaches Explore`, `category page lists expressions and filters by level`, `expression page shows contrast group and mistakes for whispered`, `search for the disappointment query shows results and none contain "disappointed"`, `search with special characters renders without an error`, `unknown expression slug shows a 404 page`, `settings page shows key status and never the key`.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: PASS (fix real defects, not the tests).
- [ ] **Step 3: Run the whole suite** `npm test` and `npm run test:e2e`; run `npm run build`. Expected: all green, build succeeds.
- [ ] **Step 4: Vault update** (the user's standing rule): create the hub note `Wordcraft.md` in `C:\Users\yaxye\Desktop\obsidian\Claud A.I`, link it from `Index.md`, add decision notes to `Decisions Log.md` (Next.js plus SQLite, content-as-files, tutor never rewrites by default) and append what was done and what is left to `Session Log.md`, using `[[double brackets]]` links.
- [ ] **Step 5: Commit** `test: e2e coverage for library and search`, then report to the user what works, what is untested (live AI features without a key), and propose the Phase 3 plan (Dialogue and Narration lab).
