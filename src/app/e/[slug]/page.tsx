import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getExpression } from "@/lib/content/queries";
import ExpressionView from "@/components/ExpressionView";
import { getEntryForSlug } from "@/lib/notebook/entries";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/e/[slug]">) {
  const { slug } = await props.params;
  const e = getExpression(getDb(), slug);
  return { title: e?.text ?? "Expression" };
}

export default async function ExpressionPage(props: PageProps<"/e/[slug]">) {
  const { slug } = await props.params;
  const db = getDb();
  const e = getExpression(db, slug);
  if (!e) notFound();
  const saved = getEntryForSlug(db, slug);

  return <ExpressionView e={e} savedEntryId={saved?.id ?? null} />;
}
