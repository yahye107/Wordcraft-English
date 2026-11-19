# Wordcraft Dialogue and Narration Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dialogue and Narration lab: file-based lessons with colour-coded annotated examples, auto-checked and free-writing exercises, saved attempts and per-lesson progress, with 12 original lessons and about 60 exercises.

**Architecture:** Lessons and exercises are YAML files under `content/`, validated by Zod and seeded by slug into new `lessons` and `exercises` tables (extending the Phase 1 loader and seeder). Exercise answers are checked on the server by a pure function; attempts go into a new learner table that seeding never touches. Pages are server components; one client component runs the exercise forms.

**Tech Stack:** Same as Phase 1 and 2 (Next.js 16, TypeScript, `node:sqlite`, Zod, Vitest, Playwright). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-19-wordcraft-design.md` (section 8 "Dialogue & Narration lab", Phase 3 in section 10). Builds on `docs/superpowers/plans/2026-11-19-foundation-and-library.md`.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing page or route-handler code (AGENTS.md). Pages that read the database use `export const dynamic = 'force-dynamic'`; Cache Components stay off. `params` and `searchParams` are Promises (`PageProps<'/route'>`, `RouteContext<'/route'>`).
- Invoke the user's UI skills (frontend-design, ui-ux-pro-max, emil-design-eng) before building the lab pages, and keep to `docs/design-direction.md`: the taught words use the highlighter, mistakes the red strike, corrections green.
- All lesson and exercise text is original. Nothing is copied from novels or any copyrighted source. All explanations in simple English.
- Content is data: adding a lesson or exercise means adding a YAML file, with no code change.
- Learner tables (`exercise_attempts`) are never read or written by seeding. Attempts store the exercise **slug** (no foreign key), so changing or deleting an exercise never deletes a learner's history.
- Exercise answers are checked on the server. Answers are not sent to the browser in the lesson page data.
- Exercise types in this phase: `choose`, `fill_blank`, `identify`, `fix_punctuation` (auto-checked) and `free_write` (self-checked with a checklist; no AI). The AI tutor arrives in a later phase.
- Levels reuse `beginner | intermediate | advanced | literary`.
- Responsive from 375px to desktop, visible focus, `prefers-reduced-motion` respected, touch targets at least 44px.
- Content targets: 12 lessons; every lesson has at least 3 sections, at least 4 annotated examples, at least 4 exercises and at least 1 `free_write`; at least 55 exercises overall.
- Project root: `C:\Users\yaxye\Desktop\english\wordcraft`. Commit after each task.

## Review Focus

1. Annotation markup with unknown kinds, unbalanced or nested braces, or an empty body must render as literal text and never throw.
2. Answer matching: curly versus straight quotes, extra spaces and letter case must not make a correct `fill_blank` wrong; `fix_punctuation` must still insist on exact punctuation and capitals.
3. A submitted answer that is empty, the wrong shape for the exercise type, or longer than 4,000 characters returns 400; an unknown exercise returns 404; neither stores an attempt.
4. Re-seeding after editing, renaming or deleting a lesson or exercise keeps every stored attempt and creates no duplicates.
5. A lesson that references a missing related expression, an exercise that references a missing lesson, a `choose` answer index outside its options, and a `fill_blank` prompt without a blank are all validation errors with the file path.
6. An unknown lesson slug returns the 404 page; a lesson with no related expressions or no examples in a section renders without empty headings.
7. Progress counts an auto-checked exercise as done only after a correct attempt, and a `free_write` as done once a non-empty answer is saved; a wrong attempt followed by a right one counts once.

---

### Task 1: Lesson and exercise schemas, loader and validator

**Files:**
- Modify: `src/lib/content/schemas.ts`, `src/lib/content/load.ts`, `scripts/content-validate.ts`
- Test: `tests/content/lessons-load.test.ts`

**Interfaces:**
- Consumes: `slug`, `text`, `Level` helpers and `ContentBundle`, `loadContent` (Phase 1).
- Produces (in `schemas.ts`, Zod with inferred types):
  - `LessonSection = { heading: string; paragraphs: string[] (min 1); bullets: string[] (default []); examples: { text: string; note?: string }[] (default []) }`. `text` may contain annotation markup (Task 2).
  - `LessonFile = { slug; lab: 'dialogue' | 'sentence'; title; summary; level: Level; sort: number (int); sections: LessonSection[] (min 2); related: string[] (expression slugs, default []) }`.
  - `ExerciseFile` is a discriminated union on `type`, all sharing `{ slug; lesson: string (lesson slug); level: Level; prompt: string; explanation: string }` plus:
    - `choose`: `options: string[]` (2 to 6), `answer: number` (index into options).
    - `fill_blank`: `accepted: string[]` (min 1). `prompt` must contain `___`.
    - `identify`: `items: { text: string; answer: string }[]` (min 2), `choices: string[]` (min 2); every item answer must be one of `choices`.
    - `fix_punctuation`: `broken: string`, `accepted: string[]` (min 1).
    - `free_write`: `checklist: string[]` (3 to 6), `sample?: string`.
  - `ContentBundle` gains `lessons: LessonFile[]` and `exercises: ExerciseFile[]`.
- Produces (in `load.ts`): `loadContent` also reads `lessons/**/*.yaml` and `exercises/**/*.yaml`, with cross-checks: duplicate lesson or exercise slugs, exercise `lesson` exists, lesson `related` slugs exist as expressions.

- [ ] **Step 1: Write failing tests** in `tests/content/lessons-load.test.ts` (reuse `makeContentDir` and helpers): `valid lesson and exercises load with no errors`, `lesson with one section is an error`, `exercise for a missing lesson is an error naming the slug`, `related expression that does not exist is an error`, `choose answer index outside the options is an error`, `fill_blank prompt without ___ is an error`, `identify answer not in choices is an error`, `free_write with 2 checklist items is an error`, `duplicate exercise slug names both files`.
- [ ] **Step 2: Run** `npx vitest run tests/content/lessons-load.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the schemas and loader changes; make `content-validate` print counts of lessons and exercises.
- [ ] **Step 4: Run** the new tests and the whole suite (`npx vitest run`). Expected: PASS, nothing from Phase 1 and 2 broken.
- [ ] **Step 5: Commit** `feat: lesson and exercise schemas and loader`.

### Task 2: Annotation parser

**Files:**
- Create: `src/lib/annotate.ts`
- Test: `tests/annotate.test.ts`

**Interfaces:**
- Produces: `type AnnotationKind = 'plain' | 'speech' | 'tag' | 'beat' | 'thought' | 'emotion'`; `type Segment = { text: string; kind: AnnotationKind }`; `parseAnnotated(input: string): Segment[]`. Syntax `{kind|text}` marks a span, for example `{speech|“Get out,”} {tag|she said.}`. Unknown kinds, a missing `|`, unbalanced or nested braces, and empty bodies stay as literal plain text. Adjacent plain pieces are merged. `stripAnnotations(input: string): string` returns the text with markup removed (used for search and plain-text checks).

- [ ] **Step 1: Write failing tests**: `marks a tag and a beat and keeps the plain text between`, `unknown kind stays literal`, `unbalanced opening brace stays literal`, `closing brace with no opening stays literal`, `nested braces do not throw and keep the text`, `empty body {tag|} stays literal`, `curly quotes and em dashes pass through unchanged`, `stripAnnotations removes markup only`, `input with no markup returns one plain segment`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** a single left-to-right scan (no regular expression backtracking on untrusted input).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: annotation parser for coloured dialogue examples`.

### Task 3: Database tables and seeder

**Files:**
- Modify: `src/lib/db/migrations.ts` (migration 3), `src/lib/content/seed.ts`
- Test: `tests/content/lessons-seed.test.ts`, extend `tests/db/migrate.test.ts`

**Interfaces:**
- Consumes: `Db`, `ContentBundle` (Task 1).
- Produces tables: `lessons(id, slug UNIQUE, lab, title, summary, level, sort, body_json)` where `body_json` holds `{ sections, related }`; `exercises(id, slug UNIQUE, lesson_id REFERENCES lessons ON DELETE CASCADE, type, level, prompt, payload_json, answer_json, explanation, sort)` where `payload_json` is what the learner sees (options, items and choices, broken text, checklist) and `answer_json` is the key; `exercise_attempts(id, exercise_slug TEXT NOT NULL, answer_json TEXT NOT NULL, correct INTEGER NULL, created_at)` with an index on `exercise_slug` (learner data, no foreign key).
- `seedContent` upserts lessons and exercises by slug, rebuilds nothing else, removes lessons and exercises no longer in the bundle, and returns the same `SeedResult` shape (counts still describe expressions only). It never reads or writes `exercise_attempts`.

- [ ] **Step 1: Write failing tests**: `migration 3 creates lessons, exercises and exercise_attempts`, `seeding twice leaves the same lesson and exercise counts`, `editing an exercise updates it in place`, `removing an exercise from the bundle deletes it`, `removing a lesson deletes its exercises`, `attempts survive editing and deleting the exercise they point at` (insert an attempt, seed, delete the exercise, seed again, assert the row is unchanged), `payload_json never contains the answer for choose` (assert the `answer` key is absent from `payload_json`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** migration 3 and the seeder changes. Split each exercise into `payload_json` and `answer_json` per type.
- [ ] **Step 4: Run** the new tests and the whole suite. Expected: PASS (the migration count assertion in the Phase 1 test must use `MIGRATIONS.length`).
- [ ] **Step 5: Commit** `feat: lesson and exercise tables and seeding`.

### Task 4: Answer checking

**Files:**
- Create: `src/lib/exercises/check.ts`
- Test: `tests/exercises/check.test.ts`

**Interfaces:**
- Produces:
  - `type StoredExercise = { slug: string; type: 'choose' | 'fill_blank' | 'identify' | 'fix_punctuation' | 'free_write'; payload: unknown; answer: unknown; explanation: string }`.
  - `type CheckResult = { ok: true; correct: boolean | null; feedback: string; expected?: string } | { ok: false; error: string }`. `correct` is `null` for `free_write`.
  - `checkAnswer(ex: StoredExercise, answer: unknown): CheckResult`. Expected answer shapes: `choose` `{ choice: number }`; `fill_blank` `{ text: string }`; `identify` `{ labels: string[] }` (one per item); `fix_punctuation` `{ text: string }`; `free_write` `{ text: string }`. Any other shape, an empty or whitespace-only text, an out-of-range choice, a wrong number of labels, or text over 4,000 characters returns `{ ok: false, error }`.
  - `normaliseLoose(s: string): string` (used by `fill_blank`): lower-case, curly to straight quotes, collapse spaces, trim, drop trailing `. , ! ?`.
  - `normaliseStrict(s: string): string` (used by `fix_punctuation`): curly to straight quotes and collapse spaces and trim only; letter case and punctuation are kept.
- Feedback text: correct answers say what was right and why using the exercise `explanation`; wrong answers show the explanation and, for `choose`, `fix_punctuation` and `fill_blank`, an `expected` string; `identify` lists which items were wrong. Never reveal more than the stored answer.

- [ ] **Step 1: Write failing tests**: `choose correct and wrong`, `choose index out of range is an error`, `fill_blank ignores case, spacing and curly quotes`, `fill_blank accepts any of several accepted answers`, `fill_blank rejects a different word`, `fix_punctuation requires exact punctuation and capitals`, `fix_punctuation ignores curly versus straight quotes and double spaces`, `identify marks the wrong items`, `identify with the wrong number of labels is an error`, `free_write with text returns correct null and the explanation`, `empty text is an error for every text type`, `text over 4000 characters is an error`, `a number where text is expected is an error`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the functions.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: exercise answer checking`.

### Task 5: Lesson queries and answer submission

**Files:**
- Create: `src/lib/lessons/queries.ts`, `src/lib/lessons/submit.ts`
- Test: `tests/lessons/queries.test.ts`, `tests/lessons/submit.test.ts`

**Interfaces:**
- Consumes: tables from Task 3, `checkAnswer` (Task 4), `parseAnnotated` is not needed here.
- Produces:
  - `type LessonSummary = { slug; title; summary; level; sort: number; exerciseCount: number; doneCount: number }`; `listLessons(db: Db, lab: 'dialogue' | 'sentence'): LessonSummary[]` ordered by `sort`.
  - `type PublicExercise = { slug; type; level; prompt; payload: unknown; done: boolean }` (payload from `payload_json`, never the answer); `type LessonDetail = { slug; lab; title; summary; level; sections: LessonSection[]; related: { slug: string; text: string }[]; exercises: PublicExercise[]; prev?: { slug: string; title: string }; next?: { slug: string; title: string } }`; `getLesson(db: Db, slug: string): LessonDetail | undefined`. Related expressions that are drafts are left out.
  - "Done" rule: an exercise is done when it has an attempt with `correct = 1`, or (for `free_write`) any attempt with `correct IS NULL`.
  - `submitAnswer(db: Db, exerciseSlug: string, answer: unknown): { status: 200; body: CheckResult & { ok: true } } | { status: 400 | 404; body: { ok: false; error: string } }` loads the exercise, calls `checkAnswer`, and stores an attempt (`exercise_slug`, `answer_json`, `correct`) only on a valid answer.

- [ ] **Step 1: Write failing tests** (seed a small bundle in memory): `listLessons returns lessons in order with exercise and done counts`, `getLesson returns sections related and exercises without answers`, `getLesson returns undefined for an unknown slug`, `a wrong then a right attempt counts the exercise once`, `a free_write counts as done after one saved answer`, `getLesson gives prev and next in order`, `submitAnswer stores an attempt for a valid answer`, `submitAnswer returns 400 and stores nothing for an invalid answer`, `submitAnswer returns 404 for an unknown exercise and stores nothing`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with plain SQL.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: lesson queries and answer submission`.

### Task 6: Answer route handler

**Files:**
- Create: `src/app/api/exercises/[slug]/check/route.ts`
- Test: covered by Task 11 end-to-end and by `tests/lessons/submit.test.ts` (logic); add `tests/lessons/route.test.ts` for the handler.

**Interfaces:**
- Consumes: `submitAnswer`, `getDb`.
- Produces: `POST /api/exercises/{slug}/check` with JSON body `{ "answer": ... }`; responds with `submitAnswer`'s status and body as JSON; invalid JSON or a missing `answer` is a 400; bodies over 10,000 bytes are a 413. Never returns stored answers except through `expected` on a wrong auto-checked attempt.

- [ ] **Step 1: Write failing tests** calling the exported `POST` with a `Request` against an in-memory database injected through `WORDCRAFT_DB` or a test seam you choose: `valid choose answer returns 200 with correct true`, `body that is not JSON returns 400`, `missing answer returns 400`, `unknown exercise returns 404`, `oversized body returns 413`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the handler (read the route handler docs first).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: exercise check route`.

### Task 7: Lab pages and components

**Files:**
- Create: `src/app/labs/page.tsx` (replaces the placeholder), `src/app/labs/dialogue/page.tsx`, `src/app/labs/dialogue/[lesson]/page.tsx`, `src/components/Annotated.tsx`, `src/components/AnnotationLegend.tsx`, `src/components/LessonBody.tsx`, `src/components/ExercisePlayer.tsx` (client), `src/components/exercises/{Choose,FillBlank,Identify,FixPunctuation,FreeWrite}.tsx` (client)
- Modify: `src/app/globals.css`, `src/app/page.tsx` (the Labs tile text)

**Interfaces:**
- Consumes: `listLessons`, `getLesson` (Task 5), `parseAnnotated` (Task 2), the check route (Task 6), `Highlighted`/expression links from Phase 2.
- Produces:
  - `<Annotated text={string} />` renders segments as `<span class="ann ann-{kind}">`; colours and an underline style so the kind is not conveyed by colour alone (tag underlined, beat dotted underline, speech plain, thought italic, emotion bold).
  - `<AnnotationLegend />` explains the kinds; shown at the top of each lesson.
  - `<ExercisePlayer exercise={PublicExercise} />` renders the right form, posts to the check route, shows feedback in a `role="status"` live region, keeps the answer after checking, offers "Try again" for wrong auto-checked answers, and for `free_write` shows the checklist as tick boxes, a Save button, then the stored `sample` (if any) labelled "One possible version, after you have written yours". The sample text is not in the page data before saving: the route returns it with the save response for `free_write` only (add `sample?: string` to the `CheckResult` ok-variant for `free_write` in Task 4's function and cover it with a test there).
  - `/labs` shows two labs: Dialogue and narration (link, lesson count, your progress) and Sentence construction (not yet available). `/labs/dialogue` lists lessons in order with level and "n of m exercises done". `/labs/dialogue/[lesson]` shows title, summary, legend, sections (paragraphs, bullets, annotated examples with their notes), related expressions as links, the exercises, and previous and next links. Unknown slug calls `notFound()`.

- [ ] **Step 1: Invoke** `frontend-design`, `ui-ux-pro-max` and `emil-design-eng` and follow `docs/design-direction.md`.
- [ ] **Step 2: Add the Task 4 test and change** for `free_write` returning `sample` after a valid save, run it red then green.
- [ ] **Step 3: Implement** the pages and components. Press feedback `scale(0.97)`, no animation on keyboard-driven actions, reduced motion respected.
- [ ] **Step 4: Verify in the browser pane** at 375px and 1280px, with the seeded sample lesson from Task 8: legend, coloured example, a correct and a wrong answer on each type, tab-key use of every form, no horizontal scroll, no console errors.
- [ ] **Step 5: Commit** `feat: dialogue lab pages`.

### Task 8: Content authoring guide and the first lessons (1 to 4)

**Files:**
- Modify: `content/README.md`
- Create: `content/lessons/dialogue/*.yaml` and `content/exercises/dialogue/*.yaml` for lessons 1 to 4

**Interfaces:**
- Consumes: schemas (Task 1), annotation syntax (Task 2). Lesson slugs and order are fixed here and used by every later task:
  1. `what-dialogue-tags-do` (sort 1, beginner): said as the invisible tag, when a tag is needed, one tag per speech.
  2. `tags-and-action-beats` (sort 2, beginner): the difference, the punctuation and capital rules for both (comma and lower case after speech then tag; full stop and capital for a beat; question and exclamation marks followed by a lower-case tag), why a non-speech verb such as smiled cannot be a tag.
  3. `where-beats-go` (sort 3, intermediate): beats before, during and after speech, splitting speech around a beat, one paragraph per speaker.
  4. `dialogue-without-tags` (sort 4, intermediate): letting context, voice and alternating lines show who speaks, and when to bring a tag back.

- [ ] **Step 1: Update** `content/README.md` with the lesson file, exercise file (all five types with a short example each), the annotation syntax and the quality bar below.
- [ ] **Step 2: Write lessons 1 to 4** to the shared quality bar: at least 3 sections, at least 4 annotated examples (original, varied emotions and settings), a plain explanation of why each example works, related expression slugs from the library (for example `whispered`, `snapped`, `protested`, `remarked`, `exclaimed`, `drawled`, `stammered`, `shrugged`, `fidgeted`).
- [ ] **Step 3: Write exercises for lessons 1 to 4**: at least 4 per lesson, mixing at least 3 types, each with a clear `explanation`, plus at least 1 `free_write` per lesson with a 3 to 6 point checklist and a `sample`. Include `fix_punctuation` items about tag versus beat punctuation in lesson 2.
- [ ] **Step 4: Run** `npm run content:validate`. Expected: no errors. Run `npm run content:seed`.
- [ ] **Step 5: Open** `/labs/dialogue` and one lesson in the browser; read it as a learner would (is each example clearly better than the plain version?).
- [ ] **Step 6: Commit** `content: dialogue lab lessons 1-4`.

### Task 9: Lessons 5 to 8

**Files:**
- Create: lesson and exercise YAML for lessons 5 to 8

**Interfaces:**
- Consumes: the same quality bar. Fixed slugs:
  5. `showing-emotion-in-dialogue` (sort 5, intermediate): words plus a beat instead of an adverb, anger, joy, sadness, fear.
  6. `faces-and-bodies-with-speech` (sort 6, intermediate): facial expressions and body language alongside speech, matching the gesture to the feeling.
  7. `hesitation-and-uncertainty` (sort 7, intermediate): fillers, broken sentences, em dashes and ellipses used with care, trailing off, interruption.
  8. `sarcasm-and-subtext` (sort 8, advanced): saying one thing and meaning another, tag and beat choices that signal it.

- [ ] **Step 1: Write lessons 5 to 8** and their exercises to the same bar as Task 8 (at least 4 exercises each, one `free_write` each with a sample).
- [ ] **Step 2: Run** `npm run content:validate`, then `npm run content:seed`.
- [ ] **Step 3: Read** each lesson in the browser for accuracy of the punctuation rules and naturalness of every example.
- [ ] **Step 4: Commit** `content: dialogue lab lessons 5-8`.

### Task 10: Lessons 9 to 12

**Files:**
- Create: lesson and exercise YAML for lessons 9 to 12

**Interfaces:**
- Fixed slugs:
  9. `confidence-and-frustration` (sort 9, advanced): voice contrast between a sure speaker and a frustrated one, rhythm and sentence length in speech.
  10. `inner-thoughts-and-reactions` (sort 10, advanced): thought versus speech, italics or none, direct and reported thought, a reaction beat after hearing something.
  11. `avoiding-repeated-tags` (sort 11, intermediate): why "said" is enough, when a stronger tag earns its place (link to the whisper, snapped, exclaimed families), replacing tags with beats, varying rhythm.
  12. `a-short-scene` (sort 12, advanced): a scene that combines every technique, annotated line by line, with a longer `free_write`.

- [ ] **Step 1: Write lessons 9 to 12** and exercises to the same bar (lesson 12 may have more `free_write` and fewer auto-checked exercises, but at least 4 exercises in all).
- [ ] **Step 2: Run** `npm run content:validate`, then `npm run content:seed`.
- [ ] **Step 3: Read** each lesson in the browser; fix anything unclear or unnatural.
- [ ] **Step 4: Commit** `content: dialogue lab lessons 9-12`.

### Task 11: Dialogue lab coverage gate

**Files:**
- Test: `tests/content/dialogue-coverage.test.ts`

**Interfaces:**
- Consumes: `loadContent('content')`, `parseAnnotated`.

- [ ] **Step 1: Write the test**: `content has no validation errors`, `there are exactly the 12 planned dialogue lessons with the fixed slugs and sort order`, `each lesson has at least 3 sections`, `each lesson has at least 4 annotated examples (segments of a kind other than plain count in examples across its sections)`, `each lesson has at least 4 exercises and at least one free_write`, `at least 55 exercises overall`, `all five exercise types are used`, `every annotation in every example parses with no literal leftover braces`, `no two exercises share a prompt`.
- [ ] **Step 2: Run.** Expected: PASS (if it fails, fix the content, never the thresholds).
- [ ] **Step 3: Commit** `test: dialogue lab coverage gate`.

### Task 12: End-to-end tests, build and wrap-up

**Files:**
- Create: `tests/e2e/dialogue-lab.spec.ts`
- Modify: `README.md` (one line), the Obsidian vault (see Step 5)

**Interfaces:**
- Consumes: everything above; the e2e server from Phase 2 (production build, separate database).

- [ ] **Step 1: Write the e2e spec** (desktop and phone projects): `the labs page links to the dialogue lab`, `the lesson list shows 12 lessons in order`, `a lesson page shows the legend and a coloured tag and beat`, `a correct choose answer says correct and a wrong one shows the explanation`, `fix_punctuation accepts a correct fix and rejects a missing capital`, `progress survives a page reload`, `free_write shows the sample only after saving`, `an unknown lesson slug returns 404`, `posting an invalid answer to the check route returns 400`, `every lesson page loads without a console error` (loop over the 12 slugs).
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: PASS (fix real defects, not tests).
- [ ] **Step 3: Run** `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build`. Expected: all green.
- [ ] **Step 4: Self-review** against the Review Focus list: for each line, point to the test that pins it; add a test where none exists.
- [ ] **Step 5: Vault update** (the user's standing rule): create `Wordcraft - Dialogue Lab.md` (what it teaches, the annotation syntax, how to add a lesson, how progress works), link it from `Wordcraft.md` (mark Phase 3 built), and append to `Decisions Log.md` and `Session Log.md` using `[[double brackets]]`.
- [ ] **Step 6: Commit** `test: dialogue lab end-to-end` and report to the user what works, what is unverified, and propose the Sentence lab (Phase 4) plan.
