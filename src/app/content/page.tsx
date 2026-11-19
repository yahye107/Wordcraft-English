import Link from "next/link";
import { getDb } from "@/lib/db";
import { contentDir } from "@/lib/content/dir";
import { isContentKind, type ContentKind } from "@/lib/content/files";
import { getAreaCoverage, getReviewQueue, type ReviewState } from "@/lib/content/review";
import ReviewList from "@/components/content/ReviewList";
import CoverageTable from "@/components/content/CoverageTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library review" };

const STEP = 50;
const STATES: ReviewState[] = ["draft", "changed", "needs-work", "unreviewed", "approved"];
const isState = (v: string): v is ReviewState => (STATES as string[]).includes(v);
const KINDS: { kind: ContentKind; label: string }[] = [
  { kind: "expression", label: "Expressions" },
  { kind: "contrast", label: "Contrast groups" },
  { kind: "lesson", label: "Lessons" },
  { kind: "prompt", label: "Prompts" },
];
const EMPTY: Record<ReviewState, string> = {
  draft: "No drafts are waiting. Everything you have been given has been reviewed.",
  changed: "Nothing has been edited since you reviewed it.",
  "needs-work": "Nothing is marked as needing work.",
  unreviewed: "Nothing here is waiting for a first look.",
  approved: "You have not approved anything yet.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ContentReviewPage(props: PageProps<"/content">) {
  const sp = await props.searchParams;
  const db = getDb();
  const queue = getReviewQueue(db, contentDir());
  const areas = getAreaCoverage(db);

  const stateParam = first(sp.state);
  const defaultState: ReviewState = queue.counts.draft > 0 ? "draft" : queue.counts.changed > 0 ? "changed" : "unreviewed";
  const state = isState(stateParam) ? stateParam : defaultState;
  const kindParam = first(sp.kind);
  const kind: ContentKind = isContentKind(kindParam) ? kindParam : "expression";
  const requested = Number(first(sp.limit));
  const limit = Number.isInteger(requested) && requested >= STEP ? Math.min(requested, 1000) : STEP;

  const matching = queue.items.filter((i) => i.state === state && i.kind === kind);
  const shown = matching.slice(0, limit);
  const href = (s: ReviewState, k: ContentKind, l?: number) => {
    const q = new URLSearchParams({ state: s, kind: k });
    if (l && l > STEP) q.set("limit", String(l));
    return `/content?${q.toString()}`;
  };

  const tiles: { state: ReviewState; label: string; n: number }[] = [
    { state: "draft", label: "Drafts waiting", n: queue.counts.draft },
    { state: "unreviewed", label: "Not reviewed by you", n: queue.counts.unreviewed },
    { state: "needs-work", label: "Needs work", n: queue.counts.needsWork },
    { state: "changed", label: "Changed since you reviewed", n: queue.counts.changed },
    { state: "approved", label: "Approved", n: queue.counts.approved },
  ];

  return (
    <div className="reading">
      <h1>Library review</h1>
      <p className="lede">
        Read each entry as a learner would, then approve it or say what needs work. A draft stays hidden from learners until you approve it.
      </p>

      <ul className="review-tiles" aria-label="Review queue">
        {tiles.map((t) => (
          <li key={t.state}>
            <Link href={href(t.state, kind)} className="review-tile" aria-current={state === t.state ? "true" : undefined} data-testid={`tile-${t.state}`}>
              <span className="review-count">{t.n}</span>
              <span className="review-label">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <ul className="chips" aria-label="Kind of item">
        {KINDS.map((k) => (
          <li key={k.kind}>
            <Link href={href(state, k.kind)} className="chip" aria-current={kind === k.kind ? "true" : undefined}>
              {k.label}
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 ? (
        <p className="muted" data-testid="empty">{EMPTY[state]}</p>
      ) : (
        <>
          <p className="muted" data-testid="showing">
            Showing {shown.length} of {matching.length}.
          </p>
          <ReviewList items={shown} query={`?state=${state}&kind=${kind}`} />
        </>
      )}
      {matching.length > shown.length && (
        <p>
          <Link href={href(state, kind, limit + STEP)} className="btn secondary">Show more</Link>
        </p>
      )}

      {queue.problems.length > 0 && (
        <section className="panel stack" aria-labelledby="problems-h" data-testid="problems">
          <h2 id="problems-h">Files with problems</h2>
          <p className="muted">These files could not be read, so they are not in the list. Fix them, then reload.</p>
          <ul className="plain-list">
            {queue.problems.map((p) => (
              <li key={p.file}>
                <code>{p.file}</code>: {p.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack" aria-labelledby="coverage-h">
        <h2 id="coverage-h">Entries per area</h2>
        <p className="muted">Published and draft entries together. Areas with fewer than 8 are marked.</p>
        <CoverageTable areas={areas} />
      </section>
    </div>
  );
}
