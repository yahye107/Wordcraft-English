# Wordcraft Content Expansion and Review Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the library with a large batch of new entries that land as **drafts**, and give the learner a fast, safe way to read each draft exactly as a learner would see it, approve and publish it, or mark it "needs work" with a note. Nothing the learner has not approved becomes visible.

**Architecture:** The YAML files stay the source of truth. A small content-tooling layer adds a quality linter, a coverage report and a file index (slug, status, fingerprint per file). The learner's review decisions live in one new learner table keyed by (kind, slug) with a fingerprint, so editing a file brings it back to the queue. Approving a draft edits one line (`status:`) in its file, validates the whole library, reseeds, and reverts the file if anything fails. Review pages are server components over the existing expression, contrast, lesson and prompt data, with the expression page body shared between the learner view and the review preview. No AI is used (there is no API key): the new entries are written in this build, as before.

**Tech Stack:** Same as before (Next.js 16 App Router, node:sqlite, yaml, zod, Vitest, Playwright). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-19-wordcraft-design.md` (section 8 volume target and "nothing becomes published without the user reviewing it"; section 10 phase 9; section 7 content tooling). Builds on the Phase 1 to 8 plans and `content/README.md`.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before page and route code (AGENTS.md). DB pages use `export const dynamic = 'force-dynamic'`; `params` and `searchParams` are Promises; run `npx next typegen` after adding routes.
- Before the UI task invoke `frontend-design`, `ui-ux-pro-max` and `emil-design-eng`; keep to `docs/design-direction.md`. The review pages are a working tool: quiet, fast, keyboard friendly.
- **Drafts are invisible to learners.** Every learner-facing query already filters `status = 'published'`; Task 3 proves it with a test that exercises every path, and fixes any leak.
- **Content is files.** The only place the app writes to `content/` is the single `status:` line of an expression file, from the review page. Everything else about content stays an edit to a file. The content directory comes from `WORDCRAFT_CONTENT_DIR` (default `content`) so the end-to-end tests change a copy, never the real files.
- **Safe writes:** a slug is accepted only if it is in the file index (never build a path from request text); write to a temporary file then rename; keep the file's line endings; validate the whole library after the change and restore the original bytes if there is any error; one change at a time (a lock); same-origin check on every write route (a cross-site `Origin` or `Sec-Fetch-Site` gets 403); bodies over 20,000 bytes get 413; unknown ids 404; bad shapes 400.
- **Review state is learner data:** it lives in `content_reviews`, is never touched by seeding, and survives reseeds. A verdict stores a fingerprint (SHA-1 of the file with line endings normalised); a file whose fingerprint changed shows "Changed since you reviewed it" and returns to the queue.
- **Content quality bar** (from `content/README.md`): specific situations; a real difference between near-synonyms; original examples (nothing copied from books, articles or sites); mistakes learners really make; simple English; honest levels. New entries: 3 to 5 examples in at least 2 settings, at least 3 search phrases, at least one mistake, at least one relation, at least one tag. Level mix of the new batch: at least 25 percent beginner, at least 40 percent intermediate, no more than 25 percent advanced, no more than 5 percent literary (the starter set leans advanced, and this learner writes basic English).
- Responsive from 375px, visible focus, reduced motion respected, targets at least 44px. All earlier unit and end-to-end tests keep passing.
- Project root: `C:\Users\yaxye\Desktop\english\wordcraft`. Commit after each task (content tasks: after each batch of about 25 entries that passes the linter).

## Review Focus

1. A draft never reaches a learner: explore counts, category pages, search (including a draft that matches only through the full-text index), the expression URL (404), contrast groups and relations on other pages, lesson "related", prompt "try these words", notebook save by slug, the vocabulary finder, the importer's link matching, and the novel lab and studio word matching.
2. Approving writes exactly one line: the bytes of every other line and the line endings are unchanged; a draft with fewer than 3 examples is refused with a plain message and the file is untouched; if validation or the reseed fails after the write, the original file is restored and the page says what failed.
3. Path and cross-site safety: a slug such as `../x`, an uppercase slug, an unknown slug, or a slug that exists only as a contrast group name used as an expression never touches the disk; a cross-site POST gets 403; two quick approvals do not interleave.
4. Review state follows the file: editing a reviewed file marks it "changed"; deleting a file drops it from the queue; the same slug used by an expression and a contrast group does not collide; a malformed YAML file is reported as a problem and does not break the queue.
5. Contrast groups with fewer than 2 published members are hidden from learners (a group of one is not a contrast), and appear again as members are approved.
6. Moving a published entry back to draft keeps notebook entries that saved it (the notebook row stays, its library link goes quiet as it already does for removed content) and keeps the learner's review verdict.
7. Lint warnings never block an approval; only structural errors do. The new batch has zero lint errors and zero lint warnings, and the existing content's warning count may only go down.
8. "Needs work" notes survive reseeds and can be printed with file paths (`npm run content:notes`) so they can be acted on in a later session.

---

### Task 1: Content directory setting, review table, file index

**Files:**
- Create: `src/lib/content/dir.ts`, `src/lib/content/files.ts`
- Modify: `src/lib/db/migrations.ts` (migration 10), `src/lib/db/index.ts`, `scripts/content-seed.ts`, `scripts/content-validate.ts`, `scripts/reset-e2e-db.mjs`, `playwright.config.ts`
- Test: `tests/content/dir.test.ts`, `tests/content/files.test.ts`

**Interfaces:**
- `dir.ts`: `contentDir(): string`: `WORDCRAFT_CONTENT_DIR` resolved against the working directory when set and non-empty, else `<cwd>/content`.
- Migration 10 `content_reviews`: `id INTEGER PRIMARY KEY, kind TEXT NOT NULL, slug TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('approved','needs-work')), note TEXT NOT NULL DEFAULT '', fingerprint TEXT NOT NULL, reviewed_at TEXT NOT NULL DEFAULT (now), UNIQUE (kind, slug)`. Learner data; no foreign keys.
- `files.ts`: `type ContentKind = 'expression' | 'contrast' | 'lesson' | 'prompt'`; `type ContentFile = { kind: ContentKind; slug: string; file: string /* path relative to the content dir, forward slashes */; status: 'draft' | 'published' | null /* null for kinds without a status */; fingerprint: string }`; `indexContentFiles(dir: string): { items: ContentFile[]; problems: { file: string; message: string }[] }`. It reads `expressions/`, `contrasts/`, `lessons/` and `prompts/` recursively, takes `slug:` and `status:` from their top-level lines with a line regex (no full YAML parse, so it is fast), and fingerprints the text with CRLF normalised to LF. A file with no `slug:` line, or a duplicate (kind, slug), is a problem, not an item. Order is deterministic (by kind, then slug).
- `reset-e2e-db.mjs` also copies `content/` to `data/e2e-content`; `playwright.config.ts` sets `WORDCRAFT_CONTENT_DIR: 'data/e2e-content'` for the server and its seed step.

- [ ] **Step 1: Write failing tests**: `contentDir` uses the variable, falls back to `<cwd>/content`, ignores an empty variable; `indexContentFiles` on a temp directory finds one item per file with kind, slug, status and a 40-character fingerprint; draft and published statuses are read; a file with no `status:` line on an expression reports `'published'` (the schema default); kinds without a status give `null`; a CRLF copy of a file has the same fingerprint as the LF copy and a one-word change does not; a missing slug and a duplicate slug are problems; a missing directory gives empty results; real `content/` indexes to the same counts as `loadContent` (expressions, contrasts, lessons, prompts) and takes under 500 ms; migration 10 creates the table and rejects a verdict of `'maybe'`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement; point the scripts and `getDb` at `contentDir()`. **Step 4:** run the whole suite, PASS.
- [ ] **Step 5: Commit** `feat: content dir setting, review table and file index`.

### Task 2: Quality linter, coverage report, baseline

**Files:**
- Create: `src/lib/content/lint.ts`, `src/lib/content/report.ts`, `scripts/content-lint.ts`, `scripts/content-report.ts`
- Modify: `package.json` (scripts `content:lint`, `content:report`)
- Test: `tests/content/lint.test.ts`, `tests/content/report.test.ts`, `tests/content/quality.test.ts`

**Interfaces:**
- `lint.ts`: `type LintIssue = { kind: ContentKind; slug: string; severity: 'error' | 'warn'; rule: string; message: string }`; `lintBundle(bundle: ContentBundle): LintIssue[]` (pure). Rules, each with its rule id:
  - errors: `self-relation` (an expression relates to itself); `mistake-same` (a mistake whose `wrong` equals its `right`); `duplicate-example` (the same example text in two entries); `duplicate-text` (two expressions with the same text ignoring case); `group-member-example` (a contrast member's example does not contain the member's text or an inflected form, using the matcher in `src/lib/text/match.ts`).
  - warnings: `example-missing-text` (an example without the expression or an inflected form; patterns and collocations are exempt); `few-settings` (examples in fewer than 2 settings); `few-search-phrases` (under 3); `no-mistakes`; `no-relations`; `no-tags`; `long-meaning` (`simpleMeaning` over 160 characters or more than one sentence); `short-notes` (`usageNotes` under 40 characters); `hard-words` (`simpleMeaning` with more than 2 words of 12 or more letters); `long-sentences` (any explanation field averaging over 25 words a sentence); `one-way-synonym` (a synonym or antonym link not repeated in the other direction); `small-group` (a contrast group with fewer than 3 members).
- `report.ts`: `coverageReport(bundle: ContentBundle): CoverageReport` with `{ total; byStatus; byLevel; byArea: { slug; name; published; draft; total }[]; relationCoverage: number /* share of expressions with at least one antonym, stronger or weaker link, 0 to 1 */; noGroup: string[] /* slugs in no contrast group */; mistakesPer: number }`. The scripts print readable text; `content:lint` exits 1 only when there are errors.
- `quality.test.ts` runs the linter on the real `content/`: zero errors, and the warning count must not exceed `BASELINE_WARNINGS`, a constant set from the first run of Step 5 and lowered whenever warnings are fixed.

- [ ] **Step 1: Write failing tests**: one pass and one fail case per rule using tiny hand-built bundles; clean content gives no issues; `coverageReport` counts by area, status and level, finds `noGroup`, and `relationCoverage` is 0 for an empty bundle (no NaN).
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement. **Step 4:** run, PASS (apart from `quality.test.ts` until Step 5).
- [ ] **Step 5: Run `content:lint` and `content:report` on the real library.** Fix every **error** in existing files (the files are the learner's but these are factual or structural slips); record the warning count as `BASELINE_WARNINGS`; commit the report numbers in the commit message (area counts, relation coverage, entries with no group).
- [ ] **Step 6: Commit** `feat: content linter and coverage report`.

### Task 3: Draft safety audit

**Files:**
- Test: `tests/content/draft-safety.test.ts`
- Modify (only if the audit finds a leak): the leaking query; `src/lib/content/queries.ts` (contrast group rule)

**Interfaces:**
- Contrast groups are shown to learners only when they have at least 2 published members (`getContrastGroup` and the groups listed on an expression page).

- [ ] **Step 1: Write the audit as one failing-first test file.** Seed a small library where one expression `ghost-draft` (text "ghostly murmuring", searchable words nothing else shares) has `status: draft`, is in a category, a tag, a contrast group of three (two published, one draft) and a second group where it is one of two members, is the target of relations from a published entry, is listed in a published lesson's `related` and in a prompt's `try`, and is saved by slug. Assert that learners get nothing for it: `getCategoryTree` counts and `getCategory` lists exclude it; `listExpressions` excludes it; `searchExpressions` by its text, by a search phrase and by a word found only in its full-text row returns nothing; `getExpression('ghost-draft')` is undefined; the published entry's relations and the two groups exclude it; a group left with one published member is hidden; lesson `related` and prompt `try` exclude it; `saveFromLibrary` returns undefined; `findAlternatives` does not offer it; the importer does not link a note to it; `findExpressionsIn` does not find its text in a passage or a piece of writing; the notebook review card for a notebook entry that was saved before it became a draft shows no library data.
- [ ] **Step 2: Run.** Expected: FAIL only where a leak or the missing group rule exists (note which). **Step 3:** fix each leak. **Step 4:** run, PASS.
- [ ] **Step 5: Commit** `test: drafts never reach learners`.

### Task 4: Review store, status editing, routes and notes script

**Files:**
- Create: `src/lib/content/review.ts`, `src/lib/content/status.ts`, `src/lib/content/handlers.ts`, `src/lib/content/origin.ts`, `scripts/content-notes.ts`; routes `src/app/api/content/verdict/route.ts`, `src/app/api/content/status/route.ts`
- Modify: `package.json` (script `content:notes`)
- Test: `tests/content/review.test.ts`, `tests/content/status.test.ts`, `tests/content/handlers.test.ts`

**Interfaces:**
- `review.ts`: `type ReviewState = 'draft' | 'unreviewed' | 'needs-work' | 'changed' | 'approved'`; `type ReviewItem = { kind: ContentKind; slug: string; title: string; area: string | null; status: 'draft' | 'published' | null; state: ReviewState; note: string; level: string | null }`; `getReviewQueue(db: Db, dir: string): { items: ReviewItem[]; counts: { draft: number; unreviewed: number; needsWork: number; changed: number; approved: number }; problems: { file: string; message: string }[] }`. State rules: a draft expression is `draft` (even when it has a verdict, until its fingerprint matches an approved verdict, in which case it is `approved`); otherwise a verdict with the same fingerprint gives `approved` or `needs-work`; a verdict with a different fingerprint gives `changed`; no verdict gives `unreviewed`. Titles and areas come from the database; an item whose file has not been seeded yet has the slug as its title. Order: drafts, then changed, then needs-work, then unreviewed, then approved; within each, by area then title.
  `recordVerdict(db: Db, dir: string, input: { kind: unknown; slug: unknown; verdict: unknown; note?: unknown }): { ok: true } | { ok: false; status: 400 | 404; error: string }` (the item must be in the file index; a note is required for needs-work and at most 1,000 characters; the stored fingerprint is the file's current one). `nextItem(items: ReviewItem[], after: { kind: ContentKind; slug: string }, skipDone: boolean): ReviewItem | undefined`.
- `status.ts`: `setExpressionStatus(db: Db, dir: string, slug: unknown, status: unknown): Promise<{ ok: true; status: 'draft' | 'published' } | { ok: false; status: 400 | 404 | 409 | 500; error: string }>`. Steps: validate the slug against `/^[a-z0-9][a-z0-9-]*$/` and the index; refuse with 409 if the library already has content errors ("Fix these content errors first: ..."); replace the single top-level `status:` line, or insert `status: draft` after the `level:` line when moving a status-less file to draft (keep the file's line endings); write to a temporary file and rename; run `loadContent`; on any error restore the original bytes and return 409 with the first error in plain words ("This entry needs at least 3 examples before it can be published."); reseed with `seedContent`; if the reseed throws restore the file, try the reseed again, and return 500. A module-level lock makes calls run one at a time. Approving a draft also records an `approved` verdict (note kept if there was one); moving to draft leaves the verdict alone.
- `origin.ts`: `sameOrigin(request: Request): boolean`: false when `Origin` is present and its host differs from the request host, or when `Sec-Fetch-Site` is `cross-site`; true otherwise (so tools and the tests that send neither header still work).
- `handlers.ts`: `handleVerdict(db, dir, request)` and `handleStatus(db, dir, request)` read JSON (413 over 20,000 bytes, 400 bad JSON or shape), check `sameOrigin` first (403), and map results to responses. The routes use `getDb()` and `contentDir()`.
- `scripts/content-notes.ts`: prints every `needs-work` and `changed` item as `kind slug (file): note`, newest first, for use in a later session.

- [ ] **Step 1: Write failing tests** (temporary content directories, in-memory databases): queue states for each rule, including `approved` for a draft whose approved fingerprint matches and `changed` after a one-word edit; counts; ordering; a malformed YAML file shows up in `problems` and the rest of the queue still loads; `recordVerdict` accepts valid input, rejects an unknown kind, an unknown slug, a missing note for needs-work and a 1,001-character note, and a second verdict replaces the first; `setExpressionStatus`: publishes a draft and changes only that line (compare the whole file text before and after, for LF and CRLF files), publishes into the database (the learner query now returns it), refuses a draft with 2 examples and leaves the bytes unchanged, moves back to draft (a file with no `status:` line gets one), reverts the file when the reseed is made to throw, refuses `../x`, `X`, an unknown slug and a contrast-group slug, refuses while the library has an error, and two concurrent calls end in a valid file; `sameOrigin` for no headers, the same host, another host, `Sec-Fetch-Site: cross-site`; handlers: 200, 400, 403, 404, 409, 413; `content-notes` output format.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement; `npx next typegen`, `npx tsc --noEmit`. **Step 4:** run the whole suite, PASS.
- [ ] **Step 5: Commit** `feat: content review store and safe status editing`.

### Task 5: Review pages

**Files:**
- Create: `src/app/content/page.tsx`, `src/app/content/[kind]/[slug]/page.tsx`, `src/components/content/ReviewList.tsx`, `src/components/content/ReviewForm.tsx`, `src/components/content/CoverageTable.tsx`, `src/components/ExpressionView.tsx`
- Modify: `src/app/e/[slug]/page.tsx` (use `ExpressionView`), `src/lib/content/queries.ts` (`getExpression(db, slug, opts?: { includeDraft?: boolean })`, with groups and relations also including drafts and marking them), `src/app/page.tsx` and `src/app/settings/page.tsx` (links), `src/app/globals.css`

**Behaviour:**
- **`/content` ("Library review"):** four count tiles (Drafts waiting, Not reviewed by you, Needs work, Changed since you reviewed) that are also the state filters (`?state=`); kind chips (`?kind=`; default Expressions); the queue as rows with title, area, level, a Draft or Published badge, the state, and the note when there is one; paging by `?limit=` (50, "Show more"); a coverage table by area (published, draft, total) with areas under 8 marked; the list of file problems when there are any; an empty state for each filter. Read-only except for links.
- **`/content/[kind]/[slug]`:** a draft banner ("Draft. Learners cannot see this yet."), then the entry exactly as learners see it (the shared `ExpressionView` for expressions; the group's members for contrast groups; the lesson or prompt summary with a link to its public page for those kinds), a lint panel for that item (from `lintBundle` over the loaded library; warnings listed with their rule), the earlier verdict and note, and the form: **Approve and publish** (drafts) or **Approve** (everything else), **Needs work** (opens a note field, note required), and, for a published expression, **Move back to draft**. After a verdict the page moves to the next item in the same queue filter (or back to the list with a message at the end). Keyboard: `A` approves and `N` focuses the note field, when focus is not in a field. Outcomes are announced in a live region; errors from the API (for example "needs at least 3 examples") appear beside the buttons. Unknown kind or slug returns 404.
- **Dashboard and Settings:** the dashboard shows a quiet line "N drafts are waiting for your review" linking to `/content` only when N is above 0; Settings gets a "Review library content" link.
- Invoke the three UI skills first.

- [ ] **Step 1: Write failing tests** for `getExpression` (default unchanged for a draft: undefined; with `includeDraft` it returns the draft, and its relations and groups include draft neighbours flagged `draft: true`).
- [ ] **Step 2: Implement** `queries.ts` change, then the pages and components (plain objects to client components; verdict form posts to the Task 4 routes; keep the learner expression page output identical, checked by the existing end-to-end tests).
- [ ] **Step 3: Verify in the browser** on a scratch copy of the content and database (`WORDCRAFT_CONTENT_DIR` and `WORDCRAFT_DB` pointing at scratch paths, a second dev server): the queue, filters, coverage table, a draft preview, approve and publish then reload `/e/<slug>`, needs work with a note, move back to draft; 375px and desktop, no console errors, no sideways scroll, targets at least 44px. Delete the scratch files.
- [ ] **Step 4: Commit** `feat: library review pages`.

### Task 6: Content batch A, six new areas

**Files:**
- Modify: `content/categories.yaml`
- Create: `content/expressions/<area>/*.yaml` (48 drafts), `content/contrasts/*.yaml` (6 groups)
- Test: `tests/content/expansion.test.ts`

**Content:** six new top-level areas, each with 2 or 3 subcategories and at least 8 draft entries (all `status: draft`): `sound-and-silence`, `light-colour-and-darkness`, `time-pace-and-waiting`, `humour-irony-and-sarcasm`, `honesty-lies-and-secrets`, `memory-and-nostalgia`; one contrast group per area (for example the sound of footsteps, kinds of light, ways to wait). Follow the quality bar and the level mix in Global Constraints. Write in batches of about 25 through a throwaway generator kept outside the repo; after each batch run `npm run content:validate` and `npm run content:lint` (zero errors, zero warnings for the new files) and commit.

- [ ] **Step 1: Write the failing expansion test** (`expansion.test.ts`): the six new area slugs exist; each has at least 8 expressions in total (draft plus published, so approving later never breaks it); the new drafts meet the batch rules (3 to 5 examples in at least 2 settings, at least 3 search phrases, a mistake, a relation, a tag); no new entry text or example duplicates an existing one; the level mix of expressions in the six new areas meets the Global Constraints shares.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** write the categories and the first batch; run validate, lint and the test; commit; repeat for each batch until green.
- [ ] **Step 4: Commit** (one commit per batch) `content: draft entries for <areas>`.

### Task 7: Content batch B, thin areas, bridging words, groups, links

**Files:**
- Create: `content/expressions/<area>/*.yaml` (at least 66 drafts), `content/contrasts/*.yaml` (9 groups)
- Modify: existing expression files only to add `relations` (and only that)
- Test: extend `tests/content/expansion.test.ts`

**Content:** top every one of the 26 existing areas up to at least 8 entries in total (about 66 drafts: 4 more in each area that has 4, 3 more where it has 5, 2 more where it has 6, 1 more where it has 7). Favour the plain words a basic writer overuses and the better words that replace them (said, walked, looked, laughed, cried, big, good, bad, nice, tired, happy, sad) as beginner and intermediate entries with strong contrast groups: 9 new groups. Add `antonym`, `stronger` and `weaker` links across all entries (new and existing, existing edited only in `relations`) until at least 60 percent of all expressions have at least one such link (measured with `coverageReport`). Same batching, linting and commits as Task 6; lower `BASELINE_WARNINGS` if the relation work removes warnings.

- [ ] **Step 1: Extend the expansion test**: every one of the 26 old areas and the 6 new ones has at least 8 expressions in total; the total is at least 254 (144 starter plus at least 110 new); at least 24 contrast groups exist; `relationCoverage` is at least 0.6; the new drafts meet the level mix; no published starter entry changed except `relations` (compare each starter file's fingerprint with its recorded value minus the relations block, recorded in the test as a table of slugs and hashes of every other field, written from the current files before editing).
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** write the batches, running validate, lint and the test after each. **Step 4:** run, PASS.
- [ ] **Step 5: Commit** per batch `content: draft entries for <areas>`, then `content: relation links across the library`.

### Task 8: End-to-end tests, checks, wrap-up

**Files:**
- Create: `tests/e2e/content-review.spec.ts`; modify `content/README.md` (the review workflow, `content:lint`, `content:report`, `content:notes`), the Obsidian vault

- [ ] **Step 1: Write the spec** (desktop and phone; the server uses the copied content directory; each project uses its own draft slug and restores it): `the review page counts the drafts and lists them first`, `a draft is not visible to learners (its page is 404, it is absent from Explore and search)`, `opening a draft shows the banner, the entry as learners see it and its lint panel`, `approve and publish makes the entry appear at its page, in its category count and in search`, `move back to draft hides it again and the notebook entry saved from it survives`, `needs work with a note moves it to the Needs work filter and requires the note`, `a draft with fewer than 3 examples cannot be published and the message says why`, `approve moves on to the next item in the queue`, `A and N keys work and are ignored inside the note field`, `a cross-site POST to the status route gets 403`, `the dashboard shows the drafts-waiting line only when there are drafts`, `no console errors and no sideways scroll at 375px on the review pages`. After the run `git status` shows no change under `content/`.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: all pass, including every earlier spec.
- [ ] **Step 3: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run content:validate`, `npm run content:lint`. Expected: green, zero lint errors, the new files with zero warnings.
- [ ] **Step 4: Self-review** against the Review Focus list; point each line at a test and add one where there is none.
- [ ] **Step 5: Vault:** create `Wordcraft - Content Review.md` (how to review, what the buttons do, what is safe), update `Wordcraft - Content Authoring.md`, link the new note from `Wordcraft.md` (Phase 9 built), add to `Decisions Log.md` and `Session Log.md`.
- [ ] **Step 6: Commit** `test: content review end-to-end`; report what works and what is unverified, how many drafts wait for review, and that the live Claude drafting script (`content:draft`) is not built because there is no API key.
