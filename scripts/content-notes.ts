import path from 'node:path';
import { openDb } from '../src/lib/db';
import { migrate } from '../src/lib/db/migrate';
import { contentDir } from '../src/lib/content/dir';
import { getNotes } from '../src/lib/content/review';

const dbFile = process.env.WORDCRAFT_DB ?? path.join(process.cwd(), 'data', 'wordcraft.sqlite');
const db = openDb(dbFile);
migrate(db);

const notes = getNotes(db, contentDir());
if (notes.length === 0) {
  console.log('No notes. Nothing is marked "needs work".');
} else {
  for (const n of notes) {
    console.log(`${n.kind} ${n.slug} (${n.file})${n.state === 'changed' ? ' [edited since you marked it]' : ''}: ${n.note}`);
  }
  console.log(`\n${notes.length} note(s).`);
}
