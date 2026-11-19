import Link from "next/link";
import { getDb } from "@/lib/db";
import { listSessions } from "@/lib/writing/sessions";
import { MODES, MODE_BLURB, MODE_LABEL } from "@/lib/writing/limits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Writing studio" };

export default function StudioPage() {
  const recent = listSessions(getDb(), { limit: 5 });

  return (
    <>
      <h1>Writing studio</h1>
      <p className="lede">Write something, get feedback that explains what to look at, then improve it yourself.</p>

      <div className="tiles">
        {MODES.map((m) => (
          <Link key={m} href={`/studio/${m}`} className="tile">
            <h3>{MODE_LABEL[m]}</h3>
            <p>{MODE_BLURB[m]}</p>
          </Link>
        ))}
      </div>

      <section className="lesson-section" aria-labelledby="recent-h">
        <h2 id="recent-h">Your recent writing</h2>
        {recent.length === 0 ? (
          <p className="muted">Nothing yet. Choose a mode above to start.</p>
        ) : (
          <ul className="entry-list">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/studio/session/${s.id}`} className="entry-row">
                  <span className="xcard-text">{s.title}</span>
                  <span className="xcard-meaning">
                    {MODE_LABEL[s.mode]} · {s.revisionCount} {s.revisionCount === 1 ? "version" : "versions"} · {s.latestWordCount} words
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p><Link href="/history">See all your writing</Link></p>
      </section>
    </>
  );
}
