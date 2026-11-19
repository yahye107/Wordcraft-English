# Wordcraft Dashboard, History and Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the learner what they have done and whether their writing is improving: a dashboard with a "today" panel and a next-step suggestion, a history of everything they practised, and a progress page with accurate, accessible charts. No AI and no API key are needed anywhere in this phase.

**Architecture:** A read-only layer in `src/lib/progress/` that turns the learner tables that already exist (exercise attempts, review logs, writing revisions and feedback, notebook, passage analyses) into plain numbers: activity per day and streaks, study stats, writing trends, a history feed and a next-step suggestion. Every function takes an injected `Db` and, where days matter, an injected clock and time zone so tests are exact. Pages are server components over those functions; charts are small inline-SVG components with text alternatives. The only schema change is indexes on the timestamp columns.

**Tech Stack:** Same as before (Next.js 16 App Router, node:sqlite, Vitest, Playwright, lucide-react). No new dependencies, no new tables.

**Spec:** `docs/superpowers/specs/2026-11-19-wordcraft-design.md` (section 9 "progress over time: issues per 100 words, repeat-error trend, expressions actually used in writing"; section 10 phase 8). Builds on the Phase 1 to 7 plans.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before page code (AGENTS.md). DB pages use `export const dynamic = 'force-dynamic'`; `params` and `searchParams` are Promises. Map `Db` rows to plain objects before passing them to client components.
- Before the UI tasks invoke `frontend-design`, `ui-ux-pro-max`, `emil-design-eng` and, for the charts, `dataviz`; keep to `docs/design-direction.md` (white page, highlighter marker as the one memorable mark, light theme only).
- **Read-only:** this phase never writes learner data and never changes content. The only migration (9) adds indexes. Deleting a writing session or passage analysis from the history is the existing delete, not new.
- **Local day:** all "days" are the learner's local calendar days (the server runs on their computer). Functions take an optional `tz` (minutes east of UTC) and a `now`; without `tz` they use the machine's local time. Weeks start on Monday.
- **Activity** means any of: an exercise attempt, a review log, a new writing revision, a passage analysis, a notebook entry added. Streak counts consecutive active days ending today, or ending yesterday when today has nothing yet (today is not a failure until it ends); counted over the last 400 days. No guilt wording anywhere; a missed day is just a day.
- **Honest numbers:** no division by zero or NaN anywhere; fewer than 3 writing sessions shows "Not enough writing yet" instead of a trend; "better" or "worse" needs at least a 10 percent change between the latest 3 sessions and the 3 before; every chart has a text alternative (a table or a sentence) and does not rely on colour alone.
- Content reseeding must never break these pages: attempts, reviews and notebook rows that point at removed lessons, exercises or expressions show a plain fallback label instead of failing.
- Responsive from 375px, visible focus, reduced motion respected, targets at least 44px. All earlier unit and end-to-end tests keep passing.
- Project root: `C:\Users\yaxye\Desktop\english\wordcraft`. Commit after each task.

## Review Focus

1. A brand-new database: every number is 0, there is no NaN or Infinity, charts show an empty state, the streak is 0, and the dashboard still offers a sensible first step.
2. Day boundaries: activity at 23:30 and 00:30 local lands on the right days (also across a month end, a year end and a daylight-saving change); a streak survives "nothing yet today" but breaks after a full empty day; rows dated in the future (clock set back) neither crash nor count as today.
3. Charts with 0, 1 or 2 data points, all-equal values, and very large values draw without NaN coordinates; every chart has a text alternative.
4. Trends are not over-claimed: under 3 sessions says "Not enough writing yet"; a 5 percent change says "about the same"; a session with 0 words counts as 0 issues per 100 words.
5. Learner rows whose lesson, exercise or expression was removed by a content reseed still appear in history and counts with a fallback label, and nothing throws.
6. A large history (5,000 attempts, 5,000 reviews, 300 sessions) renders the dashboard, progress and history pages in under one second of query time; the history pages its results.
7. Writing titles and passage previews are shown as plain text (a title like `<img src=x onerror=alert(1)>` appears literally).
8. Deleting a session or a passage from the history updates the feed, the counts and the trends, and the other items stay.

---

### Task 1: Indexes, local-day helpers and activity

**Files:**
- Modify: `src/lib/db/migrations.ts` (migration 9, indexes only)
- Create: `src/lib/progress/days.ts`, `src/lib/progress/activity.ts`
- Test: `tests/progress/days.test.ts`, `tests/progress/activity.test.ts`

**Interfaces:**
- Migration 9 `activity_indexes`: indexes on `exercise_attempts(created_at)`, `review_logs(reviewed_at)`, `writing_revisions(created_at)`, `novel_analyses(created_at)`, `notebook_entries(created_at)`.
- `days.ts`: `dayKey(at: string | Date, tz?: number): string` ('YYYY-MM-DD' in the local day); `shiftDay(key: string, n: number): string`; `daysBetween(a: string, b: string): number`; `startOfDay(key: string, tz?: number): string` (ISO instant); `weekday(key: string): number` (0 = Monday); `isDayKey(s: string): boolean`. Invalid input never throws: `dayKey` of an unparseable string returns `''`.
- `activity.ts`: `type ActivityKind = 'lesson' | 'review' | 'writing' | 'passage' | 'notebook'`; `type DayActivity = { day: string; total: number; byKind: Record<ActivityKind, number> }`; `type Activity = { days: DayActivity[]; today: number; currentStreak: number; longestStreak: number; activeDays7: number; activeDays30: number; lifetime: Record<ActivityKind, number>; firstDay: string | null }`; `getActivity(db: Db, opts?: { now?: Date; tz?: number; days?: number }): Activity`. `days` is oldest to newest, zero-filled, ends today, default length 84. Streaks look back 400 days. `lifetime` counts everything ever, not just the window. Timestamps after the end of today are ignored.

- [ ] **Step 1: Write failing tests.** `days`: `dayKey('2026-03-01T23:30:00Z', 120)` is `'2026-03-02'` and `dayKey('2026-03-01T23:30:00Z', -300)` is `'2026-03-01'`; month end, year end (`'2026-12-31T23:30:00Z'` with +120 is `'2027-01-01'`); `shiftDay('2026-03-01', -1)` is `'2026-02-28'` and handles leap day; `daysBetween`; `weekday('2026-11-23')` is 0 (a Monday); `dayKey('nonsense')` is `''`; the local default (no tz) is stable for a fixed instant. `activity`: empty database gives zeros, `days.length` 84 and no NaN; one row of each kind today counts 5 total with the right `byKind`; two rows at 23:30 and 00:30 local fall on two days; streak 3 for activity on today, yesterday and the day before; streak survives an empty today (activity only yesterday and the day before gives 2); a gap of one full empty day breaks it; `longestStreak` finds an older run longer than the current; future-dated rows are ignored; `lifetime` counts rows older than the window; `activeDays7` and `activeDays30`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement (one query per table, selecting only timestamps from the last 400 days, bucketed in JS). **Step 4:** run, PASS.
- [ ] **Step 5: Commit** `feat: activity and streaks`.

### Task 2: Study statistics

**Files:**
- Create: `src/lib/progress/study.ts`
- Test: `tests/progress/study.test.ts`

**Interfaces:**
- Consumes: `dayKey`, `shiftDay` from Task 1.
- Produces: `getStudyStats(db: Db, opts?: { now?: Date; tz?: number }): StudyStats` where `StudyStats = { notebook: { entries: number; cards: number; fresh: number; learning: number; mature: number; dueNow: number; dueNext7: number[] }; reviews: { last30: number; remembered: number; rate: number | null; perDay: number[] }; labs: { lab: 'dialogue' | 'sentence'; label: string; lessons: number; lessonsDone: number; exercises: number; exercisesDone: number }[]; accuracy: { attempts30: number; correct30: number; rate: number | null }; passages: number }`.
- Rules: a card is `fresh` when `reps = 0`, `mature` when `interval_days >= 21`, otherwise `learning`; `dueNow` counts cards due at or before `now`; `dueNext7` has 7 entries for today and the next six local days, with overdue cards counted in today; `remembered` counts grades good and easy (use the grade names from `src/lib/srs/schedule.ts`); `rate` is `remembered / last30` or `null` when there are no reviews (never 0 / 0); `perDay` is the last 30 local days, oldest first. A lesson is done when it has at least one exercise and all are done (the same "done" rule as `lessons/queries.ts`: a correct attempt, or any attempt at a free-write exercise). `accuracy` uses attempts with a non-null `correct` in the last 30 days. Labels: "Dialogue and narration", "Sentence construction".

- [ ] **Step 1: Write failing tests** for: empty database gives zeros and `null` rates; card stages at the 21-day boundary (20 learning, 21 mature) and a never-reviewed card is fresh; `dueNext7` puts an overdue card in today, one due in 3 days at index 3, and ignores later ones; `remembered` rate of 3 good or easy out of 4 reviews is 0.75; reviews older than 30 days are excluded from `last30` but entries still count in `cards`; lesson completion (a lesson with 2 exercises and one correct is not done; both done is done; a lesson with no exercises is never done); accuracy ignores free-write attempts (null) and attempts older than 30 days; an attempt whose exercise no longer exists changes `accuracy` but not the lab counts and does not throw; `passages` counts stored analyses.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement. **Step 4:** run, PASS.
- [ ] **Step 5: Commit** `feat: study statistics`.

### Task 3: Writing trends and expressions used

**Files:**
- Create: `src/lib/text/match.ts` (moved from `src/lib/novel/local.ts`), `src/lib/progress/writing.ts`
- Modify: `src/lib/novel/local.ts` (import the matcher)
- Test: `tests/progress/writing.test.ts`; existing `tests/novel/local.test.ts` must keep passing unchanged.

**Interfaces:**
- `match.ts`: move `findHits`, `tokenise` and their helpers out of `novel/local.ts` unchanged and export `findExpressionsIn(db: Db, text: string): { slug: string; text: string; quote: string; start: number; end: number }[]` (first match of each published expression, no overlaps, in order of position; no cap). `local.ts` keeps its 20-item cap.
- `writing.ts`:
  - `type SessionPoint = { sessionId: number; title: string; mode: string; date: string; words: number; versions: number; firstDraftPer100: number; finalPer100: number }`.
  - `getWritingTrends(db: Db, opts?: { limit?: number; now?: Date; tz?: number }): WritingTrends` where `WritingTrends = { sessions: SessionPoint[] /* oldest first, default limit 20 */; totals: { sessions: number; words: number; wordsLast30: number }; trend: { state: 'not-enough' | 'better' | 'same' | 'worse'; note: string }; repeatErrors: { key: string; label: string; recent: number; earlier: number }[] }`.
  - `firstDraftPer100` is the issue count of the first version per 100 words; `finalPer100` is the same for the latest version; both are `0` for a session with 0 words. Trend compares the mean `firstDraftPer100` of the latest 3 sessions with the mean of the up to 3 sessions before them (first drafts show habits; final drafts show revising). It is `not-enough` when there are fewer than 3 sessions or no earlier session to compare with (so 4 sessions compares the latest 3 with 1). A change under 10 percent of the earlier mean is `same`; a lower mean is `better`; a higher mean is `worse`; an earlier mean of 0 is `same` when the latest is 0 and `worse` otherwise. `note` is one plain sentence for each state ("Your first drafts have fewer problems per 100 words than before.").
  - `repeatErrors`: problems (category and key) in first versions, counted in the latest 5 sessions (`recent`) and the 5 before (`earlier`), top 5 by `recent`, labelled with `labelFor`.
  - `getExpressionUse(db: Db, opts?: { sessions?: number }): { libraryWords: { slug: string; text: string }[]; notebookWords: { slug: string; text: string }[]; notebookLibraryTotal: number }` using `findExpressionsIn` on the latest version of the most recent 20 sessions; `notebookWords` is the subset that is saved in the notebook; `notebookLibraryTotal` is the number of notebook entries linked to a library expression.

- [ ] **Step 1: Move the matcher first** and run the novel tests: they must stay green.
- [ ] **Step 2: Write failing tests** for: no sessions gives an empty list, `not-enough` and zeros; a session with 0 words gives 0 per 100 and no NaN; first draft versus final per 100 (3 issues in 50 words is 6); `not-enough` with 2 sessions and with 3 sessions (no earlier group); a comparison of 4 sessions (latest 3 against 1); `better`, `worse` and `same` (a 5 percent change) cases with 6 sessions; the earlier-mean-0 cases; `wordsLast30` excludes older sessions; `repeatErrors` compares the latest 5 with the 5 before and caps at 5; a deleted session disappears from the list and totals; `getExpressionUse` finds an inflected library word in the latest version only (not in a superseded version), lists a saved notebook word it contains, and reports `notebookLibraryTotal`.
- [ ] **Step 3: Run.** Expected: FAIL. **Step 4:** implement. **Step 5:** run the whole suite, PASS.
- [ ] **Step 6: Commit** `feat: writing trends`.

### Task 4: Next-step suggestions and the "today" summary

**Files:**
- Create: `src/lib/progress/suggest.ts`, `src/lib/progress/today.ts`
- Test: `tests/progress/suggest.test.ts`, `tests/progress/today.test.ts`

**Interfaces:**
- `suggest.ts`: `type Suggestion = { id: string; title: string; text: string; href: string }`; `suggestNext(input: { dueCards: number; weakness: { label: string; href: string } | null; nextLesson: { title: string; href: string; started: boolean } | null; daysSinceWriting: number | null; passages: number; hasActivity: boolean }): Suggestion[]`. Pure. Order and ids: `review` (dueCards > 0, "Review N cards", `/notebook/review`), `practise` (a weakness, links to the practice href), `lesson` ("Continue: title" when started, "Start: title" otherwise), `write` (no writing ever, or 7 or more days ago, `/studio/sentence`), `passage` (no passages yet and some activity, `/novel`), and a final `explore` ("Explore expressions", `/explore`) only when fewer than 2 other suggestions exist. At most 3 are returned.
- `today.ts`: `getToday(db: Db, opts?: { now?: Date; tz?: number }): Today` where `Today = { activity: Activity; week: DayActivity[] /* last 7 days */; dueCards: number; suggestions: Suggestion[] }`. It picks the weakness from `getWeaknesses` and `practiceFor` (first link), and the next lesson: the lesson with the most recent attempt that is not yet done, else the first not-done lesson of the dialogue lab, else of the sentence lab, else `null`.

- [ ] **Step 1: Write failing tests**: the ordering and the 3-item cap; `review` text pluralises ("1 card", "5 cards"); `explore` appears only as a filler; a brand-new learner (`hasActivity` false, nothing else) gets `lesson` and `write` and `explore`; a learner who wrote 3 days ago does not get `write`; `getToday` on an empty database returns 7 week entries, 0 due, and at least one suggestion; with a due card the first suggestion is `review`; with three repeated weaknesses a `practise` suggestion carries a real practice link; the "started" lesson is the one with the latest attempt.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement. **Step 4:** run, PASS.
- [ ] **Step 5: Commit** `feat: next-step suggestions`.

### Task 5: History feed

**Files:**
- Create: `src/lib/progress/feed.ts`
- Test: `tests/progress/feed.test.ts`

**Interfaces:**
- `type FeedType = 'all' | 'writing' | 'lessons' | 'reviews' | 'passages'`; `isFeedType(v: unknown): v is FeedType`.
- `type FeedItem = { kind: 'writing'; sessionId: number; title: string; mode: string; versions: number; words: number; at: string } | { kind: 'lessons'; lessonSlug: string | null; title: string; attempts: number; correct: number; at: string } | { kind: 'reviews'; count: number; remembered: number; at: string } | { kind: 'passage'; id: number; title: string; preview: string; aiUsed: boolean; at: string } | { kind: 'notebook'; count: number; at: string }`.
- `getFeed(db: Db, opts?: { type?: FeedType; mode?: string; limit?: number; tz?: number }): { days: { day: string; items: FeedItem[] }[]; hasMore: boolean }` newest first; default limit 60, at most 300. Lesson practice is one item per lesson per day; reviews and notebook additions are one item per day. An attempt whose exercise or lesson no longer exists is grouped as "An exercise that is no longer in the library" with `lessonSlug: null`. A passage with no title shows "Untitled passage". The `mode` filter applies only to writing. Each source is read with a bound of `limit * 5` newest rows so a huge history stays fast; `hasMore` is true when anything newer than the cut was left out.

- [ ] **Step 1: Write failing tests**: empty database gives no days and `hasMore` false; items from all sources are merged newest first and grouped by local day (`tz` given); one lesson with 3 attempts on a day is one item with `attempts` 3 and `correct` counting only correct ones; two days of reviews make two items; the type filter returns only that source; the mode filter keeps only that writing mode; the limit cuts the list and sets `hasMore`; removed lessons and exercises use the fallback label; HTML in a title comes back unchanged (escaping is the page's job); rows are plain objects.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement. **Step 4:** run, PASS.
- [ ] **Step 5: Commit** `feat: history feed`.

### Task 6: Chart components

**Files:**
- Create: `src/lib/progress/chart.ts`, `src/components/charts/LineChart.tsx`, `src/components/charts/ActivityGrid.tsx`, `src/components/charts/MeterBar.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/progress/chart.test.ts`

**Interfaces:**
- `chart.ts` (pure): `scalePoints(values: number[], opts: { width: number; height: number; pad: number; min?: number; max?: number }): { x: number; y: number }[]` (never returns NaN or Infinity: no values gives `[]`, one value is centred horizontally, all-equal values sit on the middle line, a non-finite input is treated as 0); `niceMax(n: number): number` (rounds up to 1, 2, 5 times a power of ten; 0 or negative gives 1); `describeSeries(name: string, values: number[], unit: string): string` (one sentence: first value, last value, lowest and highest).
- `LineChart({ title, series: { name: string; values: number[]; className: string }[]; labels: string[]; unit: string; emptyText: string })` is an SVG with `role="img"` and an `aria-label` built from `describeSeries`, a "Show the numbers" `<details>` with a table, direct labels on the last point of each series (not a colour-only legend), and the empty state when no series has data. Two series differ by line style (solid and dashed) as well as colour.
- `ActivityGrid({ days: DayActivity[] })` shows a weeks-by-weekdays grid (Monday first) with 5 levels, a legend, a `title` per cell ("Mon 23 Nov: 4 things"), and a visually hidden list of the last 14 days; levels are shown by fill and by a small pattern so they do not depend on colour alone.
- `MeterBar({ value, max, label })` is a thin bar with text, safe for `max` 0.
- Invoke `dataviz`, `frontend-design`, `ui-ux-pro-max` and `emil-design-eng` first; no entrance animation on charts (they are read, not watched); respect reduced motion.

- [ ] **Step 1: Write failing tests for `chart.ts`**: `scalePoints([])` is `[]`; one value is centred; two equal values are on the middle line; `[0, 10]` runs from the bottom to the top inside the padding; a `NaN` or `Infinity` input gives finite output; `niceMax(0)`, `niceMax(7)` is 10, `niceMax(11)` is 20, `niceMax(430)` is 500; `describeSeries` for 0, 1 and 3 values.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3:** implement `chart.ts`. **Step 4:** run, PASS.
- [ ] **Step 5: Implement the three components and CSS** (checked visually in Task 7).
- [ ] **Step 6: Commit** `feat: accessible chart components`.

### Task 7: Dashboard, Progress and History pages

**Files:**
- Modify: `src/app/page.tsx`, `src/app/progress/page.tsx`, `src/app/history/page.tsx`, `src/app/globals.css`
- Create: `src/components/progress/TodayPanel.tsx`, `src/components/progress/FeedList.tsx`, `src/components/progress/StatTile.tsx`

**Interfaces and behaviour:**
- **Dashboard `/`** keeps its heading ("From a plain thought to a written sentence"), the example and the tiles. Above the tiles, a "Today" panel (`data-testid="today"`) shows the first suggestion as the main action and up to two more as links, the current streak in plain words ("3 days in a row"; "No streak yet" when 0; "Today counts too" is never shown as a warning), a 7-day strip (a filled mark per active day, with text for screen readers), and the due-card count. A brand-new learner sees "Start here" with the lesson and write suggestions.
- **Progress `/progress`** (replaces the links page), sections in this order, each with a heading and a one-sentence plain explanation: **Activity** (the 84-day `ActivityGrid`, current and longest streak, active days in the last 7 and 30, lifetime counts by kind); **Writing** (the `LineChart` of first-draft and final problems per 100 words per session with the trend sentence and a table of sessions linking to each one; repeat errors recent versus earlier with plain words "less often", "about the same", "more often" next to the numbers; words written this month); **Words you use** (library words and saved notebook words used in recent writing, each linking to its page, with "N of M saved words used"); **Review** (cards by stage as three `MeterBar`s, due over the next 7 days as a small bar list, remembered rate over 30 days or "No reviews yet", a link to review); **Labs** (lessons done and exercises done per lab with `MeterBar`, accuracy over 30 days). Every empty section says what to do to fill it, with a link. Links to Tutor and History stay at the bottom.
- **History `/history`**: heading "History"; type chips All, Writing, Lessons, Reviews, Passages (`?type=`); under Writing, the existing mode chips (`?mode=`; a bare `?mode=x` still works and means type writing); days as headings ("Today", "Yesterday", then the date); each writing and passage row is an `li.panel` with a link and the existing delete button (`DeleteSessionButton`, `DeleteAnalysisButton`); lesson, review and notebook rows are plain `li.panel` rows with a link where there is one; a "Show more" link adds 60 (`?limit=`); an empty state per filter. Titles and previews render as plain text.
- Link the three from the navigation as now (no change); the Progress nav label stays "Progress".

- [ ] **Step 1: Invoke the four UI skills.**
- [ ] **Step 2: Implement** the pages and components over the Task 1 to 6 functions (server components; plain objects only).
- [ ] **Step 3: Verify in the browser** at 375px and desktop, first on an empty database copy and then with real activity: dashboard Today panel, every Progress section, History filters and delete; no console errors, no horizontal scroll, charts readable, the "Show the numbers" tables match the charts.
- [ ] **Step 4: Commit** `feat: dashboard, progress and history pages`.

### Task 8: Large-data check, end-to-end tests, wrap-up

**Files:**
- Create: `tests/progress/scale.test.ts`, `tests/e2e/progress.spec.ts`; modify `README.md` if needed and the Obsidian vault

- [ ] **Step 1: Scale test (unit).** Insert 5,000 attempts, 5,000 review logs and 300 writing sessions with revisions and feedback across 400 days into an in-memory database, then call `getToday`, `getActivity`, `getStudyStats`, `getWritingTrends`, `getExpressionUse` and `getFeed`. Expected: each finishes in well under one second and the totals match the inserted rows. Also a reseed case: attempts and a session referencing missing lessons and expressions do not throw.
- [ ] **Step 2: Write the e2e spec** (desktop and phone; activity is created through the existing APIs because the two projects share one database, so assert "at least" and unique titles): `the dashboard shows a Today panel with a suggestion and a streak line`, `after finishing a lesson exercise the streak shows at least 1 day and the history lists the lesson`, `a writing session appears in the history, on the progress page table and can be deleted from the history`, `the progress page shows each section with an empty-state link or numbers`, `the Show the numbers table matches the chart summary`, `the history type filter limits the list and the old mode filter still works`, `Show more reveals older items`, `a title containing HTML is shown as text`, `a saved notebook word used in writing appears under Words you use`, `no console errors on dashboard, progress and history`, `the page does not scroll sideways at 375px`.
- [ ] **Step 3: Run** `npm run test:e2e`. Expected: all pass, including every earlier spec (the dashboard heading test and the studio history test must still pass).
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. Expected: green.
- [ ] **Step 5: Self-review** against the Review Focus list; point each line at a test and add one where there is none.
- [ ] **Step 6: Vault:** create `Wordcraft - Progress.md`, link it from `Wordcraft.md` (Phase 8 built), add to `Decisions Log.md` and `Session Log.md`.
- [ ] **Step 7: Commit** `test: progress end-to-end`; report what works and what is unverified; propose the Phase 9 plan (content expansion and a draft-review workflow).
