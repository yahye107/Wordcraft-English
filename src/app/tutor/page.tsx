import Link from "next/link";
import { getDb } from "@/lib/db";
import { getProgress, getWeaknesses } from "@/lib/writing/stats";
import { practiceFor } from "@/lib/writing/practice";
import { listSessions } from "@/lib/writing/sessions";
import { MODE_LABEL, type Category } from "@/lib/writing/limits";
import { aiConfigured } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutor" };

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 240;
  const h = 48;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - (v / max) * (h - 8)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="Problems per 100 words over your recent writing" className="spark">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function TutorPage() {
  const db = getDb();
  const weaknesses = getWeaknesses(db);
  const progress = getProgress(db);
  const recent = listSessions(db, { limit: 5 });
  const ai = aiConfigured();

  return (
    <div className="reading">
      <h1>Tutor</h1>
      <p className="lede">
        Your tutor notices what you keep getting wrong, points you to practice, and shows whether your writing is improving.
      </p>

      <section className="panel stack" aria-labelledby="how-h">
        <h2 id="how-h">How it works</h2>
        <p>
          When you check your writing in the <Link href="/studio">studio</Link>, local tools look for overused words, repeated words and
          sentence patterns.{" "}
          {ai
            ? "When you ask for tutor feedback, your writing is sent to Claude, and nothing else is."
            : "Tutor feedback from Claude is off because no API key is set; local checks work without one."}{" "}
          The tutor never rewrites your text for you. It explains, and you fix it.
        </p>
      </section>

      <section className="lesson-section" aria-labelledby="weak-h">
        <h2 id="weak-h">What to practise</h2>
        {weaknesses.length === 0 ? (
          <p className="muted">
            Nothing repeats yet. After a few pieces of writing, the problems you meet three or more times will appear here, with practice for each.
          </p>
        ) : (
          <ul className="entry-list">
            {weaknesses.map((w) => {
              const p = practiceFor(w.category as Category, w.key);
              return (
                <li key={`${w.category}:${w.key}`} className="panel stack">
                  <p>
                    <strong>{w.label}</strong> <span className="badge">seen {w.count} times</span>
                  </p>
                  <p className="muted">{p.label}</p>
                  <ul className="chips">
                    {p.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="chip">
                          {l.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="lesson-section" aria-labelledby="prog-h">
        <h2 id="prog-h">Your progress</h2>
        {progress.length === 0 ? (
          <p className="muted">Write and check something to see how many things to look at there are per 100 words. Fewer is better.</p>
        ) : (
          <>
            <Sparkline values={progress.map((p) => p.issuesPer100Words)} />
            <table className="table">
              <caption className="visually-hidden">Things to look at per 100 words, by piece of writing</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Writing</th>
                  <th scope="col">Words</th>
                  <th scope="col">Per 100 words</th>
                </tr>
              </thead>
              <tbody>
                {progress
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.sessionId}>
                      <td>{new Date(p.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                      <td>
                        <Link href={`/studio/session/${p.sessionId}`}>{p.title}</Link>
                      </td>
                      <td>{p.words}</td>
                      <td>{p.issuesPer100Words}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="lesson-section" aria-labelledby="recent-h">
        <h2 id="recent-h">Recent writing</h2>
        {recent.length === 0 ? (
          <p className="muted">
            No writing yet. <Link href="/studio">Open the studio</Link>.
          </p>
        ) : (
          <ul className="entry-list">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/studio/session/${s.id}`} className="entry-row">
                  <span className="xcard-text">{s.title}</span>
                  <span className="xcard-meaning">
                    {MODE_LABEL[s.mode]} · {s.revisionCount} {s.revisionCount === 1 ? "version" : "versions"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link href="/history">See all your writing</Link>
        </p>
      </section>

      <section className="lesson-section">
        <h2>Coming later</h2>
        <p className="muted">Practice exercises made by the tutor from your own mistakes.</p>
      </section>
    </div>
  );
}
