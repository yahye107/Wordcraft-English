import Link from "next/link";
import type { LabInfo } from "@/lib/labs";
import type { LessonSummary } from "@/lib/lessons/queries";
import LevelBadge from "./LevelBadge";
import AnnotationLegend from "./AnnotationLegend";

export default function LabLessonList({ info, lessons }: { info: LabInfo; lessons: LessonSummary[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/labs">Labs</Link>
      </nav>
      <h1>{info.title}</h1>
      <p className="lede">{info.intro}</p>

      <AnnotationLegend lab={info.lab} />

      {lessons.length === 0 ? (
        <p className="muted">No lessons yet.</p>
      ) : (
        <ol className="lesson-list">
          {lessons.map((l) => (
            <li key={l.slug}>
              <Link href={`/labs/${info.path}/${l.slug}`} className="lesson-card">
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
