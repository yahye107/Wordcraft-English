import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '@/lib/db';
import { indexContentFiles } from './files';
import { loadContent } from './load';
import { saveVerdict } from './review';
import { seedContent } from './seed';

export type StatusResult =
  | { ok: true; status: 'draft' | 'published' }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

type Deps = { seed?: typeof seedContent };

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const STATUS_LINE = /^status:[ \t]*['"]?(draft|published)['"]?[ \t]*(?:#.*)?$/m;
const LEVEL_LINE = /^level:.*$/m;

// One change at a time: each call waits for the one before it.
let chain: Promise<unknown> = Promise.resolve();

/** Words a learner can act on, for the errors a publish can hit. */
function friendly(file: string, message: string): string {
  const m = /at least 3 examples \(found (\d+)\)/.exec(message);
  if (m) return `This entry needs at least 3 examples before it can be published (it has ${m[1]}).`;
  return `${file}: ${message}`;
}

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/** Replace the `status:` line, or add one after `level:` when moving a status-less file to draft. Null if it cannot. */
function withStatus(text: string, status: 'draft' | 'published'): string | null {
  if (text.trimStart().startsWith('{')) return null; // JSON: not edited by guessing
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  if (STATUS_LINE.test(text)) return text.replace(STATUS_LINE, `status: ${status}`);
  if (status === 'published') return text; // no line already means published
  if (LEVEL_LINE.test(text)) return text.replace(LEVEL_LINE, (line) => `${line.replace(/\r$/, '')}${eol}status: draft`);
  return text.endsWith('\n') ? `${text}status: draft${eol}` : `${text}${eol}status: draft${eol}`;
}

async function change(db: Db, dir: string, slugIn: unknown, statusIn: unknown, deps: Deps): Promise<StatusResult> {
  if (typeof slugIn !== 'string' || !SLUG.test(slugIn)) return { ok: false, status: 400, error: 'That is not a valid entry name.' };
  if (statusIn !== 'draft' && statusIn !== 'published') return { ok: false, status: 400, error: 'The status must be draft or published.' };
  const status: 'draft' | 'published' = statusIn;

  const item = indexContentFiles(dir).items.find((i) => i.kind === 'expression' && i.slug === slugIn);
  if (!item) return { ok: false, status: 404, error: 'That entry does not exist.' };
  if (item.status === status) return { ok: true, status };

  const before = loadContent(dir).errors;
  if (before.length > 0) {
    const first = before.slice(0, 2).map((e) => friendly(e.file, e.message)).join(' ');
    return { ok: false, status: 409, error: `Fix these content errors first: ${first}` };
  }

  const file = path.join(dir, item.file);
  const original = fs.readFileSync(file, 'utf8');
  const next = withStatus(original, status);
  if (next === null) return { ok: false, status: 409, error: 'This file is written as JSON. Change its status by hand.' };

  writeAtomic(file, next);

  const seed = deps.seed ?? seedContent;
  const restore = () => {
    writeAtomic(file, original);
    try {
      const again = loadContent(dir);
      if (again.errors.length === 0) seed(db, again.bundle);
    } catch {
      // The file is back as it was; the next successful change or reseed brings the database level again.
    }
  };

  const { bundle, errors } = loadContent(dir);
  if (errors.length > 0) {
    writeAtomic(file, original);
    return { ok: false, status: 409, error: friendly(errors[0].file, errors[0].message) };
  }
  try {
    seed(db, bundle);
  } catch (e) {
    restore();
    return { ok: false, status: 500, error: `The library could not be updated (${(e as Error).message}). Nothing was changed.` };
  }

  if (status === 'published') {
    const now = indexContentFiles(dir).items.find((i) => i.kind === 'expression' && i.slug === slugIn);
    if (now) {
      const prior = db.get<{ note: string }>("SELECT note FROM content_reviews WHERE kind = 'expression' AND slug = ?", [slugIn]);
      saveVerdict(db, now, 'approved', prior?.note ?? '');
    }
  }
  return { ok: true, status };
}

/**
 * Publish a draft expression or move it back to draft by changing one line of its file. The library is checked
 * before and after; if anything is wrong the file is put back exactly as it was. Calls run one at a time.
 */
export function setExpressionStatus(db: Db, dir: string, slug: unknown, status: unknown, deps: Deps = {}): Promise<StatusResult> {
  const run = chain.then(() => change(db, dir, slug, status, deps));
  chain = run.catch(() => undefined);
  return run;
}
