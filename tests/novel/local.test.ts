import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { analyseLocalPassage } from '@/lib/novel/local';
import { TECHNIQUES } from '@/lib/novel/techniques';

function setup(words: { slug: string; text: string; kind?: string; status?: string }[] = []): Db {
  const db = openDb(':memory:');
  migrate(db);
  words.forEach((w, i) => {
    db.run(
      "INSERT INTO expressions (id, slug, text, kind, simple_meaning, contextual_meaning, usage_notes, register, level, status) VALUES (?, ?, ?, ?, ?, 'c', 'u', 'neutral', 'intermediate', ?)",
      [i + 1, w.slug, w.text, w.kind ?? 'word', `Meaning of ${w.slug}.`, w.status ?? 'published'],
    );
  });
  return db;
}

describe('vocabulary', () => {
  it('finds a library expression including an inflected form', () => {
    const db = setup([{ slug: 'whispered', text: 'whispered' }]);
    const r = analyseLocalPassage(db, 'She whispers a secret.');
    expect(r.vocabulary).toEqual([
      { slug: 'whispered', text: 'whispered', simpleMeaning: 'Meaning of whispered.', level: 'intermediate', quote: 'whispers' },
    ]);
  });

  it('does not match inside a longer word, but matches the word itself', () => {
    const db = setup([{ slug: 'art', text: 'art' }]);
    expect(analyseLocalPassage(db, 'The party was fun.').vocabulary).toEqual([]);
    expect(analyseLocalPassage(db, 'The art was fun.').vocabulary.map((v) => v.quote)).toEqual(['art']);
  });

  it('does not match an unrelated word that merely starts the same way', () => {
    const db = setup([{ slug: 'scared', text: 'scared' }]);
    expect(analyseLocalPassage(db, 'A scarlet scarf hung there.').vocabulary).toEqual([]);
  });

  it('matches case-insensitively and keeps the passage spelling as the quote', () => {
    const db = setup([{ slug: 'furious', text: 'Furious' }]);
    expect(analyseLocalPassage(db, 'He was FURIOUS.').vocabulary[0].quote).toBe('FURIOUS');
  });

  it('matches a phrase with a different possessive and a curly apostrophe', () => {
    const db = setup([
      { slug: 'folded-her-arms', text: 'folded her arms', kind: 'phrase' },
      { slug: 'agree', text: 'I couldn’t agree more', kind: 'phrase' },
    ]);
    const r = analyseLocalPassage(db, 'He folded his arms. “I couldn\'t agree more,” she said.');
    expect(r.vocabulary.map((v) => v.quote)).toEqual(['folded his arms', "I couldn't agree more"]);
  });

  it('ignores draft expressions and takes the first match once per expression', () => {
    const db = setup([
      { slug: 'vast', text: 'vast' },
      { slug: 'ghostly', text: 'ghostly', status: 'draft' },
    ]);
    const r = analyseLocalPassage(db, 'A vast, ghostly field and a vast sky.');
    expect(r.vocabulary.map((v) => v.slug)).toEqual(['vast']);
  });

  it('caps vocabulary at 20 in order of position and unfamiliar words at 10', () => {
    const names = Array.from({ length: 25 }, (_, i) => `gem${String.fromCharCode(97 + i)}wordish`);
    const db = setup(names.map((n) => ({ slug: n, text: n })));
    const r = analyseLocalPassage(db, names.join(' ') + '.');
    expect(r.vocabulary).toHaveLength(20);
    expect(r.vocabulary[0].slug).toBe(names[0]);

    const db2 = setup();
    const long = Array.from({ length: 15 }, (_, i) => `strangeword${String.fromCharCode(97 + i)}`);
    expect(analyseLocalPassage(db2, long.join(' ') + '.').unfamiliar).toHaveLength(10);
  });
});

describe('unfamiliar words', () => {
  it('excludes matched, common and capitalised mid-sentence words, dedupes, and orders by length', () => {
    const db = setup([{ slug: 'labyrinth', text: 'labyrinth' }]);
    const r = analyseLocalPassage(
      db,
      'Mysteriously nothing moved. The bewildering, extraordinary, extraordinary labyrinth hid something near Kathmandu.',
    );
    expect(r.unfamiliar).toEqual(['extraordinary', 'mysteriously', 'bewildering']);
  });
});

describe('techniques', () => {
  const names = (t: string) => analyseLocalPassage(setup(), t).techniques.map((x) => x.name);

  it('names a dialogue tag and an action beat', () => {
    const n = names('“I can’t do this,” she whispered. Mara slammed the door.');
    expect(n).toContain('Dialogue tag');
    expect(n).toContain('Action beat');
  });

  it('detects a simile with like and with as...as, but not the verb like', () => {
    expect(names('The old man moved like a shadow.')).toContain('Simile');
    expect(names('Her hands were as cold as ice.')).toContain('Simile');
    expect(names('I like a good story. She arrived as soon as it ended.')).not.toContain('Simile');
  });

  it('detects a short sentence after a long one', () => {
    const t = 'He walked for hours through the empty streets, past the shuttered shops and the sleeping cats, until the lamps went out. Silence.';
    const hit = analyseLocalPassage(setup(), t).techniques.find((x) => x.name === 'Short sentence for effect');
    expect(hit?.quote).toBe('Silence.');
  });

  it('detects a list of three and a repeated word', () => {
    expect(names('She packed bread, cheese, and apples.')).toContain('List of three');
    const rep = analyseLocalPassage(setup(), 'Rain fell on the roofs. Rain fell on the road. Rain fell on everything.').techniques;
    expect(rep.find((x) => x.name === 'Repetition')?.quote).toBe('Rain');
  });

  it('detects participial phrases, subordinate clauses and linking words', () => {
    const n = names('However, she stayed because it was late, closing the door behind her.');
    expect(n).toEqual(expect.arrayContaining(['Linking word', 'Subordinate clause', 'Participial phrase']));
  });

  it('every technique link points at an existing lesson', () => {
    const root = path.resolve(__dirname, '../../content/lessons');
    const linked = TECHNIQUES.filter((t) => t.lessonHref);
    expect(linked.length).toBeGreaterThan(4);
    for (const t of linked) {
      const m = /^\/labs\/(dialogue|sentences)\/([a-z0-9-]+)$/.exec(t.lessonHref!);
      expect(m, t.lessonHref!).not.toBeNull();
      expect(fs.existsSync(path.join(root, m![1], `${m![2]}.yaml`)), t.lessonHref!).toBe(true);
    }
  });

  it('technique quotes are exact substrings of the passage and each name appears once', () => {
    const text = '“Stop,” he said, laughing. She stayed because it was late. The wind moved like a ghost.';
    const r = analyseLocalPassage(setup(), text);
    for (const t of r.techniques) expect(text.includes(t.quote), t.quote).toBe(true);
    const all = r.techniques.map((t) => t.name);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('robustness', () => {
  it('never throws on empty and odd text and returns plain objects', () => {
    const db = setup([{ slug: 'vast', text: 'vast' }]);
    for (const t of ['', '   ', '...', '“', 'a'.repeat(800), '😀 😀', 'مرحبا vast بالعالم', '{tag|x}', '<script>alert(1)</script> **bold** [link](x) vast']) {
      expect(() => analyseLocalPassage(db, t), t).not.toThrow();
    }
    const r = analyseLocalPassage(db, 'A vast field.');
    expect(Object.getPrototypeOf(r.vocabulary[0])).toBe(Object.prototype);
  });

  it('is deterministic and includes sentences and stats', () => {
    const db = setup();
    const a = analyseLocalPassage(db, 'One two. Three four five.');
    expect(a).toEqual(analyseLocalPassage(db, 'One two. Three four five.'));
    expect(a.stats.sentences).toBe(2);
    expect(a.sentences).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});
