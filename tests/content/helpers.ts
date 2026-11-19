import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Write a throwaway content directory from a {relativePath: text} map. */
export function makeContentDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordcraft-content-'));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text, 'utf8');
  }
  return dir;
}

export const CATEGORIES_YAML = `
categories:
  - slug: sadness
    name: Sadness
    description: Feelings of loss.
    children:
      - slug: disappointment
        name: Disappointment
        description: When hopes are not met.
`;

export function expressionYaml(over: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    slug: 'crestfallen',
    text: 'crestfallen',
    kind: 'word',
    pos: 'adjective',
    simpleMeaning: 'Sad and disappointed after a hope fails.',
    contextualMeaning: 'Shows the face and mood dropping after bad news.',
    usageNotes: 'Literary. Use it for a visible, sudden letdown.',
    intensity: 3,
    register: 'literary',
    level: 'advanced',
    status: 'published',
    categories: ['disappointment'],
    tags: ['emotion:disappointment'],
    searchPhrases: ['let down', 'deflated'],
    examples: [
      { text: 'Her face grew crestfallen when she read the letter.', setting: 'narration' },
      { text: 'He looked crestfallen—it was not the news he had hoped for.', setting: 'narration' },
      { text: '“Don’t be so crestfallen,” she said, “there’s always next year.”', setting: 'dialogue' },
    ],
    relations: [],
    mistakes: [],
  };
  return JSON.stringify({ ...base, ...over }); // JSON is valid YAML
}
