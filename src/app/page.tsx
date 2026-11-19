import Link from "next/link";
import { getDb } from "@/lib/db";
import { getToday } from "@/lib/progress/today";
import TodayPanel from "@/components/progress/TodayPanel";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const db = getDb();
  const today = getToday(db);
  const due = today.dueCards;
  // Drafts the learner has not looked at yet. A cheap count; the review page has the full picture.
  const drafts =
    db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM expressions e WHERE e.status = 'draft' AND NOT EXISTS (SELECT 1 FROM content_reviews r WHERE r.kind = 'expression' AND r.slug = e.slug)",
    )?.n ?? 0;
  return (
    <>
      <h1>From a plain thought to a written sentence</h1>
      <p className="lede">
        Wordcraft teaches you how to say what you mean, with the right words, in your own hand.
      </p>

      <figure className="turn" aria-label="Example of improving a sentence">
        <p className="turn-before">
          <span className="wrong">She was angry.</span>
        </p>
        <p className="turn-after">
          Her <span className="hl">jaw tightened</span>, and she set the cup down a little too hard.
        </p>
        <figcaption className="turn-note">
          Show the feeling through the body. Find the expression in Explore, then write your own.
        </figcaption>
      </figure>

      <TodayPanel today={today} />
      {drafts > 0 && (
        <p className="drafts-note" data-testid="drafts-note">
          <Link href="/content">{drafts} {drafts === 1 ? "draft is" : "drafts are"} waiting for your review</Link>
        </p>
      )}

      <div className="tiles">
        {due > 0 && (
          <Link href="/notebook/review" className="tile">
            <h3>{due} {due === 1 ? "card" : "cards"} to review</h3>
            <p>A few minutes of review keeps your words fresh.</p>
          </Link>
        )}
        <Link href="/explore" className="tile">
          <h3>Explore expressions</h3>
          <p>Browse by feeling, action or situation, and see how near-synonyms differ.</p>
        </Link>
        <Link href="/search" className="tile">
          <h3>Search by what you mean</h3>
          <p>Try “ways to show disappointment without saying disappointed”.</p>
        </Link>
        <Link href="/labs" className="tile">
          <h3>Labs</h3>
          <p>Dialogue and sentence construction, with lessons and exercises you can check.</p>
        </Link>
      </div>
    </>
  );
}
