import path from 'node:path';
import { loadContent } from '../src/lib/content/load';
import { contentDir } from '../src/lib/content/dir';

const dir = process.argv[2] ? path.resolve(process.argv[2]) : contentDir();
const { bundle, errors } = loadContent(dir);

if (errors.length > 0) {
  for (const e of errors) console.error(`${e.file}: ${e.message}`);
  console.error(`\n${errors.length} content error(s).`);
  process.exit(1);
}

console.log(
  `Content OK: ${bundle.expressions.length} expressions, ${bundle.contrasts.length} contrast groups, ${bundle.lessons.length} lessons, ${bundle.exercises.length} exercises.`,
);
