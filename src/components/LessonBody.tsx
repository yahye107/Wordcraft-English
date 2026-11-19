import type { LessonSection } from "@/lib/content/schemas";
import Annotated from "./Annotated";

export default function LessonBody({ sections }: { sections: LessonSection[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <section key={i} className="lesson-section" aria-labelledby={`sec-${i}`}>
          <h2 id={`sec-${i}`}>{s.heading}</h2>
          {s.paragraphs.map((p, j) => (
            <p key={j}>
              <Annotated text={p} />
            </p>
          ))}
          {s.bullets.length > 0 && (
            <ul className="lesson-bullets">
              {s.bullets.map((b, j) => (
                <li key={j}>
                  <Annotated text={b} />
                </li>
              ))}
            </ul>
          )}
          {s.examples.map((ex, j) => (
            <figure key={j} className="example">
              <blockquote className="example-text">
                <Annotated text={ex.text} />
              </blockquote>
              {ex.note && <figcaption className="muted">{ex.note}</figcaption>}
            </figure>
          ))}
        </section>
      ))}
    </>
  );
}
