# Wordcraft: design

Status: draft for approval. Date: 2026-11-19.

## 1. Intent and why

The user reads English novels, follows conversation and speaks it, but their own **writing** comes out basic. They cannot find the right word, build a natural sentence, show an emotion, write dialogue with action around it, or move from a plain thought to a good paragraph and eventually a story.

Wordcraft is a personal, long-term writing-development platform. Its purpose is to make the user an **independent** writer of natural, expressive English. It teaches *how to transform a basic thought into a well-built sentence*, through contextual expression entries, craft labs, practice with explained feedback, and spaced repetition of what they learn.

The user already studies by reading novels in Obsidian/PDF and noting unknown words (for example from *The Giver*: "apprehensive", "clenched", "a defiant gesture"), with spelling slips in their notes. The novel-sentence lab and the notebook should fit that existing habit.

## 2. Goals, non-goals, anti-goals

**Goals**
- A structured, expandable expression library (words, phrases, idioms, collocations, patterns) organised by category and subcategory, each entry rich in context, register, intensity, examples, contrasts and common mistakes.
- A Dialogue & Narration lab and a Sentence Construction lab, each with explanations, original examples and exercises.
- A Writing Studio (six modes) where mistakes are *explained*, not silently replaced.
- A Novel Sentence Lab that analyses short user-pasted excerpts.
- A personal notebook with spaced repetition.
- An AI writing tutor (Claude API) that coaches, tracks recurring weaknesses and drives exercises.
- Search that understands intent ("ways to express disappointment without saying disappointed").
- Dashboard, practice history and progress tracking.
- Content that can be added without touching application code.

**Non-goals**
- No accounts, multi-user support or auth in v1 (single local user).
- No native mobile app (responsive web only).
- No full-dictionary coverage; no claim to cover "all of English".
- No speech/pronunciation features.
- No copying of novels or any database built from copyrighted text.

**Anti-goals** (failure even if it technically works)
- It turns into a word list or flashcard app.
- The AI becomes a rewriting crutch: the user pastes text and receives a polished version.
- Vocabulary is hardcoded in front-end components.
- Examples are thin, generic or interchangeable ("She was very sad.").

## 3. Constraints

- Runs locally on Windows 11 with Node 26. One command to start.
- Anthropic API key supplied by the user, stored in `.env.local`, used **server-side only**, never sent to the browser.
- The app must work and stay useful with no key set (library, labs with static exercises, notebook, SRS); AI features show a clear "add a key" state.
- Copyright: analysis uses short user-pasted excerpts only (length-capped); all teaching examples are original.
- Content volume is honest: a high-quality starter set first, growing over time.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | One full-stack TypeScript app: Next.js (App Router) + SQLite | One project, one command, key stays server-side. App and server coupled, fine for a personal tool. |
| B | Separate React front end + Node API (Fastify) + SQLite | Cleaner split, useful for a future mobile/public API; two projects to keep in sync, more setup. |
| C | Browser-only app with IndexedDB | Simplest hosting; needs a proxy to hide the API key; weak search. Rejected. |

The user chose **A** after seeing these.

## 5. Architecture

```
wordcraft/
  content/                     # source of truth for learning content (files, not code)
    categories.yaml
    expressions/<category>/<slug>.yaml
    contrasts/<slug>.yaml
    lessons/dialogue|sentence/<slug>.md
    patterns/<slug>.yaml
    exercises/<slug>.yaml
    prompts/<slug>.yaml        # writing situations
  src/
    app/                       # Next.js routes (pages + route handlers)
    lib/db/                    # schema, migrations, queries
    lib/content/               # Zod schemas, validate + seed (idempotent upsert by slug)
    lib/search/                # query parsing, FTS + tag/synonym expansion, ranking
    lib/srs/                   # SM-2 scheduling
    lib/ai/                    # Claude client, prompts, structured-output schemas, cost log
    lib/writing/               # session/revision/feedback logic, weakness tracking
    components/
  scripts/
    content-validate, content-seed, content-draft (Claude drafts entries as status=draft)
  data/wordcraft.sqlite        # gitignored; user data lives here
```

Key principles:
- **Content is data.** Authors add a YAML/Markdown file; `content:validate` checks it against a Zod schema; `content:seed` upserts it into SQLite by slug (re-runnable, never touches user data tables).
- **Content tables and user tables are separate.** Reseeding must never delete notebook entries, history or progress.
- **AI behind one module** (`lib/ai`): server-only, structured (JSON-schema) outputs, per-feature prompts, a usage log, a configurable model (default `claude-sonnet-5-5`; a cheaper model for search parsing), a configurable monthly spend cap, caching for repeatable calls.
- Single local profile; no login screen.

### Pages

Dashboard `/`, Category explorer `/explore` and `/explore/[category]`, Expression page `/e/[slug]`, Search `/search`, Dialogue lab `/labs/dialogue`, Sentence lab `/labs/sentences`, Writing studio `/studio`, AI tutor `/tutor`, Novel lab `/novel`, Notebook `/notebook` and `/notebook/review`, History `/history`, Progress `/progress`, Settings (API key status, model, spend cap).

## 6. Database design (SQLite)

Naming and exact columns are the builder's to finalise; this fixes the shape.

**Content (seeded from files)**
- `categories` (id, slug, name, parent_id, description, sort): a tree; top level covers the 26 areas the user listed, each with subcategories.
- `expressions` (id, slug, text, kind: word|phrase|idiom|collocation|pattern, pos, simple_meaning, contextual_meaning, usage_notes, intensity 1–5 nullable, register: formal|neutral|informal|conversational|literary, level: beginner|intermediate|advanced|literary, status: draft|published).
- `expression_categories` (expression_id, category_id, is_primary).
- `examples` (id, expression_id, text, context_note, setting: dialogue|narration|everyday|professional|academic).
- `relations` (from_id, to_id, type: synonym|antonym|related|stronger|weaker, note).
- `contrast_groups` (id, slug, title, explanation) and `contrast_group_members` (group_id, expression_id, distinguishing_note, example): e.g. whispered / murmured / muttered / mumbled.
- `mistakes` (id, expression_id, wrong, right, explanation).
- `tags` (id, slug, kind: emotion|situation|technique) + `expression_tags`; `search_phrases` (expression_id, phrase) for intent wording such as "let down".
- `expressions_fts` (FTS5 virtual table over text, meanings, usage notes, examples, search phrases, tag names).
- `lessons` (id, slug, lab: dialogue|sentence, title, summary, body_md, level, sort).
- `patterns` (id, slug, name, formula, explanation, lesson_id) + `pattern_examples`.
- `exercises` (id, slug, type: rewrite|fill_blank|choose|reorder|identify|free_write, prompt, payload JSON, answer JSON, explanation, level, linked_kind, linked_id). The user's own answers go in `exercise_attempts`, never here.
- `writing_prompts` (id, slug, mode, situation, constraints, target tags/expressions).

**Learner data (never touched by seeding)**
- `notebook_entries` (id, expression_id nullable, custom_text, my_meaning, my_notes, created_at), `notebook_collections` (user categories), `notebook_entry_collections`, `notebook_examples` (the user's own sentences).
- `srs_cards` (entry_id, ease, interval_days, due_at, reps, lapses, last_reviewed_at) and `review_logs`.
- `writing_sessions` (id, mode, prompt_id nullable, created_at), `writing_revisions` (session_id, version, text, source: always `user` for submitted text), `feedback_items` (revision_id, category: grammar|spelling|vocabulary|naturalness|structure|tone|punctuation, quoted_span, explanation, hint_level_shown, resolved).
- `weakness_stats` (category, key, count, last_seen): drives targeted exercises.
- `exercise_attempts` (exercise_id, answer, correct, created_at).
- `novel_analyses` (id, excerpt, source_title nullable, result JSON, created_at).
- `activity_log` (date, minutes/items, type) and `expression_mastery` (expression_id, state: seen|learning|used_in_writing|mastered).
- `ai_usage` (feature, model, input/output tokens, estimated cost, created_at).

## 7. Search and discovery

1. **Lexical:** FTS5 with BM25 over the fields above, including inflections.
2. **Structured expansion:** tags (emotion/situation/technique), search phrases and the synonym/antonym graph widen matches, so "disappointed" also finds "let down", "deflated", "crestfallen".
3. **Intent parsing:** "…without saying X" excludes X and its forms; "stronger than X" / "opposite of X" use the relation types. Rule-based parser by default; when a key is set, Claude may translate a natural-language query into the same structured filters (cached; the rule-based result is the fallback).
4. Result cards show register, level and intensity, and group near-synonyms together so the user sees the *difference* rather than a flat list.

## 8. Teaching content standards

Each expression entry follows the user's ten points: the word/expression, simple meaning, meaning in context, when and why to use it, intensity, register, several natural examples, synonyms/related, differences from similar expressions (via contrast groups), and common mistakes. A level (beginner → literary) is attached to every entry.

Dialogue & Narration lab covers: tags, action beats, expression beats, tag-free dialogue, hesitation/sarcasm/confidence/uncertainty/frustration, internal thought, avoiding repeated tags, and the punctuation and grammar rules (tag vs beat, comma vs full stop, capitalisation) with many original examples and exercises.

Sentence lab covers the twelve patterns the user listed (actions+dialogue, emotion through physical reaction, environment, movement, cause/effect, contrast, suspense, thoughts/realisation, subordinate clauses, participial phrases, rhythm/length, flow), each with explanation, examples and practice.

**Volume target (my call):** first pass of at least 4 entries in every one of the 26 top-level areas, plus at least 12 contrast groups and a lesson per lab topic, then expanded in the content phase. Quality over count. `content:draft` helps produce more drafts; nothing becomes `published` without the user reviewing it.

## 9. Writing studio and AI tutor

Modes: sentence improvement, vocabulary replacement, situation-based writing, paragraph writing, creative writing, professional writing (email, academic, article, report).

Tutor rules (enforced in prompts and in the UI flow):
- **Explain, don't replace.** Feedback is a list of issues, each with the quoted span, a category, an explanation of *why*, and graded hints: (1) where and what kind, (2) the rule or reason, (3) two or three candidate directions, never a full rewrite.
- **The user rewrites.** After feedback the user revises; the new version is checked and progress shown. A "model version" is available only after at least one attempt, labelled as one possible version.
- Weak vocabulary is flagged with alternatives and a note on how they differ in this context, linked to expression pages where they exist.
- Recurring issue categories update `weakness_stats`; the tutor then proposes exercises (from the exercise library first, generated ones second).
- Spelling issues (as seen in the user's notes) get their own category so that they are visible over time.
- Progress over time: issues per 100 words, repeat-error trend, expressions actually used in writing.

**Novel Sentence Lab:** the user pastes a short excerpt (length-capped). Claude returns structured analysis: vocabulary and expressions, structure, grammar, dialogue tags vs action beats, descriptive technique, emotional expression, why it sounds natural, and an **original** example applying the same technique in a different situation, plus a "try it yourself" prompt. Excerpts are stored only in the user's local database.

## 10. Development phases

Each phase ends with working, tested software before the next begins.

1. **Foundation:** project scaffold, schema + migrations, content schemas, validate/seed scripts, settings page, base layout and design system.
2. **Expression library:** category explorer, expression pages, contrast groups, search (lexical + expansion + intent parsing), starter content.
3. **Dialogue & Narration lab:** lessons, examples, exercises.
4. **Sentence lab:** patterns, lessons, exercises.
5. **Notebook + spaced repetition:** save from anywhere, collections, own examples, SM-2 review, import of the user's existing vocabulary notes.
6. **Writing studio + AI tutor:** the six modes, graded feedback, revision loop, weakness tracking, targeted exercises.
7. **Novel Sentence Lab.**
8. **Dashboard, history, progress.**
9. **Content expansion:** more categories and entries, review workflow for drafts.

## 11. Testing

- Vitest for logic: SRS scheduling, search parsing and ranking, content validation, weakness tracking.
- Playwright for the main user flows in each phase (browse, search, save to notebook, review, submit writing).
- AI calls go through one module with a mock mode for tests; the real model gets a manual smoke test per AI feature.
- Seeding is tested for idempotency and for not touching learner tables.

## 12. UI direction

Clean, calm, reading-first interface; responsive from phone to desktop. The visual style is chosen at the start of Phase 1 using the user's design skills (frontend-design, ui-ux-pro-max, emil-design-eng), with a typographic emphasis suited to a writing tool, and the user can react to it before it spreads across the app.

## 13. Calls made by the author (not yet confirmed by the user)

- Project lives in `C:\Users\yaxye\Desktop\english\wordcraft`, local use only (run on the user's PC; opening it from a phone on the same Wi-Fi is possible but not a goal).
- All explanations are written in simple English, with English only for v1.
- Default model `claude-sonnet-5-5`, with a modest default monthly spend cap the user can change in Settings.
- Starter content is written by Claude in this build; the user reviews and can edit any entry file.
- The user's existing Obsidian vocabulary notes (callout format with a word and a meaning) are imported into the notebook as a one-time, re-runnable import; spelling is flagged, not silently corrected.
- The project is not yet a git repository; one is initialised at scaffolding time.

## 14. Left to the builder

ORM and SQLite driver (must support FTS5 and run on Node 26), exact column names and indexes, folder naming, component library, styling approach, pagination, the SM-2 parameters, test fixtures, the exact wording of tutor prompts, and how the draft-review workflow looks.
