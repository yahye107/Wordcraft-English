import Link from "next/link";
import { getDb } from "@/lib/db";
import { listAnalyses } from "@/lib/novel/store";
import { NOVEL_LIMITS } from "@/lib/novel/limits";
import { aiConfigured } from "@/lib/ai/client";
import PassageForm from "@/components/novel/PassageForm";
import DeleteAnalysisButton from "@/components/novel/DeleteAnalysisButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novel lab" };

export default function NovelPage() {
  const analyses = listAnalyses(getDb());

  return (
    <div className="reading">
      <h1>Novel lab</h1>
      <p className="lede">
        Paste a short passage, up to {NOVEL_LIMITS.words} words, from a book you are reading. See how the writer builds the sentences, the dialogue and the
        description, then copy the technique in your own words.
      </p>
      <p className="muted notice" data-testid="notice">
        The passage is stored only on this computer, and you can delete it at any time. Wordcraft contains no book text. Please paste only a short scene
        for study.
      </p>

      <PassageForm aiAvailable={aiConfigured()} />

      <h2>Your analyses</h2>
      {analyses.length === 0 ? (
        <p className="muted">Nothing here yet. Paste a passage above.</p>
      ) : (
        <ul className="entry-list">
          {analyses.map((a) => (
            <li key={a.id} className="panel stack">
              <Link href={`/novel/${a.id}`} className="history-link">
                <span className="xcard-text">{a.sourceTitle ?? "Untitled passage"}</span>
                <span className="xcard-meaning">{a.excerptPreview}</span>
                <span className="xcard-meaning">
                  {new Date(a.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  {a.aiUsed ? " · with tutor" : " · local only"}
                </span>
              </Link>
              <div className="row">
                <DeleteAnalysisButton id={a.id} label={a.sourceTitle ?? "this analysis"} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
