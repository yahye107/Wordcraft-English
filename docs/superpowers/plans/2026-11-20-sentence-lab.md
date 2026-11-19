# Wordcraft Sentence Construction Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Sentence Construction lab on top of the Phase 3 lesson engine: 12 pattern lessons with colour-coded sentence-structure examples, a new `reorder` exercise type, about 60 exercises, and shared lab pages for both labs.

**Architecture:** The lesson and exercise tables, seeding, checking, attempts and progress from Phase 3 are reused unchanged (`lab = 'sentence'` already exists in the schema). Three additions: annotation kinds for sentence structure, a `reorder` exercise type, and a shared lesson view so the Dialogue and Sentence labs use one set of pages and components.

**Tech Stack:** Same as before. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-19-wordcraft-design.md` (section 8 "Sentence lab", Phase 4 in section 10). Builds on `docs/superpowers/plans/2026-11-19-dialogue-lab.md`.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing page or route code (AGENTS.md). DB pages use `export const dynamic = 'force-dynamic'`. `params` is a Promise (`PageProps<'/route'>`); run `npx next typegen` after adding routes.
- Invoke `frontend-design`, `ui-ux-pro-max` and `emil-design-eng` before the page work and keep to `docs/design-direction.md`.
- All lesson and exercise text is original; nothing copied from books. Simple English in explanations.
- Content is data. No answer key reaches the browser. Attempts store the exercise slug with no foreign key and are never touched by seeding.
- Exercise slugs are numbered by authoring order, as in Phase 3 (`s2-3-name`); lesson sort values 1 to 12 are fixed below.
- Keep every Phase 3 behaviour working: all existing unit and end-to-end tests must still pass.
- Content targets: 12 sentence lessons; each has at least 3 sections, at least 4 annotated examples, at least 4 exercises and at least 1 `free_write`; at least 55 exercises overall; every pattern lesson ends with a "Use it in a new situation" section (the spec's "apply the same technique in a different situation").
- Responsive from 375px, visible focus, reduced motion respected, targets at least 44px.
- Project root: `C:\Users\yaxye\Desktop\english\wordcraft`. Commit after each task.

## Review Focus

1. `reorder` answers: an index list with a repeat, a missing index, an out-of-range index, or the wrong length is a 400 and stores nothing; any accepted ordering is correct (not only the first).
2. A `reorder` exercise whose accepted orderings do not use every fragment exactly once, or that has fewer than 3 fragments, is a validation error with the file path.
3. New annotation kinds follow the same safety rules as Phase 3: unknown kinds, unbalanced or nested braces and empty bodies stay literal; no markup can break a page.
4. `/labs/sentences/[lesson]` must 404 for a dialogue lesson slug, and `/labs/dialogue/[lesson]` must 404 for a sentence lesson slug.
5. Seeding a bundle with lessons in both labs keeps counts per lab right; `listLessons` for one lab never returns the other's lessons or counts.
6. Previous and next links stay inside their own lab.
7. The Dialogue lab pages must look and behave exactly as before after the shared-view refactor (existing end-to-end tests pass unchanged).

---

### Task 1: `reorder` exercise type (schema, seeding, checking)

**Files:**
- Modify: `src/lib/content/schemas.ts`, `src/lib/content/seed.ts`, `src/lib/exercises/check.ts`
- Test: extend `tests/content/lessons-load.test.ts` (new cases), `tests/content/lessons-seed.test.ts`, `tests/exercises/check.test.ts`; add a `reorder` case to `tests/content/lesson-helpers.ts` `exerciseYaml`.

**Interfaces:**
- Produces `ReorderExercise` in the `ExerciseFile` union: `{ type: 'reorder'; fragments: string[] (min 3, max 8, shown in this scrambled order); accepted: number[][] (min 1) }`. Each accepted list is an ordering of fragment indexes and must use every index from 0 to n-1 exactly once.
- `ExerciseType` gains `'reorder'`; `ExerciseKind` in `check.ts` gains `'reorder'`.
- Seeder split: `payload = { fragments }`, `answer = { accepted }`.
- `checkAnswer` for `reorder`: answer `{ order: number[] }` with the same length as the fragments, integers in range, no repeats, else `{ ok: false }`. Correct when the order equals any accepted ordering. Feedback uses the exercise explanation; on a wrong answer `expected` is the first accepted ordering joined as text (fragments in order separated by a space).

- [ ] **Step 1: Write failing tests**: loader (`reorder with fewer than 3 fragments is an error`, `accepted ordering that skips a fragment is an error`, `accepted ordering with a repeated index is an error`, `valid reorder loads`), seeder (`payload has fragments but not accepted; answer has accepted`), checker (`correct order passes`, `second accepted ordering also passes`, `wrong order fails with expected text`, `repeat index is an error`, `missing index is an error`, `out of range index is an error`, `wrong length is an error`, `non-integer is an error`).
- [ ] **Step 2: Run** `npx vitest run tests/content tests/exercises`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema (with a `superRefine` for the ordering rules), seeder split and checker case.
- [ ] **Step 4: Run** the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: reorder exercise type`.

### Task 2: Sentence-structure annotation kinds

**Files:**
- Modify: `src/lib/annotate.ts`, `src/components/AnnotationLegend.tsx`, `src/app/globals.css`
- Test: extend `tests/annotate.test.ts`

**Interfaces:**
- `AnnotationKind` gains `'main'` (main clause), `'sub'` (subordinate clause), `'part'` (participial phrase), `'link'` (connector such as however or because), `'detail'` (a sensory or descriptive detail). `KINDS` and `MAX_KIND_LENGTH` accept them (longest name stays within the limit).
- `<AnnotationLegend lab="dialogue" | "sentence" />` shows the right key for the lab (dialogue kinds, or main/sub/part/link/detail). Default is `dialogue` so existing callers keep working.
- Styles never rely on colour alone: `main` plain bold underline-free, `sub` dashed underline, `part` wavy underline, `link` highlighter (like emotion), `detail` italic with a left tint.

- [ ] **Step 1: Write failing tests**: `parses main sub part link and detail`, `an unknown kind next to a new kind stays literal`, `nested new kinds do not throw`, `new kinds survive stripAnnotations`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement. **Step 4:** run the whole suite, PASS.
- [ ] **Step 5: Commit** `feat: sentence-structure annotation kinds`.

### Task 3: Reorder exercise UI

**Files:**
- Create: `src/components/exercises/Reorder.tsx` (client)
- Modify: `src/components/ExercisePlayer.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes the check route (answer `{ order: number[] }`), `useCheck`, `Feedback`.
- `<Reorder slug prompt fragments />`: the fragments are shown as buttons in the scrambled order; pressing one appends it to "Your sentence" (a live region showing the built text); a "Remove last" and "Start again" button; "Check" enabled only when every fragment is used. Works by keyboard and touch (no drag and drop), buttons at least 44px. Label in `ExercisePlayer`'s type map: "Put in order".

- [ ] **Step 1: Implement** the component and wire it into `ExercisePlayer`.
- [ ] **Step 2: Verify** in the browser pane after Task 5 has seeded a `reorder` exercise: build a wrong order and a right order, keyboard only, at 375px and desktop.
- [ ] **Step 3: Commit** `feat: reorder exercise component`.

### Task 4: Shared lesson views and the Sentence lab pages

**Files:**
- Create: `src/components/LabLessonList.tsx`, `src/components/LessonView.tsx`, `src/app/labs/sentences/page.tsx`, `src/app/labs/sentences/[lesson]/page.tsx`
- Modify: `src/app/labs/dialogue/page.tsx`, `src/app/labs/dialogue/[lesson]/page.tsx`, `src/app/labs/page.tsx`, `src/app/page.tsx` (Labs tile text)

**Interfaces:**
- `LabInfo = { lab: 'dialogue' | 'sentence'; path: 'dialogue' | 'sentences'; title: string; intro: string }` with two constants for the labs.
- `<LabLessonList info lessons />` and `<LessonView info lesson />` hold the markup that the two Dialogue pages used in Phase 3 (list, legend for the lab, sections, related words, exercises, prev/next links built from `info.path`). The Dialogue pages become thin wrappers; the Sentence pages are the same wrappers with the other `LabInfo`.
- Each lesson page calls `notFound()` when the lesson's `lab` differs from the route's lab. `/labs` shows both labs as live cards with lesson count and progress.

- [ ] **Step 1: Write failing tests** where logic exists: extend `tests/lessons/queries.test.ts` with `listLessons keeps each lab's lessons and counts apart`, `prev and next stay inside the lab`. (Page behaviour is covered by Task 9's end-to-end tests.)
- [ ] **Step 2: Run.** Expected: FAIL for any case not already true; fix `queries.ts` only if needed.
- [ ] **Step 3: Implement** the refactor; the Dialogue lab output must be unchanged.
- [ ] **Step 4: Run** `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, the unit suite and the existing e2e specs. Expected: all pass.
- [ ] **Step 5: Commit** `feat: shared lab views and the sentence lab pages`.

### Task 5: Content guide and lessons 1 to 4

**Files:**
- Modify: `content/README.md` (document the new kinds and `reorder`)
- Create: `content/lessons/sentences/*.yaml`, `content/exercises/sentences/*.yaml` (reuse the scratch-generator approach; the generator must write to `lessons/sentences` and `exercises/sentences` and number slugs `s<lesson>-<n>-name`)

**Interfaces:** Fixed slugs and order for all twelve lessons:
1. `subordinate-clauses` (beginner): because, although, when, while, if; where the comma goes; main versus subordinate.
2. `participial-phrases` (intermediate): -ing and -ed openers and closers, the comma, the dangling-modifier mistake.
3. `cause-and-effect` (intermediate): because, so, therefore, as a result; putting the effect first.
4. `expressing-contrast` (intermediate): but, although, yet, however; contrast inside one sentence and across two.
5. `describing-movement` (intermediate): strong verbs, manner, direction, and one telling detail.
6. `describing-environments` (intermediate): the five senses, one detail per sense, from wide to close.
7. `emotion-through-physical-reaction` (intermediate): replacing a feeling word with a body detail inside a sentence.
8. `thoughts-and-realisations` (advanced): showing the moment of understanding; sentence shapes for sudden versus slow realisation.
9. `creating-suspense` (advanced): withholding, short sentences, a delayed reveal, and the sentence that ends on the key word.
10. `combining-actions-and-dialogue` (intermediate): one sentence that holds a gesture and a line of speech.
11. `sentence-length-and-rhythm` (advanced): short, medium and long sentences, and the effect of changing the length.
12. `improving-flow` (advanced): linking words, repeated structure, cutting filler, and reading aloud to test.

- [ ] **Step 1: Update** `content/README.md`.
- [ ] **Step 2: Write lessons 1 to 4** with at least 3 sections each, at least 4 annotated examples (use `main`, `sub`, `part`, `link`, `detail`), a final "Use it in a new situation" section showing the same pattern in a different setting, and `related` expression slugs where useful.
- [ ] **Step 3: Write exercises 1 to 4**: at least 4 per lesson using at least 3 types including `reorder` in lessons 1, 3 and 4, `fix_punctuation` for the comma rules in lessons 1 and 2, and one `free_write` with a sample per lesson.
- [ ] **Step 4: Run** `npm run content:validate` then `npm run content:seed`; read each lesson in the browser; verify the `reorder` UI (Task 3 Step 2) now.
- [ ] **Step 5: Commit** `content: sentence lab lessons 1-4`.

### Task 6: Lessons 5 to 8

**Files:** lesson and exercise YAML for lessons 5 to 8.

- [ ] **Step 1: Write lessons 5 to 8** and their exercises to the same bar (at least 4 exercises each, one `free_write` with a sample each, a final "Use it in a new situation" section).
- [ ] **Step 2: Run** `npm run content:validate`, `npm run content:seed`; read each lesson in the browser.
- [ ] **Step 3: Commit** `content: sentence lab lessons 5-8`.

### Task 7: Lessons 9 to 12

**Files:** lesson and exercise YAML for lessons 9 to 12.

- [ ] **Step 1: Write lessons 9 to 12** and their exercises to the same bar (lesson 12 may use more `free_write`, still at least 4 exercises).
- [ ] **Step 2: Run** `npm run content:validate`, `npm run content:seed`; read each lesson in the browser.
- [ ] **Step 3: Commit** `content: sentence lab lessons 9-12`.

### Task 8: Sentence lab coverage gate

**Files:**
- Test: `tests/content/sentence-coverage.test.ts`

**Interfaces:** Consumes `loadContent('content')`, `parseAnnotated`.

- [ ] **Step 1: Write the test**: `content has no validation errors`, `exactly the 12 planned sentence lessons in order with the fixed slugs`, `each lesson has at least 3 sections`, `each has at least 4 annotated examples`, `each has at least 4 exercises and at least one free_write`, `at least 55 sentence exercises`, `reorder is used at least 6 times`, `all new annotation kinds appear somewhere`, `every annotation parses with no leftover braces`, `each lesson's last section heading starts with "Use it in a new situation"`, `no two exercises (across both labs) share a prompt`.
- [ ] **Step 2: Run.** Expected: PASS (fix content, not thresholds).
- [ ] **Step 3: Commit** `test: sentence lab coverage gate`.

### Task 9: End-to-end tests, build and wrap-up

**Files:**
- Create: `tests/e2e/sentence-lab.spec.ts`
- Modify: `README.md` (one line), the Obsidian vault

- [ ] **Step 1: Write the spec** (desktop and phone): `the labs page links to both labs`, `the sentence lesson list shows 12 lessons in order`, `a sentence lesson page shows the sentence legend and structure marks`, `a reorder exercise rejects a wrong order and accepts a right one (using buttons only)`, `progress survives a reload in the sentence lab`, `a dialogue slug under /labs/sentences returns 404 and the reverse`, `previous and next links stay in the lab`, `posting a bad reorder answer returns 400`, `every sentence lesson loads without a console error`.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: all pass, including every earlier spec.
- [ ] **Step 3: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. Expected: green.
- [ ] **Step 4: Self-review** against the Review Focus list: point each line to a test, add a test where none exists.
- [ ] **Step 5: Vault**: create `Wordcraft - Sentence Lab.md`, link it from `Wordcraft.md` (mark Phase 4 built), add to `Decisions Log.md` and `Session Log.md`.
- [ ] **Step 6: Commit** `test: sentence lab end-to-end`; report what works and what is unverified; propose the Phase 5 plan (notebook and spaced repetition).
