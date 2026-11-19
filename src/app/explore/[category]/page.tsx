import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCategory, listExpressions } from "@/lib/content/queries";
import ExpressionCard from "@/components/ExpressionCard";
import type { Level } from "@/lib/content/schemas";

export const dynamic = "force-dynamic";

const LEVELS: Level[] = ["beginner", "intermediate", "advanced", "literary"];

export async function generateMetadata(props: PageProps<"/explore/[category]">) {
  const { category } = await props.params;
  const c = getCategory(getDb(), category);
  return { title: c?.name ?? "Explore" };
}

export default async function CategoryPage(props: PageProps<"/explore/[category]">) {
  const { category } = await props.params;
  const sp = await props.searchParams;
  const db = getDb();
  const cat = getCategory(db, category);
  if (!cat) notFound();

  const levelParam = typeof sp.level === "string" ? sp.level : undefined;
  const level = LEVELS.find((l) => l === levelParam);
  const items = listExpressions(db, { categorySlug: cat.slug, level });

  const href = (l?: string) => (l ? `/explore/${cat.slug}?level=${l}` : `/explore/${cat.slug}`);

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/explore">Explore</Link>
        {cat.parent && (
          <>
            <span aria-hidden="true"> / </span>
            <Link href={`/explore/${cat.parent.slug}`}>{cat.parent.name}</Link>
          </>
        )}
      </nav>

      <h1>{cat.name}</h1>
      <p className="lede">{cat.description}</p>

      {cat.children.length > 0 && (
        <ul className="chips" aria-label="Subcategories">
          {cat.children.map((s) => (
            <li key={s.slug}>
              <Link href={`/explore/${s.slug}`} className="chip">
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ul className="chips" aria-label="Filter by level">
        <li>
          <Link href={href()} className="chip" aria-current={!level ? "true" : undefined}>
            All levels
          </Link>
        </li>
        {LEVELS.map((l) => (
          <li key={l}>
            <Link href={href(l)} className="chip" aria-current={level === l ? "true" : undefined}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </Link>
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <p className="muted">
          No expressions here yet{level ? ` at the ${level} level` : ""}.{" "}
          {level && <Link href={href()}>Show all levels</Link>}
        </p>
      ) : (
        <div className="cards">
          {items.map((e) => (
            <ExpressionCard key={e.slug} e={e} />
          ))}
        </div>
      )}
    </>
  );
}
