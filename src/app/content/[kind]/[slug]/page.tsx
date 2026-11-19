import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { contentDir } from "@/lib/content/dir";
import { isContentKind } from "@/lib/content/files";
import { loadContent } from "@/lib/content/load";
import { lintBundle, type LintIssue } from "@/lib/content/lint";
import { getContrastGroup, getExpression } from "@/lib/content/queries";
import { getReviewQueue, nextItem, type ReviewState } from "@/lib/content/review";
import ExpressionView from "@/components/ExpressionView";
import ContrastGroup from "@/components/ContrastGroup";
import ReviewForm from "@/components/content/ReviewForm";
import { STATE_LABEL } from "@/components/content/ReviewList";

export const dynamic = "force-dynamic";

const STATES: ReviewState[] = ["draft", "changed", "needs-work", "unreviewed", "approved"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const LAB_PATH: Record<string, string> = { dialogue: "dialogue", sentence: "sentences" };

export async function generateMetadata(props: PageProps<"/content/[kind]/[slug]">) {
  const { slug } = await props.params;
  return { title: `Review: ${slug}` };
}

function lintFor(kind: string, slug: string): { issues: LintIssue[]; failed: boolean } {
  try {
    const { bundle, errors } = loadContent(contentDir());
    if (errors.length > 0) return { issues: [], failed: true };
    return { issues: lintBundle(bundle).filter((i) => i.kind === kind && i.slug === slug), failed: false };
  } catch {
    return { issues: [], failed: true };
  }
}

export default async function ReviewItemPage(props: PageProps<"/content/[kind]/[slug]">) {
  const { kind, slug } = await props.params;
  const sp = await props.searchParams;
  if (!isContentKind(kind)) notFound();

  const db = getDb();
  const queue = getReviewQueue(db, contentDir());
  const item = queue.items.find((i) => i.kind === kind && i.slug === slug);
  if (!item) notFound();

  // "Next" stays in the list the learner came from.
  const stateParam = first(sp.state);
  const state = (STATES as string[]).includes(stateParam) ? (stateParam as ReviewState) : undefined;
  const kindParam = first(sp.kind);
  const listKind = isContentKind(kindParam) ? kindParam : kind;
  const query = state ? `?state=${state}&kind=${listKind}` : `?kind=${listKind}`;
  const list = queue.items.filter((i) => i.kind === listKind && (state ? i.state === state : i.state !== "approved"));
  const next = nextItem(list, { kind, slug }, false) ?? list.find((i) => !(i.kind === kind && i.slug === slug));
  const nextHref = next ? `/content/${next.kind}/${next.slug}${query}` : `/content${query}`;

  const lint = lintFor(kind, slug);
  const isDraftExpression = kind === "expression" && item.status === "draft";

  const expression = kind === "expression" ? getExpression(db, slug, { includeDraft: true }) : undefined;
  const group = kind === "contrast" ? getContrastGroup(db, slug, { includeDraft: true }) : undefined;
  const lesson = kind === "lesson" ? db.get<{ title: string; summary: string; lab: string }>("SELECT title, summary, lab FROM lessons WHERE slug = ?", [slug]) : undefined;
  const prompt = kind === "prompt" ? db.get<{ title: string; situation: string; mode: string }>("SELECT title, situation, mode FROM writing_prompts WHERE slug = ?", [slug]) : undefined;
  const loaded = Boolean(expression || group || lesson || prompt);

  return (
    <div className="reading review-page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href={`/content${query}`}>Library review</Link>
      </nav>
      <h1>{item.title}</h1>
      <div className="badges">
        {item.status === "draft" && item.state !== "draft" && <span className="badge">Draft</span>}
        {item.status === "published" && <span className="badge">Published</span>}
        <span className={`badge state-${item.state}`} data-testid="state">{STATE_LABEL[item.state]}</span>
      </div>

      {isDraftExpression && (
        <p className="draft-banner" data-testid="draft-banner">
          Draft. Learners cannot see this yet. Approving it publishes it.
        </p>
      )}
      {item.note && (
        <p className="review-note-box" data-testid="earlier-note">
          <strong>Your earlier note:</strong> {item.note}
        </p>
      )}

      <section className="preview" aria-label="How learners will see it" data-testid="preview">
        {!loaded && (
          <p className="muted">
            This file has not been loaded into the library yet. Run <code>npm run content:seed</code>, then reload.
          </p>
        )}
        {expression && <ExpressionView e={expression} preview />}
        {group && <ContrastGroup group={group} preview />}
        {lesson && (
          <div className="stack">
            <p className="lede">{lesson.summary}</p>
            <p>
              <Link href={`/labs/${LAB_PATH[lesson.lab] ?? lesson.lab}/${slug}`}>Open the lesson</Link> to read it and try its exercises.
            </p>
          </div>
        )}
        {prompt && (
          <div className="stack">
            <p className="sentence">{prompt.situation}</p>
            <p>
              <Link href={`/studio/${prompt.mode}`}>Open the {prompt.mode} prompts</Link> in the studio.
            </p>
          </div>
        )}
      </section>

      <section className="lint" aria-labelledby="lint-h" data-testid="lint">
        <h2 id="lint-h">Quality notes</h2>
        {lint.failed ? (
          <p className="muted">The library has errors, so quality notes are not available. Run <code>npm run content:validate</code>.</p>
        ) : lint.issues.length === 0 ? (
          <p className="muted">No quality notes. This entry meets the checks.</p>
        ) : (
          <ul className="plain-list">
            {lint.issues.map((i, n) => (
              <li key={n}>
                {i.message} <span className="muted">({i.rule})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">These notes are reminders from an automatic check. They never stop you approving.</p>
      </section>

      <ReviewForm
        key={`${kind}:${slug}:${item.state}`}
        kind={kind}
        slug={slug}
        isDraft={isDraftExpression}
        canUnpublish={kind === "expression" && item.status === "published"}
        existingNote={item.state === "needs-work" || item.state === "changed" ? item.note : ""}
        nextHref={nextHref}
      />
    </div>
  );
}
