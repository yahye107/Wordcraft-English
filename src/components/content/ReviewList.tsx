import Link from "next/link";
import type { ReviewItem, ReviewState } from "@/lib/content/review";

export const STATE_LABEL: Record<ReviewState, string> = {
  draft: "Draft",
  unreviewed: "Not reviewed",
  "needs-work": "Needs work",
  changed: "Changed since you reviewed it",
  approved: "Approved",
};

const KIND_LABEL: Record<string, string> = { expression: "Expression", contrast: "Contrast group", lesson: "Lesson", prompt: "Prompt" };

/** The queue as rows. Each row opens the review page, remembering the filter so "next" stays in the same list. */
export default function ReviewList({ items, query }: { items: ReviewItem[]; query: string }) {
  return (
    <ul className="entry-list review-list">
      {items.map((i) => (
        <li key={`${i.kind}:${i.slug}`}>
          <Link href={`/content/${i.kind}/${i.slug}${query}`} className="entry-row review-row">
            <span className="xcard-text">{i.title}</span>
            <span className="xcard-meaning">
              {KIND_LABEL[i.kind]}
              {i.area ? ` · ${i.area}` : ""}
              {i.level ? ` · ${i.level}` : ""}
            </span>
            <span className="badges">
              {i.status === "draft" && i.state !== "draft" && <span className="badge">Draft</span>}
              <span className={`badge state-${i.state}`}>{STATE_LABEL[i.state]}</span>
            </span>
            {i.note && <span className="xcard-meaning review-note">Your note: {i.note}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
