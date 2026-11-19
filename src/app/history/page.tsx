import Link from "next/link";
import { getDb } from "@/lib/db";
import { listSessions } from "@/lib/writing/sessions";
import { MODES, MODE_LABEL, isMode } from "@/lib/writing/limits";
import DeleteSessionButton from "@/components/studio/DeleteSessionButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Writing history" };

export default async function HistoryPage(props: PageProps<"/history">) {
  const sp = await props.searchParams;
  const modeParam = Array.isArray(sp.mode) ? sp.mode[0] : sp.mode;
  const mode = isMode(modeParam) ? modeParam : undefined;
  const sessions = listSessions(getDb(), { mode });

  return (
    <div className="reading">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/studio">Writing studio</Link>
      </nav>
      <h1>Your writing</h1>

      <ul className="chips" aria-label="Filter by mode">
        <li>
          <Link href="/history" className="chip" aria-current={!mode ? "true" : undefined}>All</Link>
        </li>
        {MODES.map((m) => (
          <li key={m}>
            <Link href={`/history?mode=${m}`} className="chip" aria-current={mode === m ? "true" : undefined}>
              {MODE_LABEL[m]}
            </Link>
          </li>
        ))}
      </ul>

      {sessions.length === 0 ? (
        <p className="muted">
          Nothing here yet. <Link href="/studio">Start writing</Link>.
        </p>
      ) : (
        <ul className="entry-list">
          {sessions.map((s) => (
            <li key={s.id} className="panel stack">
              <Link href={`/studio/session/${s.id}`} className="history-link">
                <span className="xcard-text">{s.title}</span>
                <span className="xcard-meaning">
                  {MODE_LABEL[s.mode]} · {new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} ·{" "}
                  {s.revisionCount} {s.revisionCount === 1 ? "version" : "versions"} · {s.latestWordCount} words
                </span>
              </Link>
              <div className="row">
                <DeleteSessionButton id={s.id} title={s.title} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
