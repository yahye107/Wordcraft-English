import type { Db } from '@/lib/db';
import { loadContent } from './load';
import { seedContent } from './seed';

/**
 * First-run convenience: if the database has no expressions yet, load the content folder into it.
 * Never touches a database that already has content, and never throws.
 */
export function ensureSeeded(db: Db, contentDir: string): 'seeded' | 'already' | 'invalid' {
  const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM expressions')?.n ?? 0;
  if (count > 0) return 'already';
  try {
    const { bundle, errors } = loadContent(contentDir);
    if (errors.length > 0) {
      console.warn(`Wordcraft: content has ${errors.length} error(s); run "npm run content:validate". Nothing was loaded.`);
      return 'invalid';
    }
    seedContent(db, bundle);
    return 'seeded';
  } catch (e) {
    console.warn(`Wordcraft: could not load content: ${(e as Error).message}`);
    return 'invalid';
  }
}
