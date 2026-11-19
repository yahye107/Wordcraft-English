import Link from "next/link";
import { getDb } from "@/lib/db";
import { getFeed, isFeedType, type FeedType } from "@/lib/progress/feed";
import { dayKey, shiftDay } from "@/lib/progress/days";
import { MODES, MODE_LABEL, isMode } from "@/lib/writing/limits";
import FeedList from "@/components/progress/FeedList";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

const STEP = 60;
const TYPES: { type: FeedType; label: string }[] = [
  { type: "all", label: "All" },
  { type: "writing", label: "Writing" },
  { type: "lessons", label: "Lessons" },
  { type: "reviews", label: "Reviews" },
  { type: "passages", label: "Passages" },
];
const EMPTY: Record<FeedType, string> = {
  all: "Nothing here yet. Do a lesson, write a sentence or review a word and it will show up.",
  writing: "No writing yet.",
  lessons: "No lesson practice yet.",
  reviews: "No reviews yet.",
  passages: "No passages yet.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HistoryPage(props: PageProps<"/history">) {
  const sp = await props.searchParams;
  const modeParam = first(sp.mode);
  const mode = isMode(modeParam) ? modeParam : undefined;
  const typeParam = first(sp.type);
  // An old link with only ?mode= means the writing list.
  const type: FeedType = isFeedType(typeParam) ? typeParam : mode ? "writing" : "all";
  const requested = Number(first(sp.limit));
  const limit = Number.isInteger(requested) && requested >= STEP ? Math.min(requested, 300) : STEP;

  const feed = getFeed(getDb(), { type, mode: type === "writing" || type === "all" ? mode : undefined, limit });
  const today = dayKey(new Date());
  const yesterday = shiftDay(today, -1);
  const query = (t: FeedType, m?: string, l?: number) => {
    const q = new URLSearchParams();
    if (t !== "all") q.set("type", t);
    if (m) q.set("mode", m);
    if (l && l > STEP) q.set("limit", String(l));
    const s = q.toString();
    return s ? `/history?${s}` : "/history";
  };

  return (
    <div className="reading">
      <h1>History</h1>
      <p className="lede">Everything you have practised, newest first.</p>

      <ul className="chips" aria-label="Filter by kind">
        {TYPES.map((t) => (
          <li key={t.type}>
            <Link href={query(t.type)} className="chip" aria-current={type === t.type ? "true" : undefined}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>

      {type === "writing" && (
        <ul className="chips" aria-label="Filter writing by mode">
          <li>
            <Link href={query("writing")} className="chip" aria-current={!mode ? "true" : undefined}>All modes</Link>
          </li>
          {MODES.map((m) => (
            <li key={m}>
              <Link href={query("writing", m)} className="chip" aria-current={mode === m ? "true" : undefined}>
                {MODE_LABEL[m]}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {feed.days.length === 0 ? (
        <p className="muted">
          {EMPTY[type]} <Link href="/">Back to the dashboard</Link>.
        </p>
      ) : (
        <FeedList feed={feed} today={today} yesterday={yesterday} />
      )}

      {feed.hasMore && limit < 300 && (
        <p>
          <Link href={query(type, mode, limit + STEP)} className="btn secondary">Show more</Link>
        </p>
      )}
      {feed.hasMore && limit >= 300 && <p className="muted">Showing the 300 most recent. Delete older items you no longer need to see.</p>}
    </div>
  );
}
