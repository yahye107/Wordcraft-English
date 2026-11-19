import Link from "next/link";
import type { Today } from "@/lib/progress/today";
import { dayLabel } from "@/lib/progress/format";

const WEEKDAY = ["M", "T", "W", "T", "F", "S", "S"];

function streakText(n: number): string {
  return n > 0 ? `${n} ${n === 1 ? "day" : "days"} in a row` : "No streak yet";
}

/** The dashboard's "today" block: one next step, a few more, the streak and the last seven days. */
export default function TodayPanel({ today }: { today: Today }) {
  const [first, ...rest] = today.suggestions;
  const brandNew = Object.values(today.activity.lifetime).every((n) => n === 0);
  const activeDays = today.week.filter((d) => d.total > 0);

  return (
    <section className="today" data-testid="today" aria-labelledby="today-h">
      <h2 id="today-h">{brandNew ? "Start here" : "Today"}</h2>
      <div className="today-grid">
        <div className="today-next">
          {first && (
            <>
              <Link href={first.href} className="btn today-main" data-testid="today-main">
                {first.title}
              </Link>
              <p className="muted">{first.text}</p>
            </>
          )}
          {rest.length > 0 && (
            <ul className="today-more" aria-label="More things to do">
              {rest.map((s) => (
                <li key={s.id}>
                  <Link href={s.href}>{s.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="today-week">
          <p className="streak" data-testid="streak">{streakText(today.activity.currentStreak)}</p>
          <ol className="week-strip" aria-label="The last seven days">
            {today.week.map((d, i) => (
              <li key={d.day} className={d.total > 0 ? "week-day on" : "week-day"}>
                <span className="week-mark" aria-hidden="true" />
                <span className="week-letter" aria-hidden="true">{WEEKDAY[(new Date(`${d.day}T12:00:00Z`).getUTCDay() + 6) % 7]}</span>
                <span className="visually-hidden">
                  {dayLabel(d.day)}: {d.total > 0 ? "active" : "nothing"}
                  {i === today.week.length - 1 ? " (today)" : ""}
                </span>
              </li>
            ))}
          </ol>
          <p className="muted today-note">
            {activeDays.length} of the last 7 days
            {today.activity.longestStreak > 1 ? ` · longest run ${today.activity.longestStreak} days` : ""}
          </p>
          <Link href="/progress" className="today-link">See your progress</Link>
        </div>
      </div>
    </section>
  );
}
