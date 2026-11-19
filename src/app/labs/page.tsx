import Link from "next/link";
import { getDb } from "@/lib/db";
import { listLessons } from "@/lib/lessons/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Labs" };

export default function LabsPage() {
  const lessons = listLessons(getDb(), "dialogue");
  const total = lessons.reduce((n, l) => n + l.exerciseCount, 0);
  const done = lessons.reduce((n, l) => n + l.doneCount, 0);

  return (
    <>
      <h1>Labs</h1>
      <p className="lede">Short lessons that show how writers build dialogue and sentences, each with practice you can check.</p>

      <div className="tiles">
        <Link href="/labs/dialogue" className="tile">
          <h3>Dialogue and narration</h3>
          <p>Tags, action beats, punctuation, emotion, hesitation, sarcasm and inner thoughts.</p>
          <p className="tile-meta">
            {lessons.length} lessons · {done} of {total} exercises done
          </p>
        </Link>
        <div className="tile tile-off" aria-disabled="true">
          <h3>Sentence construction</h3>
          <p>Patterns for describing, contrasting and building suspense. Not available yet.</p>
        </div>
      </div>
    </>
  );
}
