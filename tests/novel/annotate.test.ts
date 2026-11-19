import { describe, it, expect } from 'vitest';
import { openDb } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { stripAnnotations } from '@/lib/annotate';
import { sanitise, splitSentences, annotatePassage } from '@/lib/novel/annotate';
import { SPEECH_VERBS, speechVerbsFromLibrary } from '@/lib/novel/speech-verbs';

const run = (t: string) => annotatePassage(t, SPEECH_VERBS);

describe('speech', () => {
  it('marks speech and a tag after the closing quote (curly and straight quotes)', () => {
    expect(run('“Come here,” she whispered.').markup).toBe('{speech|“Come here,”} {tag|she whispered.}');
    expect(run('"Come here," she whispered.').markup).toBe('{speech|"Come here,"} {tag|she whispered.}');
  });

  it('marks French and German quotes as speech', () => {
    expect(run('«Venez ici,» dit-il.').markup).toContain('{speech|«Venez ici,»}');
    expect(run('„Komm her“, flüsterte sie.').markup).toContain('{speech|„Komm her“}');
  });

  it('reads British single-quote dialogue only when the quote is properly closed', () => {
    expect(run('‘Come here,’ she whispered.').markup).toBe('{speech|‘Come here,’} {tag|she whispered.}');
    expect(run("'Come here,' she whispered.").markup).toBe("{speech|'Come here,'} {tag|she whispered.}");
    expect(run("‘I can’t go,’ she muttered.").markup).toContain('{speech|‘I can’t go,’}');
    expect(run("He said 'tis late and the dogs' bones were gone.").markup).not.toContain('{speech|');
    expect(run('She loved ‘old songs and never stopped.').markup).not.toContain('{speech|');
  });

  it('does not treat said in plain narration as a tag', () => {
    const r = run('He said nothing for a long time.');
    expect(r.markup).not.toContain('{tag|');
    expect(r.tags).toEqual([]);
  });

  it('marks a tag before the quote and a tag in the next sentence', () => {
    expect(run('She said, “Hello.”').markup).toBe('{tag|She said,} {speech|“Hello.”}');
    expect(run('“Hello.” Mara said.').markup).toBe('{speech|“Hello.”} {tag|Mara said.}');
  });

  it('marks speech with no tag as speech only', () => {
    expect(run('“Where were you last night?”').markup).toBe('{speech|“Where were you last night?”}');
  });

  it('marks a beat beside dialogue', () => {
    const r = run('“I can’t do this.” Mara slammed the door.');
    expect(r.markup).toBe('{speech|“I can’t do this.”} {beat|Mara slammed the door.}');
    expect(r.beats).toEqual(['Mara slammed the door.']);
  });

  it('does not mark a beat far from dialogue', () => {
    expect(run('Mara slammed the door.').markup).not.toContain('{beat|');
  });

  it('treats the rest of the sentence as speech when a quote is not closed', () => {
    const text = "She said, “I don't know what to do. He left.";
    const r = run(text);
    expect(r.markup).toContain("{speech|“I don't know what to do.}");
    expect(stripAnnotations(r.markup)).toBe(sanitise(text));
  });

  it('ignores apostrophes inside words', () => {
    expect(run("It's Mara's coat, isn't it?").markup).not.toContain('{speech|');
  });

  it('reports sentence kinds', () => {
    const r = run('“Hi.” Mara waved. The sun set.');
    expect(r.sentences.map((s) => s.kind)).toEqual(['dialogue', 'narration', 'narration']);
    expect(run('“Hi,” she said.').sentences[0].kind).toBe('mixed');
  });
});

describe('clauses', () => {
  it('marks a because-clause as sub and the rest as main', () => {
    const r = run('She stayed behind because it was late.');
    expect(r.markup).toBe('{main|She stayed behind} {sub|because it was late.}');
    expect(r.subordinates).toEqual(['because it was late.']);
  });

  it('marks an opening clause', () => {
    expect(run('Because it was late, they went home.').markup).toBe('{sub|Because it was late,} {main|they went home.}');
  });

  it('marks comma-set -ing phrases as part, opening and closing', () => {
    const open = run('Walking down the hall, she hummed softly.');
    expect(open.markup).toBe('{part|Walking down the hall,} {main|she hummed softly.}');
    expect(open.participles).toEqual(['Walking down the hall,']);
    expect(run('She left the room, closing the door behind her.').markup).toBe(
      '{main|She left the room,} {part|closing the door behind her.}',
    );
  });

  it('does not treat Indeed or Instead as participles', () => {
    expect(run('Indeed, nothing moved.').markup).not.toContain('{part|');
    expect(run('Instead, she waited.').markup).not.toContain('{part|');
  });

  it('marks a linking word at the sentence start', () => {
    expect(run('However, nobody came.').markup).toBe('{link|However,} nobody came.');
  });
});

describe('safety', () => {
  const passages = [
    'The rain fell all night.',
    '“Stop,” he said. “Please.” She did not.',
    'Mr. Smith met Dr. Jones at 3.5 pm. They left.',
    'She ran, jumping the fence, because the dog was close.',
    '“No.”\n“Yes.”\n\nThe end.',
    'He wrote {tag|hello} in the sand.',
    '«Oui,» dit-elle. „Nein“, sagte er.',
    '  Leading and trailing space.  ',
    'مرحبا بالعالم. كيف حالك؟',
    'Emoji 😀 here. And more… “quoted”',
  ];

  it('stripAnnotations(markup) equals the sanitised passage', () => {
    for (const p of passages) expect(stripAnnotations(run(p).markup), p).toBe(sanitise(p));
  });

  it('braces become parentheses and cannot make marks', () => {
    expect(sanitise('a {tag|x} b')).toBe('a (tag|x) b');
    const r = run('He wrote {tag|hello} in the sand.');
    expect(r.markup).not.toContain('{tag|hello}');
    expect(r.tags).toEqual([]);
  });

  it('never throws on odd input', () => {
    const odd = ['', '   ', '...', '!!!', '“', '"', '““““', '«', '„', 'a'.repeat(800), '😀😀', '\n\n\n', '”””', '.“.”.'];
    for (const p of odd) {
      expect(() => run(p), p).not.toThrow();
      expect(stripAnnotations(run(p).markup), p).toBe(sanitise(p));
    }
  });

  it('is deterministic', () => {
    for (const p of passages) expect(run(p)).toEqual(run(p));
  });
});

describe('splitSentences', () => {
  it('does not split on Mr. Dr. e.g. or decimals', () => {
    const t = 'Mr. Smith met Dr. Jones at 3.5 pm. They left.';
    expect(splitSentences(t).map((s) => s.text)).toEqual(['Mr. Smith met Dr. Jones at 3.5 pm.', 'They left.']);
    expect(splitSentences('I like fruit, e.g. apples. Then I left.').length).toBe(2);
  });

  it('keeps a closing quote with its sentence and a lower-case tag with the quote', () => {
    expect(splitSentences('“Hi.” Mara waved.').map((s) => s.text)).toEqual(['“Hi.”', 'Mara waved.']);
    expect(splitSentences('“Why?” he asked.').map((s) => s.text)).toEqual(['“Why?” he asked.']);
  });

  it('splits on new lines, never returns empty sentences, and gives start offsets', () => {
    const t = 'One.\n\nTwo!  Three?';
    const s = splitSentences(t);
    expect(s.map((x) => x.text)).toEqual(['One.', 'Two!', 'Three?']);
    for (const x of s) expect(t.slice(x.start, x.start + x.text.length)).toBe(x.text);
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(' \n ')).toEqual([]);
  });

  it('returns one sentence for a single long string', () => {
    expect(splitSentences('a'.repeat(800)).length).toBe(1);
  });
});

describe('stats', () => {
  it('counts sentences and words', () => {
    expect(run('One two three. Four five.').stats).toEqual({ sentences: 2, averageWords: 2.5, longest: 3, shortest: 2 });
    expect(run('').stats).toEqual({ sentences: 0, averageWords: 0, longest: 0, shortest: 0 });
  });
});

describe('speechVerbsFromLibrary', () => {
  it('adds single-word expressions from the dialogue-tag categories', () => {
    const db = openDb(':memory:');
    migrate(db);
    db.run("INSERT INTO categories (id, slug, name) VALUES (1, 'speaking-styles-and-dialogue-tags', 'Speaking')");
    db.run("INSERT INTO categories (id, slug, name, parent_id) VALUES (2, 'speech-attitude', 'Attitude', 1)");
    db.run("INSERT INTO categories (id, slug, name) VALUES (3, 'weather', 'Weather')");
    const add = (id: number, slug: string, text: string, cat: number, status = 'published') => {
      db.run(
        "INSERT INTO expressions (id, slug, text, kind, simple_meaning, contextual_meaning, usage_notes, register, level, status) VALUES (?, ?, ?, 'word', 'm', 'c', 'u', 'neutral', 'basic', ?)",
        [id, slug, text, status],
      );
      db.run('INSERT INTO expression_categories (expression_id, category_id, is_primary) VALUES (?, ?, 1)', [id, cat]);
    };
    add(1, 'drawled', 'Drawled', 2);
    add(2, 'drizzled', 'drizzled', 3);
    add(3, 'draft-word', 'rasped', 2, 'draft');
    const verbs = speechVerbsFromLibrary(db);
    expect(verbs.has('drawled')).toBe(true);
    expect(verbs.has('said')).toBe(true);
    expect(verbs.has('drizzled')).toBe(false);
    expect(verbs.has('rasped')).toBe(false);
  });
});
