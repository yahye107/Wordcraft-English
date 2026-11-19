import { loadContent } from '../src/lib/content/load';
import { contentDir } from '../src/lib/content/dir';
import { lintBundle } from '../src/lib/content/lint';

const { bundle, errors } = loadContent(contentDir());
if (errors.length > 0) {
  for (const e of errors) console.error(`${e.file}: ${e.message}`);
  console.error(`\n${errors.length} content error(s). Fix these first (npm run content:validate).`);
  process.exit(1);
}

const issues = lintBundle(bundle);
const byRule = new Map<string, number>();
for (const i of issues) {
  console.log(`${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.kind} ${i.slug} [${i.rule}] ${i.message}`);
  byRule.set(i.rule, (byRule.get(i.rule) ?? 0) + 1);
}
const errs = issues.filter((i) => i.severity === 'error').length;
const warns = issues.length - errs;
console.log(`\n${errs} error(s), ${warns} warning(s).`);
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${rule}: ${n}`);
process.exit(errs > 0 ? 1 : 0);
