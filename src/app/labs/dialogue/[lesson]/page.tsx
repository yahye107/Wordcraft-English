import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getLesson } from "@/lib/lessons/queries";
import LevelBadge from "@/components/LevelBadge";
import AnnotationLegend from "@/components/AnnotationLegend";
import LessonBody from "@/components/LessonBody";
import ExercisePlayer from "@/components/ExercisePlayer";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/labs/dialogue/[lesson]">) {
  const { lesson } = await props.params;
  const l = getLesson(getDb(), lesson);
  return { title: l?.title ?? "Lesson" };
}

export default async function LessonPage(props: PageProps<"/labs/dialogue/[lesson]">) {
  const { lesson } = await props.params;
  const l = getLesson(getDb(), lesson);
  if (!l || l.lab !== "dialogue") notFound();

  const done = l.exercises.filter((e) => e.done).length;

  return (
    <article className="entry lesson">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/labs">Labs</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/labs/dialogue">Dialogue and narration</Link>
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

      <AnnotationLegend />

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
          <Link href={`/labs/dialogue/${l.prev.slug}`} className="btn secondary">
            Previous: {l.prev.title}
          </Link>
        ) : (
          <span />
        )}
        {l.next && (
          <Link href={`/labs/dialogue/${l.next.slug}`} className="btn">
            Next: {l.next.title}
          </Link>
        )}
      </nav>
    </article>
  );
}
