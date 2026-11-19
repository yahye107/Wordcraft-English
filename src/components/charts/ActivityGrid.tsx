import type { DayActivity } from "@/lib/progress/activity";
import { weekday } from "@/lib/progress/days";
import { dayLabel as label } from "@/lib/progress/format";

/** 0 none, 1 one thing, 2 two or three, 3 four to six, 4 seven or more. Lightness steps of one hue. */
export const levelOf = (n: number): 0 | 1 | 2 | 3 | 4 => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);

const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

/**
 * Weeks as columns, Monday first, oldest on the left. Empty days are hollow and active days are filled darker for
 * more activity. The cells are a picture; the same facts are in the label and a list of the last 14 days.
 */
export default function ActivityGrid({ days }: { days: DayActivity[] }) {
  if (days.length === 0) return null;
  const lead = weekday(days[0].day);
  const active = days.filter((d) => d.total > 0).length;
  const recent = days.slice(-14).reverse();
  const summary = `Activity over the last ${days.length} days: ${active} active ${active === 1 ? "day" : "days"}.`;

  return (
    <figure className="chart">
      <div className="activity" role="img" aria-label={summary}>
        <div className="activity-days" aria-hidden="true">
          <span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span />
        </div>
        <div className="activity-grid" aria-hidden="true">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad-${i}`} className="cell cell-pad" />
          ))}
          {days.map((d) => (
            <span key={d.day} className={`cell cell-${levelOf(d.total)}`} title={`${label(d.day)}: ${d.total === 0 ? "nothing" : things(d.total)}`} />
          ))}
        </div>
      </div>
      <div className="activity-legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`cell cell-${l}`} />
        ))}
        <span>More</span>
      </div>
      <details className="chart-numbers">
        <summary>Show the last 14 days</summary>
        <ul className="plain-list">
          {recent.map((d) => (
            <li key={d.day}>
              {label(d.day)}: {d.total === 0 ? "nothing" : things(d.total)}
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}
