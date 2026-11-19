import path from 'node:path';
import { loadContent } from '../src/lib/content/load';
import { contentDir } from '../src/lib/content/dir';
import { seedContent } from '../src/lib/content/seed';
import { openDb } from '../src/lib/db';
import { migrate } from '../src/lib/db/migrate';

const dir = contentDir();
const { bundle, errors } = loadContent(dir);

if (errors.length > 0) {
  for (const e of errors) console.error(`${e.file}: ${e.message}`);
  console.error(`\n${errors.length} content error(s). Nothing was seeded.`);
  process.exit(1);
}

const dbFile = process.env.WORDCRAFT_DB ?? path.join(process.cwd(), 'data', 'wordcraft.sqlite');
const db = openDb(dbFile);
migrate(db);
const result = seedContent(db, bundle);
console.log(`Seeded ${dbFile}: ${result.added} added, ${result.updated} updated, ${result.removed} removed.`);
