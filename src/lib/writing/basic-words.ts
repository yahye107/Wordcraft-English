/**
 * Basic or overused words that a learner can often replace with a more exact one.
 * `why` is the plain-English reason shown at hint level 2; `search` lists words used to look for
 * better choices in the library.
 */
export type BasicWord = { why: string; search: string[] };

export const BASIC_WORDS: Record<string, BasicWord> = {
  very: {
    why: 'Very is a weak intensifier. A stronger, more exact word usually says the same thing better.',
    search: [],
  },
  really: {
    why: 'Really adds little. Choose a word that already carries the strength you mean.',
    search: [],
  },
  good: {
    why: 'Good is very general. A more exact word tells the reader how something was good.',
    search: ['pleasant', 'excellent', 'admirable'],
  },
  bad: {
    why: 'Bad is very general. A more exact word tells the reader what kind of bad it was.',
    search: ['unpleasant', 'terrible', 'harmful'],
  },
  nice: {
    why: 'Nice is vague. Say what made it nice: kind, warm, pleasant, charming.',
    search: ['pleasant', 'kind', 'charming'],
  },
  got: {
    why: 'Got is a weak verb that can mean many things. A specific verb is clearer.',
    search: ['received', 'became', 'obtained'],
  },
  thing: {
    why: 'Thing hides what you mean. Name the object, idea or event instead.',
    search: [],
  },
  things: {
    why: 'Things hides what you mean. Name the objects, ideas or events instead.',
    search: [],
  },
  big: {
    why: 'Big is very general. Say how it was big: huge, vast, towering, heavy.',
    search: ['huge', 'vast', 'towering'],
  },
  stuff: {
    why: 'Stuff is vague. Name what you mean.',
    search: [],
  },
};
