import { containsExpression } from '@/lib/text/match';
import type { ContentKind } from './files';
import type { ContentBundle, ExpressionFile } from './schemas';

export type LintIssue = { kind: ContentKind; slug: string; severity: 'error' | 'warn'; rule: string; message: string };

const MAX_MEANING = 160;
const MIN_NOTES = 40;
const MIN_PHRASES = 3;
const MIN_SETTINGS = 2;
const HARD_WORD = 12;
const MAX_HARD_WORDS = 2;
const MAX_AVG_SENTENCE = 25;

const normaliseText = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const wordsIn = (s: string) => s.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
const sentencesOf = (s: string) => s.split(/[.!?]+\s+|[.!?]+$/).map((x) => x.trim()).filter(Boolean);

// A relation is "returned" when the other entry points back with the matching type.
const RETURN: Record<string, string> = { synonym: 'synonym', antonym: 'antonym', stronger: 'weaker', weaker: 'stronger' };

/**
 * Checks beyond the schema. Errors are structural slips; warnings are quality-bar reminders and never block anything.
 * Pure: it only reads the bundle.
 */
export function lintBundle(bundle: ContentBundle): LintIssue[] {
  const out: LintIssue[] = [];
  const add = (kind: ContentKind, slug: string, severity: 'error' | 'warn', rule: string, message: string) =>
    out.push({ kind, slug, severity, rule, message });
  const bySlug = new Map(bundle.expressions.map((e) => [e.slug, e]));

  const firstExample = new Map<string, string>();
  const firstText = new Map<string, string>();

  for (const e of bundle.expressions) {
    const err = (rule: string, message: string) => add('expression', e.slug, 'error', rule, message);
    const warn = (rule: string, message: string) => add('expression', e.slug, 'warn', rule, message);

    // Errors
    if (e.relations.some((r) => r.to === e.slug)) err('self-relation', 'This entry is related to itself.');
    for (const m of e.mistakes) {
      if (normaliseText(m.wrong) === normaliseText(m.right)) err('mistake-same', `A mistake has the same "wrong" and "right" text: "${m.wrong}".`);
    }
    const t = normaliseText(e.text);
    const priorText = firstText.get(t);
    if (priorText) err('duplicate-text', `Another entry (${priorText}) has the same text.`);
    else firstText.set(t, e.slug);
    for (const x of e.examples) {
      const key = normaliseText(x.text);
      const prior = firstExample.get(key);
      if (prior) err('duplicate-example', `This example is also used by ${prior}: "${x.text.slice(0, 60)}".`);
      else firstExample.set(key, e.slug);
    }

    // Warnings
    if (e.kind !== 'pattern' && e.examples.length > 0 && !e.examples.some((x) => containsExpression(e.text, x.text))) {
      warn('example-missing-text', `No example contains "${e.text}", so the word cannot be highlighted.`);
    }
    if (new Set(e.examples.map((x) => x.setting)).size < MIN_SETTINGS) warn('few-settings', 'Examples should use at least 2 different settings.');
    if (e.searchPhrases.length < MIN_PHRASES) warn('few-search-phrases', `Add at least ${MIN_PHRASES} search phrases (found ${e.searchPhrases.length}).`);
    if (e.mistakes.length === 0) warn('no-mistakes', 'Add a mistake learners really make.');
    if (e.relations.length === 0) warn('no-relations', 'Link this entry to a synonym, opposite, stronger or weaker word.');
    if (e.tags.length === 0) warn('no-tags', 'Add at least one tag.');
    if (e.simpleMeaning.length > MAX_MEANING || sentencesOf(e.simpleMeaning).length > 1) {
      warn('long-meaning', 'The simple meaning should be one short sentence (under 160 characters).');
    }
    if (e.usageNotes.length < MIN_NOTES) warn('short-notes', 'The usage notes are very short; say when to use it and what to avoid.');
    if (wordsIn(e.simpleMeaning).filter((w) => w.length >= HARD_WORD).length > MAX_HARD_WORDS) {
      warn('hard-words', 'The simple meaning uses long, hard words. Use simpler ones.');
    }
    for (const [field, value] of [['contextual meaning', e.contextualMeaning], ['usage notes', e.usageNotes]] as const) {
      const ss = sentencesOf(value);
      if (ss.length > 0 && wordsIn(value).length / ss.length > MAX_AVG_SENTENCE) {
        warn('long-sentences', `The ${field} use long sentences (over ${MAX_AVG_SENTENCE} words on average).`);
        break;
      }
    }
    for (const r of e.relations) {
      const back = RETURN[r.type];
      const other = bySlug.get(r.to);
      if (back && other && other.slug !== e.slug && !other.relations.some((x) => x.to === e.slug && x.type === back)) {
        warn('one-way-synonym', `${r.type} link to ${r.to} is not returned (${r.to} should link back as ${back}).`);
      }
    }
  }

  for (const c of bundle.contrasts) {
    if (c.members.length < 3) add('contrast', c.slug, 'warn', 'small-group', 'A contrast group works best with at least 3 words.');
    for (const m of c.members) {
      const e: ExpressionFile | undefined = bySlug.get(m.expression);
      if (e && !containsExpression(e.text, m.example)) {
        add('contrast', c.slug, 'warn', 'group-member-example', `The example for "${e.text}" does not contain the word.`);
      }
    }
  }
  return out;
}
