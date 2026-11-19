export type Migration = { version: number; name: string; sql: string };

/**
 * Migrations live in code (not .sql files) so they bundle cleanly with Next.js.
 * Append new migrations; never edit one that has shipped.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'content',
    sql: `
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE expressions (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  kind TEXT NOT NULL,
  pos TEXT,
  simple_meaning TEXT NOT NULL,
  contextual_meaning TEXT NOT NULL,
  usage_notes TEXT NOT NULL,
  intensity INTEGER,
  register TEXT NOT NULL,
  level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
);
CREATE INDEX idx_expressions_level ON expressions(level);
CREATE INDEX idx_expressions_status ON expressions(status);

CREATE TABLE expression_categories (
  expression_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (expression_id, category_id)
);
CREATE INDEX idx_expcat_category ON expression_categories(category_id);

CREATE TABLE examples (
  id INTEGER PRIMARY KEY,
  expression_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  setting TEXT NOT NULL,
  context_note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_examples_expression ON examples(expression_id);

CREATE TABLE relations (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  note TEXT
);
CREATE INDEX idx_relations_from ON relations(from_id);
CREATE INDEX idx_relations_to ON relations(to_id);

CREATE TABLE contrast_groups (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL
);

CREATE TABLE contrast_group_members (
  group_id INTEGER NOT NULL REFERENCES contrast_groups(id) ON DELETE CASCADE,
  expression_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  example TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, expression_id)
);
CREATE INDEX idx_cgm_expression ON contrast_group_members(expression_id);

CREATE TABLE mistakes (
  id INTEGER PRIMARY KEY,
  expression_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  wrong TEXT NOT NULL,
  right TEXT NOT NULL,
  explanation TEXT NOT NULL
);
CREATE INDEX idx_mistakes_expression ON mistakes(expression_id);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE expression_tags (
  expression_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (expression_id, tag_id)
);
CREATE INDEX idx_exptags_tag ON expression_tags(tag_id);

CREATE TABLE search_phrases (
  id INTEGER PRIMARY KEY,
  expression_id INTEGER NOT NULL REFERENCES expressions(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL
);
CREATE INDEX idx_phrases_expression ON search_phrases(expression_id);

-- rowid = expressions.id; populated by the seeder, not by triggers.
CREATE VIRTUAL TABLE expressions_fts USING fts5(
  slug UNINDEXED,
  text,
  meanings,
  usage,
  examples,
  phrases,
  tags,
  tokenize = 'porter unicode61 remove_diacritics 2'
);
`,
  },
  {
    version: 2,
    name: 'settings_ai',
    sql: `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  est_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE ai_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`,
  },
  {
    version: 3,
    name: 'lessons_exercises',
    sql: `
CREATE TABLE lessons (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  lab TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  level TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  body_json TEXT NOT NULL
);
CREATE INDEX idx_lessons_lab ON lessons(lab, sort);

CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  level TEXT NOT NULL,
  prompt TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  explanation TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_exercises_lesson ON exercises(lesson_id, sort);

-- Learner data. No foreign key on purpose: changing or deleting an exercise must never delete history.
CREATE TABLE exercise_attempts (
  id INTEGER PRIMARY KEY,
  exercise_slug TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  correct INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_attempts_exercise ON exercise_attempts(exercise_slug);
`,
  },
  {
    version: 4,
    name: 'notebook',
    sql: `
-- Learner data. No foreign keys to content tables: the expression slug is kept as plain text.
CREATE TABLE notebook_entries (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  expression_slug TEXT,
  text TEXT NOT NULL,
  my_meaning TEXT NOT NULL DEFAULT '',
  my_notes TEXT NOT NULL DEFAULT '',
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX uq_entries_slug ON notebook_entries(expression_slug) WHERE expression_slug IS NOT NULL;
CREATE UNIQUE INDEX uq_entries_text ON notebook_entries(lower(trim(text))) WHERE kind IN ('custom','import');

CREATE TABLE notebook_examples (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES notebook_entries(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_nbex_entry ON notebook_examples(entry_id);

CREATE TABLE collections (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX uq_collections_name ON collections(lower(name));

CREATE TABLE entry_collections (
  entry_id INTEGER NOT NULL REFERENCES notebook_entries(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, collection_id)
);

CREATE TABLE srs_cards (
  entry_id INTEGER PRIMARY KEY REFERENCES notebook_entries(id) ON DELETE CASCADE,
  ease REAL NOT NULL,
  interval_days INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  last_reviewed_at TEXT
);
CREATE INDEX idx_srs_due ON srs_cards(due_at);

CREATE TABLE review_logs (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES notebook_entries(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  prev_interval INTEGER NOT NULL,
  new_interval INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_logs_entry ON review_logs(entry_id);
`,
  },
  {
    version: 5,
    name: 'writing_prompts',
    sql: `
CREATE TABLE writing_prompts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  situation TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  try_json TEXT NOT NULL,
  level TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_prompts_mode ON writing_prompts(mode, sort);
`,
  },
  {
    version: 6,
    name: 'writing_sessions',
    sql: `
-- Learner data. The prompt slug is kept as text with no foreign key.
CREATE TABLE writing_sessions (
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL,
  prompt_slug TEXT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE writing_revisions (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES writing_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  ai_used INTEGER NOT NULL DEFAULT 0,
  ai_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (session_id, version)
);
CREATE INDEX idx_revisions_session ON writing_revisions(session_id);

CREATE TABLE feedback_items (
  id INTEGER PRIMARY KEY,
  revision_id INTEGER NOT NULL REFERENCES writing_revisions(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  quote TEXT NOT NULL,
  why TEXT NOT NULL,
  hint1 TEXT NOT NULL,
  hint2 TEXT NOT NULL,
  hint3 TEXT NOT NULL,
  alternatives_json TEXT NOT NULL DEFAULT '[]',
  hint_level_shown INTEGER NOT NULL DEFAULT 1,
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_feedback_revision ON feedback_items(revision_id);

CREATE TABLE weakness_stats (
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (category, key)
);

CREATE TABLE model_versions (
  id INTEGER PRIMARY KEY,
  revision_id INTEGER NOT NULL UNIQUE REFERENCES writing_revisions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`,
  },
];
