import Link from "next/link";
import { getDb } from "@/lib/db";
import { getActivity } from "@/lib/progress/activity";
import { getStudyStats } from "@/lib/progress/study";
import { getExpressionUse, getWritingTrends } from "@/lib/progress/writing";
import { dayKey, shiftDay } from "@/lib/progress/days";
import { dayLabel, shortDate } from "@/lib/progress/format";
import { MODE_LABEL, isMode } from "@/lib/writing/limits";
import ActivityGrid from "@/components/charts/ActivityGrid";
import LineChart from "@/components/charts/LineChart";
import MeterBar from "@/components/charts/MeterBar";
import MiniBars from "@/components/charts/MiniBars";
import StatTile from "@/components/progress/StatTile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const percent = (r: number | null) => (r === null ? null : `${Math.round(r * 100)}%`);

function change(recent: number, earlier: number): string {
  if (recent > earlier) return "more often";
  if (recent < earlier) return "less often";
  return "about the same";
}

export default function ProgressPage() {
  const db = getDb();
  const activity = getActivity(db);
  const study = getStudyStats(db);
  const writing = getWritingTrends(db);
  const use = getExpressionUse(db);
  const today = dayKey(new Date());

  const lifetimeTotal = Object.values(activity.lifetime).reduce((a, b) => a + b, 0);
  const dayLabels = Array.from({ length: 7 }, (_, i) => dayLabel(shiftDay(today, i)).split(" ")[0]);
  const dueLabels = dayLabels.map((l, i) => (i === 0 ? "Today" : l));

  return (
    <div className="reading progress-page">
      <h1>Progress</h1>
      <p className="lede">What you have done, and whether your writing is changing. Everything here is worked out on this computer from your own practice.</p>

      <section aria-labelledby="p-activity" className="stack" data-testid="section-activity">
        <h2 id="p-activity">Activity</h2>
        <p className="muted">Each square is a day. Darker means more things done: lessons, reviews, writing, passages and saved words.</p>
        {lifetimeTotal === 0 ? (
          <p>
            Nothing yet. <Link href="/labs">Start a lesson</Link> or <Link href="/studio/sentence">write a sentence</Link> and your first square appears here.
          </p>
        ) : (
          <>
            <ActivityGrid days={activity.days} />
            <div className="stats">
              <StatTile label="Current run" value={plural(activity.currentStreak, "day", "days")} />
              <StatTile label="Longest run" value={plural(activity.longestStreak, "day", "days")} />
              <StatTile label="Active days, last 7" value={activity.activeDays7} />
              <StatTile label="Active days, last 30" value={activity.activeDays30} />
            </div>
            <p className="muted">
              All time: {plural(activity.lifetime.lesson, "exercise answer", "exercise answers")}, {plural(activity.lifetime.review, "review", "reviews")},{" "}
              {plural(activity.lifetime.writing, "piece version", "piece versions")}, {plural(activity.lifetime.passage, "passage", "passages")} and{" "}
              {plural(activity.lifetime.notebook, "saved word", "saved words")}.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="p-writing" className="stack" data-testid="section-writing">
        <h2 id="p-writing">Writing</h2>
        <p className="muted">
          Problems per 100 words found by the studio checks. First drafts show your habits; the final version shows what revising fixes. A lower number is better.
        </p>
        {writing.sessions.length === 0 ? (
          <p>
            No writing yet. <Link href="/studio">Write something in the studio</Link> and check it.
          </p>
        ) : (
          <>
            <LineChart
              title="Problems per 100 words, piece by piece"
              unit="problems per 100 words"
              labels={writing.sessions.map((s) => shortDate(dayKey(s.date)))}
              series={[
                { name: "First draft", values: writing.sessions.map((s) => s.firstDraftPer100), tone: "a" },
                { name: "After revising", values: writing.sessions.map((s) => s.finalPer100), tone: "b" },
              ]}
              emptyText="No writing yet."
            />
            <p data-testid="trend">{writing.trend.note}</p>
            <div className="stats">
              <StatTile label="Pieces written" value={writing.totals.sessions} />
              <StatTile label="Words written" value={writing.totals.words} />
              <StatTile label="Words, last 30 days" value={writing.totals.wordsLast30} />
            </div>

            {writing.repeatErrors.length > 0 && (
              <div data-testid="repeat-errors">
                <h3>Problems that come back</h3>
                <p className="muted">Counted in first drafts: your latest five pieces against the five before.</p>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Problem</th>
                      <th scope="col">Latest 5</th>
                      <th scope="col">Before</th>
                      <th scope="col">Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writing.repeatErrors.map((r) => (
                      <tr key={r.key}>
                        <th scope="row">{r.label}</th>
                        <td>{r.recent}</td>
                        <td>{r.earlier}</td>
                        <td>{change(r.recent, r.earlier)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p><Link href="/tutor">Practice for these in the tutor</Link></p>
              </div>
            )}

            <details className="chart-numbers">
              <summary>Your pieces</summary>
              <ul className="plain-list">
                {[...writing.sessions].reverse().map((s) => (
                  <li key={s.sessionId}>
                    <Link href={`/studio/session/${s.sessionId}`}>{s.title}</Link> · {isMode(s.mode) ? MODE_LABEL[s.mode] : s.mode} · {shortDate(dayKey(s.date))} · {plural(s.words, "word", "words")}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </section>

      <section aria-labelledby="p-words" className="stack" data-testid="section-words">
        <h2 id="p-words">Words you use</h2>
        {use.libraryWords.length === 0 ? (
          <p className="muted">
            None of your recent writing uses a library word yet. Browse <Link href="/explore">Explore</Link>, save a word you like, then try it in a sentence.
          </p>
        ) : (
          <>
            <p>
              <strong>{use.notebookWords.length} of {use.notebookLibraryTotal}</strong> saved library words appear in your recent writing, and{" "}
              {plural(use.libraryWords.length, "library word", "library words")} in all.
            </p>
            <ul className="chips" aria-label="Library words in your writing">
              {use.libraryWords.map((w) => (
                <li key={w.slug}>
                  <Link href={`/e/${w.slug}`} className="chip">{w.text}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="p-review" className="stack" data-testid="section-review">
        <h2 id="p-review">Review</h2>
        {study.notebook.cards === 0 ? (
          <p className="muted">
            No words to review yet. <Link href="/explore">Save a word</Link> from the library and it appears here.
          </p>
        ) : (
          <>
            <div className="meters">
              <MeterBar label="New" value={study.notebook.fresh} max={study.notebook.cards} unit="cards" />
              <MeterBar label="Learning" value={study.notebook.learning} max={study.notebook.cards} unit="cards" />
              <MeterBar label="Well known (21 days or more)" value={study.notebook.mature} max={study.notebook.cards} unit="cards" />
            </div>
            <MiniBars title="Cards due over the next 7 days" values={study.notebook.dueNext7} labels={dueLabels} unit="cards" />
            <p data-testid="remembered">
              {study.reviews.rate === null
                ? "No reviews in the last 30 days."
                : `You remembered ${percent(study.reviews.rate)} of ${plural(study.reviews.last30, "card", "cards")} reviewed in the last 30 days.`}{" "}
              <Link href="/notebook/review">Review now</Link>
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="p-labs" className="stack" data-testid="section-labs">
        <h2 id="p-labs">Labs</h2>
        {study.labs.every((l) => l.lessons === 0) ? (
          <p className="muted">No lessons are loaded.</p>
        ) : (
          <>
            {study.labs.map((l) => (
              <div key={l.lab} className="stack">
                <MeterBar label={`${l.label}: lessons finished`} value={l.lessonsDone} max={l.lessons} />
                <MeterBar label={`${l.label}: exercises done`} value={l.exercisesDone} max={l.exercises} />
              </div>
            ))}
            <p>
              {study.accuracy.rate === null
                ? "No checked answers in the last 30 days."
                : `${percent(study.accuracy.rate)} of your checked answers in the last 30 days were correct (${study.accuracy.correct30} of ${study.accuracy.attempts30}).`}{" "}
              <Link href="/labs">Go to the labs</Link>
            </p>
          </>
        )}
        <p className="muted">Passages analysed in the Novel lab: {study.passages}. <Link href="/novel">Open the Novel lab</Link></p>
      </section>

      <p className="progress-links">
        <Link href="/history">See your history</Link> · <Link href="/tutor">Tutor</Link> · <Link href="/notebook">Notebook</Link>
      </p>
    </div>
  );
}
