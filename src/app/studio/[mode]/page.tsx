import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { listPrompts } from "@/lib/writing/prompts";
import { MODE_BLURB, MODE_LABEL, isMode, type Mode } from "@/lib/writing/limits";
import StartButton from "@/components/studio/StartButton";
import VocabFinder from "@/components/studio/VocabFinder";
import LevelBadge from "@/components/LevelBadge";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/studio/[mode]">) {
  const { mode } = await props.params;
  return { title: isMode(mode) ? MODE_LABEL[mode] : "Writing studio" };
}

export default async function ModePage(props: PageProps<"/studio/[mode]">) {
  const { mode } = await props.params;
  if (!isMode(mode)) notFound();
  const m: Mode = mode;

  const header = (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/studio">Writing studio</Link>
      </nav>
      <h1>{MODE_LABEL[m]}</h1>
      <p className="lede">{MODE_BLURB[m]}</p>
    </>
  );

  if (m === "vocabulary") {
    return (
      <>
        {header}
        <VocabFinder />
      </>
    );
  }

  if (m === "sentence") {
    return (
      <>
        {header}
        <div className="panel stack">
          <p>
            Write one sentence about anything: your day, a place, a feeling. You will see what could be clearer or more natural,
            with hints that help you improve it yourself.
          </p>
          <div className="row">
            <StartButton mode="sentence" label="Start writing" />
          </div>
        </div>
      </>
    );
  }

  const prompts = listPrompts(getDb(), m);
  return (
    <>
      {header}
      <div className="row notebook-actions">
        <StartButton mode={m} label="Write freely" secondary />
      </div>
      {prompts.length === 0 ? (
        <p className="muted">No prompts yet. You can still write freely.</p>
      ) : (
        <ul className="entry-list prompt-list">
          {prompts.map((p) => (
            <li key={p.slug} className="panel stack">
              <div>
                <h2>{p.title}</h2>
                <div className="badges">
                  <span className="badge">{p.kind}</span>
                  <LevelBadge level={p.level} />
                </div>
              </div>
              <p className="sentence">{p.situation}</p>
              {p.constraints.length > 0 && (
                <ul className="lesson-bullets">
                  {p.constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {p.try.length > 0 && (
                <p className="muted">
                  Try:{" "}
                  {p.try.map((t, i) => (
                    <span key={t.slug}>
                      {i > 0 && ", "}
                      <Link href={`/e/${t.slug}`}>{t.text}</Link>
                    </span>
                  ))}
                </p>
              )}
              <div className="row">
                <StartButton mode={m} promptSlug={p.slug} label="Write about this" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
