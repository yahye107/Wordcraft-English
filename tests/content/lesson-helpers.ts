export const lessonYaml = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    slug: 'what-tags-do',
    lab: 'dialogue',
    title: 'What tags do',
    summary: 'Tags tell the reader who is speaking.',
    level: 'beginner',
    sort: 1,
    sections: [
      { heading: 'The invisible tag', paragraphs: ['Said is almost invisible.'], examples: [{ text: '{speech|“Hi,”} {tag|she said.}', note: 'A plain tag.' }] },
      { heading: 'When to skip it', paragraphs: ['Skip a tag when context is clear.'] },
    ],
    related: [],
    ...over,
  });

export const exerciseYaml = (type: string, over: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = { slug: `ex-${type.replace(/_/g, "-")}`, lesson: 'what-tags-do', level: 'beginner', explanation: 'Because.' };
  const byType: Record<string, Record<string, unknown>> = {
    choose: { type: 'choose', prompt: 'Pick the tag.', options: ['she said', 'she smiled'], answer: 0 },
    fill_blank: { type: 'fill_blank', prompt: '“Go,” she ___.', accepted: ['said'] },
    identify: { type: 'identify', prompt: 'Label each.', items: [{ text: 'She said.', answer: 'tag' }, { text: 'She smiled.', answer: 'beat' }], choices: ['tag', 'beat'] },
    fix_punctuation: { type: 'fix_punctuation', prompt: 'Fix it.', broken: '“Go” she said', accepted: ['“Go,” she said.'] },
    free_write: { type: 'free_write', prompt: 'Write a line.', checklist: ['a', 'b', 'c'], sample: 'Sample.' },
  };
  return JSON.stringify({ ...base, ...byType[type], ...over });
};
