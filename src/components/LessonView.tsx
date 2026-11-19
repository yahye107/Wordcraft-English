import Link from "next/link";
import type { LabInfo } from "@/lib/labs";
import type { LessonDetail } from "@/lib/lessons/queries";
import LevelBadge from "./LevelBadge";
import AnnotationLegend from "./AnnotationLegend";
import LessonBody from "./LessonBody";
import ExercisePlayer from "./ExercisePlayer";

export default function LessonView({ info, lesson: l }: { info: LabInfo; lesson: LessonDetail }) {
  const done = l.exercises.filter((e) => e.done).length;

  return (
    <article className="entry lesson">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/labs">Labs</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/labs/${info.path}`}>{info.title}</Link>
      </nav>

      <header>
        <h1>{l.title}</h1>
        <p className="lede">{l.summary}</p>
        <div className="badges">
          <LevelBadge level={l.level} />
          {l.exercises.length > 0 && (
            <span className="badge">
              {done} of {l.exercises.length} exercises done
            </span>
          )}
        </div>
      </header>

      <AnnotationLegend lab={info.lab} />

      <LessonBody sections={l.sections} />

      {l.related.length > 0 && (
        <section aria-labelledby="related-h" className="lesson-section">
          <h2 id="related-h">Words used in this lesson</h2>
          <ul className="chips">
            {l.related.map((r) => (
              <li key={r.slug}>
                <Link href={`/e/${r.slug}`} className="chip">
                  {r.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {l.exercises.length > 0 && (
        <section aria-labelledby="practice-h" className="lesson-section">
          <h2 id="practice-h">Practice</h2>
          {l.exercises.map((e, i) => (
            <ExercisePlayer key={e.slug} exercise={e} index={i + 1} />
          ))}
        </section>
      )}

      <nav aria-label="Lessons" className="lesson-nav">
        {l.prev ? (
          <Link href={`/labs/${info.path}/${l.prev.slug}`} className="btn secondary">
            Previous: {l.prev.title}
          </Link>
        ) : (
          <span />
        )}
        {l.next && (
          <Link href={`/labs/${info.path}/${l.next.slug}`} className="btn">
            Next: {l.next.title}
          </Link>
        )}
      </nav>
    </article>
  );
}
