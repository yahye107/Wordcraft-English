import Link from "next/link";
import { getDb } from "@/lib/db";
import { listLessons } from "@/lib/lessons/queries";
import { DIALOGUE_LAB, SENTENCE_LAB, type LabInfo } from "@/lib/labs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Labs" };

const BLURB: Record<LabInfo["lab"], string> = {
  dialogue: "Tags, action beats, punctuation, emotion, hesitation, sarcasm and inner thoughts.",
  sentence: "Clauses, cause and contrast, movement and places, suspense, rhythm and flow.",
};

export default function LabsPage() {
  const db = getDb();

  return (
    <>
      <h1>Labs</h1>
      <p className="lede">Short lessons that show how writers build dialogue and sentences, each with practice you can check.</p>

      <div className="tiles">
        {[DIALOGUE_LAB, SENTENCE_LAB].map((info) => {
          const lessons = listLessons(db, info.lab);
          const total = lessons.reduce((n, l) => n + l.exerciseCount, 0);
          const done = lessons.reduce((n, l) => n + l.doneCount, 0);
          return lessons.length > 0 ? (
            <Link key={info.lab} href={`/labs/${info.path}`} className="tile">
              <h3>{info.title}</h3>
              <p>{BLURB[info.lab]}</p>
              <p className="tile-meta">
                {lessons.length} lessons · {done} of {total} exercises done
              </p>
            </Link>
          ) : (
            <div key={info.lab} className="tile tile-off" aria-disabled="true">
              <h3>{info.title}</h3>
              <p>{BLURB[info.lab]} Not available yet.</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
