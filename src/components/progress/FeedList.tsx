import Link from "next/link";
import type { Feed, FeedItem } from "@/lib/progress/feed";
import { longDate } from "@/lib/progress/format";
import { MODE_LABEL, isMode } from "@/lib/writing/limits";
import DeleteSessionButton from "@/components/studio/DeleteSessionButton";
import DeleteAnalysisButton from "@/components/novel/DeleteAnalysisButton";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const LAB_PATH = { dialogue: "dialogue", sentence: "sentences" } as const;

function Item({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case "writing":
      return (
        <li className="panel stack">
          <Link href={`/studio/session/${item.sessionId}`} className="history-link">
            <span className="xcard-text">{item.title}</span>
            <span className="xcard-meaning">
              {isMode(item.mode) ? MODE_LABEL[item.mode] : item.mode} · {plural(item.versions, "version", "versions")} · {plural(item.words, "word", "words")}
            </span>
          </Link>
          <div className="row">
            <DeleteSessionButton id={item.sessionId} title={item.title} />
          </div>
        </li>
      );
    case "lessons": {
      const body = (
        <>
          <span className="xcard-text">{item.title}</span>
          <span className="xcard-meaning">
            Practised: {item.correct} of {plural(item.attempts, "answer", "answers")} correct
          </span>
        </>
      );
      return (
        <li className="panel stack">
          {item.lessonSlug && item.lab ? (
            <Link href={`/labs/${LAB_PATH[item.lab]}/${item.lessonSlug}`} className="history-link">{body}</Link>
          ) : (
            <div className="history-link">{body}</div>
          )}
        </li>
      );
    }
    case "reviews":
      return (
        <li className="panel stack">
          <Link href="/notebook/review" className="history-link">
            <span className="xcard-text">Reviewed {plural(item.count, "card", "cards")}</span>
            <span className="xcard-meaning">{item.remembered} remembered</span>
          </Link>
        </li>
      );
    case "passage":
      return (
        <li className="panel stack">
          <Link href={`/novel/${item.id}`} className="history-link">
            <span className="xcard-text">{item.title}</span>
            <span className="xcard-meaning">{item.preview}</span>
            <span className="xcard-meaning">Passage analysis · {item.aiUsed ? "with tutor" : "local only"}</span>
          </Link>
          <div className="row">
            <DeleteAnalysisButton id={item.id} label={item.title} />
          </div>
        </li>
      );
    case "notebook":
      return (
        <li className="panel stack">
          <Link href="/notebook" className="history-link">
            <span className="xcard-text">Saved {plural(item.count, "word", "words")}</span>
            <span className="xcard-meaning">Added to your notebook</span>
          </Link>
        </li>
      );
  }
}

/** The feed, one heading per day. Titles and previews are text, so React escapes anything odd in them. */
export default function FeedList({ feed, today, yesterday }: { feed: Feed; today: string; yesterday: string }) {
  return (
    <div className="feed">
      {feed.days.map((d) => (
        <section key={d.day} className="feed-day" aria-labelledby={`day-${d.day}`}>
          <h2 id={`day-${d.day}`}>{d.day === today ? "Today" : d.day === yesterday ? "Yesterday" : longDate(d.day)}</h2>
          <ul className="entry-list">
            {d.items.map((item, i) => (
              <Item key={`${item.kind}-${i}-${item.at}`} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
