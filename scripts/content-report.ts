import { loadContent } from '../src/lib/content/load';
import { contentDir } from '../src/lib/content/dir';
import { coverageReport } from '../src/lib/content/report';

const { bundle, errors } = loadContent(contentDir());
if (errors.length > 0) {
  for (const e of errors) console.error(`${e.file}: ${e.message}`);
  process.exit(1);
}

const r = coverageReport(bundle);
console.log(`Expressions: ${r.total} (${r.byStatus.published} published, ${r.byStatus.draft} draft)`);
console.log(`Levels: ${Object.entries(r.byLevel).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`Contrast groups: ${bundle.contrasts.length}; expressions in no group: ${r.noGroup.length}`);
console.log(`With an opposite, stronger or weaker link: ${Math.round(r.relationCoverage * 100)}%`);
console.log(`Mistakes per entry: ${r.mistakesPer.toFixed(1)}`);
console.log('\nBy area (published + draft = total):');
for (const a of r.byArea) console.log(`  ${String(a.total).padStart(3)}  ${a.published} + ${a.draft}  ${a.slug}${a.total < 8 ? '   <- under 8' : ''}`);
