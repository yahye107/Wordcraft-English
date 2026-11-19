import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/writing/sessions";
import { getPrompt } from "@/lib/writing/prompts";
import { getUsedExpressions } from "@/lib/writing/stats";
import { MODE_LABEL, WRITING_LIMITS } from "@/lib/writing/limits";
import { aiConfigured } from "@/lib/ai/client";
import Workspace from "@/components/studio/Workspace";

export const dynamic = "force-dynamic";

function parseId(s: string): number | null {
  return /^[1-9][0-9]{0,9}$/.test(s) ? Number(s) : null;
}

export async function generateMetadata(props: PageProps<"/studio/session/[id]">) {
  const id = parseId((await props.params).id);
  const s = id === null ? undefined : getSession(getDb(), id);
  return { title: s?.title ?? "Writing" };
}

export default async function SessionPage(props: PageProps<"/studio/session/[id]">) {
  const id = parseId((await props.params).id);
  if (id === null) notFound();
  const db = getDb();
  const session = getSession(db, id);
  if (!session) notFound();

  const prompt = session.promptSlug ? getPrompt(db, session.promptSlug) : null;
  const latest = session.revisions[session.revisions.length - 1];
  const tryUsed = prompt && latest ? getUsedExpressions(db, latest.text, prompt.try.map((t) => t.slug)) : [];

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/studio">Writing studio</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/studio/${session.mode}`}>{MODE_LABEL[session.mode]}</Link>
      </nav>
      <h1>{session.title}</h1>

      <Workspace
        sessionId={session.id}
        mode={session.mode}
        maxChars={session.mode === "sentence" ? WRITING_LIMITS.sentence : WRITING_LIMITS.text}
        prompt={prompt ? { title: prompt.title, situation: prompt.situation, constraints: prompt.constraints, try: prompt.try } : null}
        revisions={session.revisions}
        aiAvailable={aiConfigured()}
        tryUsed={tryUsed}
      />
    </>
  );
}
