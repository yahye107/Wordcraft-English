import Link from "next/link";
import { getDb } from "@/lib/db";
import { listEntries } from "@/lib/notebook/entries";
import { listCollections } from "@/lib/notebook/collections";
import { countDue } from "@/lib/notebook/review";
import AddWordForm from "@/components/notebook/AddWordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notebook" };

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function NotebookPage(props: PageProps<"/notebook">) {
  const sp = await props.searchParams;
  const db = getDb();
  const q = first(sp.q).slice(0, 100);
  const colParam = Number(first(sp.collection));
  const collectionId = Number.isInteger(colParam) && colParam > 0 ? colParam : undefined;

  const collections = listCollections(db);
  const entries = listEntries(db, { q, collectionId });
  const total = listEntries(db, { limit: 1 }).length;
  const due = countDue(db);
  const dueIds = new Set(
    db.all<{ entry_id: number }>("SELECT entry_id FROM srs_cards WHERE due_at <= ?", [new Date().toISOString()]).map((r) => r.entry_id),
  );

  return (
    <>
      <h1>Notebook</h1>
      <p className="lede">Words and expressions you want to make your own. Review them a little each day.</p>

      <div className="row notebook-actions">
        {due > 0 ? (
          <Link href="/notebook/review" className="btn" data-testid="review-link">
            Review {due} due
          </Link>
        ) : (
          <span className="badge">Nothing due today</span>
        )}
        <Link href="/notebook/import" className="btn secondary">Import notes</Link>
      </div>

      {total === 0 && !q && !collectionId ? (
        <div className="panel stack">
          <h2>Your notebook is empty</h2>
          <p>Save expressions from the library, add your own words below, or import your reading notes.</p>
          <div className="row">
            <Link href="/explore" className="btn secondary">Browse expressions</Link>
            <Link href="/notebook/import" className="btn secondary">Import notes</Link>
          </div>
        </div>
      ) : (
        <>
          <form action="/notebook" method="get" role="search" className="searchform">
            <label htmlFor="nq" className="visually-hidden">Search your notebook</label>
            <input id="nq" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Search your words" autoComplete="off" />
            {collectionId && <input type="hidden" name="collection" value={collectionId} />}
            <button type="submit" className="btn">Search</button>
          </form>

          {collections.length > 0 && (
            <ul className="chips" aria-label="Collections">
              <li>
                <Link href="/notebook" className="chip" aria-current={!collectionId ? "true" : undefined}>All words</Link>
              </li>
              {collections.map((c) => (
                <li key={c.id}>
                  <Link href={`/notebook?collection=${c.id}`} className="chip" aria-current={collectionId === c.id ? "true" : undefined}>
                    {c.name} ({c.count})
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {entries.length === 0 ? (
            <p className="muted">No words match. <Link href="/notebook">Show everything</Link></p>
          ) : (
            <ul className="entry-list">
              {entries.map((e) => (
                <li key={e.id}>
                  <Link href={`/notebook/${e.id}`} className="entry-row">
                    <span className="xcard-text">{e.text}</span>
                    <span className="xcard-meaning">
                      {e.myMeaning || e.library?.simpleMeaning || "No meaning yet. Open it to add your own."}
                    </span>
                    <span className="badges">
                      {dueIds.has(e.id) && <span className="badge">Due</span>}
                      {e.kind === "import" && <span className="badge">Imported</span>}
                      {e.collections.map((c) => (
                        <span key={c.id} className="badge">{c.name}</span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <AddWordForm />
    </>
  );
}
