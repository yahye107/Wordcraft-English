import Link from "next/link";
import { getDb } from "@/lib/db";
import { getContrastGroup } from "@/lib/content/queries";
import { parseQuery } from "@/lib/search/parse";
import { searchExpressions, type SearchResult } from "@/lib/search/search";
import { translateQuery } from "@/lib/ai/smartSearch";
import { aiConfigured } from "@/lib/ai/client";
import ExpressionCard from "@/components/ExpressionCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const EXAMPLES = [
  "ways to express disappointment without saying disappointed",
  "words for walking slowly",
  "opposite of furious",
  "stronger than annoyed",
  "how to show someone is nervous",
];

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const q = first(sp.q).slice(0, 500);
  const smartWanted = first(sp.smart) === "1";
  const smartAvailable = aiConfigured();
  const db = getDb();

  const hasQuery = q.trim().length > 0;
  // The form was submitted with nothing (or only spaces) in it
  const submittedBlank = !hasQuery && sp.q !== undefined;
  const parsed = hasQuery ? (smartWanted && smartAvailable ? await translateQuery(db, q) : parseQuery(q)) : null;
  const results: SearchResult[] = parsed && !parsed.empty ? searchExpressions(db, parsed) : [];

  // Group near-synonyms from the same contrast group so the learner sees the difference
  const groupOrder: string[] = [];
  const byGroup = new Map<string, SearchResult[]>();
  const singles: SearchResult[] = [];
  for (const r of results) {
    if (r.contrastGroupSlug) {
      if (!byGroup.has(r.contrastGroupSlug)) {
        byGroup.set(r.contrastGroupSlug, []);
        groupOrder.push(r.contrastGroupSlug);
      }
      byGroup.get(r.contrastGroupSlug)!.push(r);
    } else {
      singles.push(r);
    }
  }
  // A "group" of one is not worth a heading
  const groups = groupOrder
    .map((slug) => ({ slug, items: byGroup.get(slug)!, detail: getContrastGroup(db, slug) }))
    .filter((g) => g.items.length > 1 && g.detail);
  const grouped = new Set(groups.flatMap((g) => g.items.map((i) => i.slug)));
  const rest = results.filter((r) => !grouped.has(r.slug));

  return (
    <>
      <h1>Search by what you mean</h1>
      <p className="lede">Describe a feeling, an action or a situation. You do not need to know the word.</p>

      <form action="/search" method="get" role="search" className="searchform">
        <label htmlFor="q" className="visually-hidden">Search expressions</label>
        <input id="q" name="q" type="search" defaultValue={q} maxLength={500} placeholder="e.g. ways to show disappointment without saying disappointed" autoComplete="off" />
        <button type="submit" className="btn">Search</button>
        {smartAvailable && (
          <label className="checkline">
            <input type="checkbox" name="smart" value="1" defaultChecked={smartWanted} />
            Smart search (uses AI to read your request)
          </label>
        )}
      </form>

      {parsed && !parsed.empty && (
        <p className="muted" data-testid="intent">
          {parsed.terms.length > 0 && <>Looking for: <strong>{parsed.terms.join(", ")}</strong>. </>}
          {parsed.relation && <>{relationLabel(parsed.relation.type)} <strong>{parsed.relation.target}</strong>. </>}
          {parsed.exclude.length > 0 && <>Leaving out: <strong>{parsed.exclude.join(", ")}</strong>.</>}
        </p>
      )}

      {!hasQuery && !submittedBlank && <Suggestions />}

      {(submittedBlank || (hasQuery && parsed?.empty)) && (
        <div className="panel" role="status">
          <p><strong>Try describing a feeling or a situation.</strong></p>
          <p className="muted">For example, “nervous before a speech” or “walking slowly because you are tired”.</p>
          <Suggestions />
        </div>
      )}

      {hasQuery && parsed && !parsed.empty && results.length === 0 && (
        <div className="panel" role="status">
          <p><strong>No matches for “{q}”.</strong></p>
          <p className="muted">Try fewer words, a different feeling, or browse by category.</p>
          <p><Link href="/explore">Browse all categories</Link></p>
          <Suggestions />
        </div>
      )}

      {groups.map((g) => (
        <section key={g.slug} className="resultgroup" aria-label={g.detail!.title}>
          <h2>{g.detail!.title}</h2>
          <p className="muted">
            These are close in meaning but not the same.{" "}
            <Link href={`/e/${g.items[0].slug}#cg-${g.slug}`}>See how they differ</Link>
          </p>
          <div className="cards">
            {g.items.map((r) => <ExpressionCard key={r.slug} e={r} />)}
          </div>
        </section>
      ))}

      {rest.length > 0 && (
        <section className="resultgroup" aria-label={groups.length > 0 ? "More matches" : "Matches"}>
          {groups.length > 0 && <h2>More matches</h2>}
          <div className="cards">
            {rest.map((r) => <ExpressionCard key={r.slug} e={r} />)}
          </div>
        </section>
      )}
    </>
  );
}

function relationLabel(type: string): string {
  return { antonym: "Opposites of", stronger: "Stronger than", weaker: "Weaker than", synonym: "Close to" }[type] ?? "Related to";
}

function Suggestions() {
  return (
    <div>
      <p className="muted">Try one of these:</p>
      <ul className="chips">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <Link className="chip" href={`/search?q=${encodeURIComponent(e)}`}>{e}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
