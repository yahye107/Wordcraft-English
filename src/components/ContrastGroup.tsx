import Link from "next/link";
import type { ContrastGroupDetail } from "@/lib/content/queries";
import Highlighted from "./Highlighted";

/** A contrast group. In the review preview (`preview`), draft members are marked and link to their review page. */
export default function ContrastGroup({
  group,
  currentSlug,
  preview = false,
}: {
  group: ContrastGroupDetail;
  currentSlug?: string;
  preview?: boolean;
}) {
  return (
    <section className="contrast" aria-labelledby={`cg-${group.slug}`}>
      <h3 id={`cg-${group.slug}`}>{group.title}</h3>
      <p>{group.explanation}</p>
      <ul className="contrast-list">
        {group.members.map((m) => (
          <li key={m.slug} className={m.slug === currentSlug ? "current" : undefined}>
            <div className="contrast-word">
              {m.slug === currentSlug ? (
                <strong>{m.text}</strong>
              ) : (
                <Link href={preview && m.draft ? `/content/expression/${m.slug}` : `/e/${m.slug}`}>{m.text}</Link>
              )}
              {m.slug === currentSlug && <span className="muted"> (this one)</span>}
              {preview && m.draft && <span className="badge"> Draft</span>}
            </div>
            <p className="contrast-note">{m.note}</p>
            <p className="sentence">
              <Highlighted text={m.example} needle={m.text} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
