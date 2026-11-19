import Link from "next/link";
import { getDb } from "@/lib/db";
import { getCategoryTree } from "@/lib/content/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore" };

export default function ExplorePage() {
  const tree = getCategoryTree(getDb());

  return (
    <>
      <h1>Explore expressions</h1>
      <p className="lede">Pick a feeling, an action or a situation. Each entry explains when to use a word and how it differs from its neighbours.</p>

      <div className="catgrid">
        {tree.map((c) => (
          <section key={c.slug} className="catcard">
            <h2>
              <Link href={`/explore/${c.slug}`}>{c.name}</Link>
            </h2>
            <p className="muted">{c.description}</p>
            <p className="count">{c.expressionCount} {c.expressionCount === 1 ? "expression" : "expressions"}</p>
            {c.children.length > 0 && (
              <ul className="chips">
                {c.children.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/explore/${s.slug}`} className="chip">{s.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
