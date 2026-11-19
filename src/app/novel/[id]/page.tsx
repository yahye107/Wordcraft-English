import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getAnalysis } from "@/lib/novel/store";
import { aiConfigured } from "@/lib/ai/client";
import AnalysisView from "@/components/novel/AnalysisView";

export const dynamic = "force-dynamic";

function parseId(s: string): number | null {
  return /^[1-9][0-9]{0,9}$/.test(s) ? Number(s) : null;
}

export async function generateMetadata(props: PageProps<"/novel/[id]">) {
  const id = parseId((await props.params).id);
  const a = id === null ? undefined : getAnalysis(getDb(), id);
  return { title: a?.sourceTitle ?? "Passage analysis" };
}

export default async function AnalysisPage(props: PageProps<"/novel/[id]">) {
  const id = parseId((await props.params).id);
  if (id === null) notFound();
  const record = getAnalysis(getDb(), id);
  if (!record) notFound();

  return (
    <div className="reading">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/novel">Novel lab</Link>
      </nav>
      <h1>{record.sourceTitle ?? "Passage analysis"}</h1>
      <AnalysisView record={record} aiAvailable={aiConfigured()} />
    </div>
  );
}
