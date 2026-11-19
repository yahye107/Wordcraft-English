import Link from "next/link";
import type { ExpressionDetail } from "@/lib/content/queries";
import LevelBadge, { RegisterBadge } from "@/components/LevelBadge";
import IntensityMeter from "@/components/IntensityMeter";
import Highlighted from "@/components/Highlighted";
import ContrastGroup from "@/components/ContrastGroup";
import SaveButton from "@/components/notebook/SaveButton";

const SETTING_LABEL: Record<string, string> = {
  dialogue: "In dialogue",
  narration: "In narration",
  everyday: "Everyday",
  professional: "Professional",
  academic: "Academic",
};
const RELATION_LABEL: Record<string, string> = {
  synonym: "Close in meaning",
  antonym: "Opposite",
  stronger: "Stronger",
  weaker: "Weaker",
  related: "Related",
};

/**
 * One expression, as a learner sees it. Used by the expression page and by the review preview, which passes
 * `preview` to drop the save button and the breadcrumb and to point draft neighbours at their review pages.
 */
export default function ExpressionView({ e, savedEntryId = null, preview = false }: { e: ExpressionDetail; savedEntryId?: number | null; preview?: boolean }) {
  const settings = [...new Set(e.examples.map((x) => x.setting))];
  const relationTypes = [...new Set(e.relations.map((r) => r.type))];
  const primary = e.categories[0];

  return (
    <article className="entry">
      {!preview && (
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/explore">Explore</Link>
          {primary && (
            <>
              <span aria-hidden="true"> / </span>
              <Link href={`/explore/${primary.slug}`}>{primary.name}</Link>
            </>
          )}
        </nav>
      )}

      <header>
        {preview ? <h2 className="entry-title">{e.text}</h2> : <h1>{e.text}</h1>}
        <p className="muted">{[e.kind, e.pos].filter(Boolean).join(" · ")}</p>
        <div className="badges">
          <LevelBadge level={e.level} />
          <RegisterBadge register={e.register} />
          <IntensityMeter value={e.intensity} />
          {!preview && <SaveButton slug={e.slug} entryId={savedEntryId} />}
        </div>
      </header>

      <section aria-labelledby="meaning-h">
        <h2 id="meaning-h">What it means</h2>
        <p className="lede">{e.simpleMeaning}</p>
        <h3>In context</h3>
        <p>{e.contextualMeaning}</p>
      </section>

      <section aria-labelledby="use-h">
        <h2 id="use-h">When to use it</h2>
        <p>{e.usageNotes}</p>
      </section>

      <section aria-labelledby="ex-h">
        <h2 id="ex-h">Examples</h2>
        {settings.map((s) => (
          <div key={s} className="example-group">
            <h3>{SETTING_LABEL[s] ?? s}</h3>
            <ul className="examples">
              {e.examples
                .filter((x) => x.setting === s)
                .map((x, i) => (
                  <li key={i}>
                    <p className="sentence">
                      <Highlighted text={x.text} needle={e.text} />
                    </p>
                    {x.contextNote && <p className="muted">{x.contextNote}</p>}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      {e.contrastGroups.length > 0 && (
        <section aria-labelledby="diff-h">
          <h2 id="diff-h">How it differs from similar words</h2>
          {e.contrastGroups.map((g) => (
            <ContrastGroup key={g.slug} group={g} currentSlug={e.slug} preview={preview} />
          ))}
        </section>
      )}

      {e.relations.length > 0 && (
        <section aria-labelledby="rel-h">
          <h2 id="rel-h">Related expressions</h2>
          {relationTypes.map((t) => (
            <div key={t} className="rel-group">
              <h3>{RELATION_LABEL[t] ?? t}</h3>
              <ul className="rel-list">
                {e.relations
                  .filter((r) => r.type === t)
                  .map((r) => (
                    <li key={r.slug}>
                      <Link href={r.draft ? `/content/expression/${r.slug}` : `/e/${r.slug}`}>{r.text}</Link>
                      {r.draft && <span className="badge"> Draft</span>}
                      {r.note && <span className="muted"> — {r.note}</span>}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {e.mistakes.length > 0 && (
        <section aria-labelledby="mis-h">
          <h2 id="mis-h">Common mistakes</h2>
          <ul className="mistakes">
            {e.mistakes.map((m, i) => (
              <li key={i} className="mistake">
                <p className="sentence">
                  <span className="wrong">{m.wrong}</span>
                </p>
                <p className="sentence">
                  <span className="right">{m.right}</span>
                </p>
                <p className="muted">{m.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
