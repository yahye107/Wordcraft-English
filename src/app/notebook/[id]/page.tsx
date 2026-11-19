import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getEntry } from "@/lib/notebook/entries";
import { listCollections } from "@/lib/notebook/collections";
import EntryEditor from "@/components/notebook/EntryEditor";

export const dynamic = "force-dynamic";

function parseId(s: string): number | null {
  return /^[1-9][0-9]{0,9}$/.test(s) ? Number(s) : null;
}

export async function generateMetadata(props: PageProps<"/notebook/[id]">) {
  const id = parseId((await props.params).id);
  const e = id === null ? undefined : getEntry(getDb(), id);
  return { title: e?.text ?? "Notebook" };
}

export default async function EntryPage(props: PageProps<"/notebook/[id]">) {
  const id = parseId((await props.params).id);
  if (id === null) notFound();
  const db = getDb();
  const entry = getEntry(db, id);
  if (!entry) notFound();

  const card = db.get<{ due_at: string; reps: number }>("SELECT due_at, reps FROM srs_cards WHERE entry_id = ?", [id]);
  const dueText = card ? new Date(card.due_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <article className="entry">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/notebook">Notebook</Link>
      </nav>

      <h1>{entry.text}</h1>
      <div className="badges">
        {entry.kind === "import" && <span className="badge">Imported{entry.source ? ` from ${entry.source}` : ""}</span>}
        {dueText && <span className="badge">{card && card.reps === 0 ? "New. Due" : "Next review"}: {dueText}</span>}
      </div>

      <section className="lesson-section" aria-labelledby="lib-h">
        <h2 id="lib-h">In the library</h2>
        {entry.library ? (
          <>
            <p className="lede">{entry.library.simpleMeaning}</p>
            <p>{entry.library.contextualMeaning}</p>
            <p>
              <Link href={`/e/${entry.library.slug}`}>Open the full entry</Link>
            </p>
          </>
        ) : entry.expressionSlug ? (
          <p className="muted">This expression is no longer in the library. Your own notes are kept.</p>
        ) : (
          <p className="muted">This is your own word, not from the library.</p>
        )}
      </section>

      <EntryEditor
        entry={{ id: entry.id, myMeaning: entry.myMeaning, myNotes: entry.myNotes, examples: entry.examples, collections: entry.collections }}
        allCollections={listCollections(db)}
      />
    </article>
  );
}
