import type { Category } from './limits';

export type Practice = { label: string; links: { href: string; title: string }[] };

const STUDIO = { href: '/studio', title: 'Write in the studio' };
const VOCAB = { href: '/studio/vocabulary', title: 'Find better words' };
const EXPLORE = { href: '/explore', title: 'Browse expressions' };
const RHYTHM = { href: '/labs/sentences/sentence-length-and-rhythm', title: 'Lesson: sentence length and rhythm' };
const FLOW = { href: '/labs/sentences/improving-flow', title: 'Lesson: improving flow' };
const CLAUSES = { href: '/labs/sentences/subordinate-clauses', title: 'Lesson: subordinate clauses' };
const PARTICIPLES = { href: '/labs/sentences/participial-phrases', title: 'Lesson: participial phrases' };
const DIALOGUE_PUNCT = { href: '/labs/dialogue/tags-and-action-beats', title: 'Lesson: tags and action beats' };

/** Existing practice that matches a recurring weakness. Every link points at a real page. */
export function practiceFor(category: Category, key: string): Practice {
  if (key.startsWith('vocabulary:') || category === 'vocabulary') {
    return { label: 'Choose more exact words', links: [VOCAB, EXPLORE, STUDIO] };
  }
  if (key.startsWith('structure:same-start') || key.startsWith('structure:same-length') || key.startsWith('structure:long-sentence')) {
    return { label: 'Vary and shape your sentences', links: [RHYTHM, FLOW, STUDIO] };
  }
  if (key.startsWith('naturalness:repeat')) {
    return { label: 'Avoid repeating words', links: [VOCAB, FLOW, STUDIO] };
  }
  if (category === 'structure') return { label: 'Build better sentences', links: [CLAUSES, PARTICIPLES, FLOW] };
  if (category === 'punctuation') {
    return { label: 'Punctuation practice', links: key.includes('dialogue') ? [DIALOGUE_PUNCT, STUDIO] : [CLAUSES, DIALOGUE_PUNCT, STUDIO] };
  }
  if (category === 'grammar') return { label: 'Grammar in sentences', links: [CLAUSES, PARTICIPLES, STUDIO] };
  if (category === 'naturalness') return { label: 'Sound more natural', links: [FLOW, VOCAB, STUDIO] };
  return { label: 'Keep practising', links: [STUDIO] };
}
