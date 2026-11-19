import type { Db } from '@/lib/db';

export type PromptView = {
  slug: string;
  mode: string;
  kind: string;
  title: string;
  situation: string;
  constraints: string[];
  try: { slug: string; text: string }[];
  level: string;
};

type Row = { slug: string; mode: string; kind: string; title: string; situation: string; constraints_json: string; try_json: string; level: string };

function view(db: Db, r: Row): PromptView {
  const slugs = JSON.parse(r.try_json) as string[];
  return {
    slug: r.slug,
    mode: r.mode,
    kind: r.kind,
    title: r.title,
    situation: r.situation,
    constraints: (JSON.parse(r.constraints_json) as string[]).map(String),
    try: slugs.flatMap((s) => {
      const e = db.get<{ slug: string; text: string }>("SELECT slug, text FROM expressions WHERE slug = ? AND status = 'published'", [s]);
      return e ? [{ slug: e.slug, text: e.text }] : [];
    }),
    level: r.level,
  };
}

const COLS = 'slug, mode, kind, title, situation, constraints_json, try_json, level';

export function listPrompts(db: Db, mode: string): PromptView[] {
  return db.all<Row>(`SELECT ${COLS} FROM writing_prompts WHERE mode = ? ORDER BY sort`, [mode]).map((r) => view(db, r));
}

export function getPrompt(db: Db, slug: string): PromptView | undefined {
  const r = db.get<Row>(`SELECT ${COLS} FROM writing_prompts WHERE slug = ?`, [slug]);
  return r && view(db, r);
}
