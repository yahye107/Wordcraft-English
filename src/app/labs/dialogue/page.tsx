import Link from "next/link";
import { getDb } from "@/lib/db";
import { listLessons } from "@/lib/lessons/queries";
import LevelBadge from "@/components/LevelBadge";
import AnnotationLegend from "@/components/AnnotationLegend";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dialogue and narration" };

export default function DialogueLabPage() {
  const lessons = listLessons(getDb(), "dialogue");

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/labs">Labs</Link>
      </nav>
      <h1>Dialogue and narration</h1>
      <p className="lede">
        Learn how professional writers build dialogue: who is speaking, what the body does, and how feeling shows
        without being announced. Work through the lessons in order.
      </p>

      <AnnotationLegend />

      {lessons.length === 0 ? (
        <p className="muted">No lessons yet.</p>
      ) : (
        <ol className="lesson-list">
          {lessons.map((l) => (
            <li key={l.slug}>
              <Link href={`/labs/dialogue/${l.slug}`} className="lesson-card">
                <span className="lesson-no" aria-hidden="true">{l.sort}</span>
                <span className="lesson-main">
                  <span className="lesson-title">{l.title}</span>
                  <span className="lesson-summary">{l.summary}</span>
                  <span className="badges">
                    <LevelBadge level={l.level} />
                    <span className="badge">
                      {l.doneCount} of {l.exerciseCount} exercises done
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
