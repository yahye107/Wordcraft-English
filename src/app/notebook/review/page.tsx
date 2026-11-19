import Link from "next/link";
import { getDb } from "@/lib/db";
import { getDueCards, nextDueAt } from "@/lib/notebook/review";
import ReviewSession from "@/components/notebook/ReviewSession";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review" };

export default function ReviewPage() {
  const db = getDb();
  const cards = getDueCards(db);
  const next = nextDueAt(db);

  return (
    <div className="reading">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/notebook">Notebook</Link>
      </nav>
      <h1>Review</h1>

      {cards.length === 0 ? (
        <div className="panel" role="status">
          <p><strong>Nothing due today.</strong></p>
          <p className="muted">
            {next
              ? `Your next card is due on ${new Date(next).toLocaleDateString(undefined, { day: "numeric", month: "long" })}.`
              : "Save some expressions to start reviewing."}
          </p>
          <p>
            <Link href="/explore">Browse expressions</Link>
          </p>
        </div>
      ) : (
        <ReviewSession cards={cards} />
      )}
    </div>
  );
}
