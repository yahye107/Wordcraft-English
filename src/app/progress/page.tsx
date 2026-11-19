import Link from "next/link";

export const metadata = { title: "Progress" };

const LINKS = [
  { href: "/tutor", title: "Tutor", text: "Recurring problems, practice and how your writing is improving." },
  { href: "/history", title: "Your writing", text: "Every piece you have written, with its versions." },
  { href: "/notebook", title: "Notebook", text: "Words to review." },
];

export default function ProgressPage() {
  return (
    <div className="reading">
      <h1>Progress</h1>
      <p className="lede">See how your writing is changing and what to practise next.</p>
      <ul className="entry-list">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="entry-row">
              <span className="xcard-text">{l.title}</span>
              <span className="xcard-meaning">{l.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="muted">A full dashboard with charts across everything arrives in a later phase.</p>
    </div>
  );
}
