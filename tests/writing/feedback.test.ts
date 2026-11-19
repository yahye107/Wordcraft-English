import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { setMockResponder } from '@/lib/ai/client';
import { createSession, getSession } from '@/lib/writing/sessions';
import { submitForFeedback, setHintLevel, markResolved } from '@/lib/writing/feedback';
import { getWeaknesses, getProgress, getUsedExpressions } from '@/lib/writing/stats';

let db: Db;
let calls = 0;
beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  calls = 0;
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
  setMockResponder(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setMockResponder(null);
});

const sid = (mode = 'paragraph') => {
  const s = createSession(db, { mode });
  if (!s.ok) throw new Error('session failed');
  return s.id;
};
const weak = (k: string) => db.get<{ count: number }>('SELECT count FROM weakness_stats WHERE key = ?', [k])?.count ?? 0;

const T1 = 'She was very sad and it was a good day. The good thing was the rain.';
const T2 = 'She was heartbroken and it was a lovely day. The rain was the best part.';

const aiReply = (issues: unknown[]) => async () => {
  calls++;
  return { text: JSON.stringify({ issues, strengths: ['Nice start.'], overall: 'Fine.', nextStep: 'Revise.' }), inputTokens: 1, outputTokens: 1 };
};
const aiIssue = (quote: string, type = 'tone-shift') => ({
  category: 'tone', type, quote, why: 'Why.', hint1: 'Look here.', hint2: 'The rule.', hint3: 'Try something.',
});

describe('submitForFeedback', () => {
  it('stores local issues on a first submission and counts weaknesses once', async () => {
    const id = sid();
    const r = await submitForFeedback(db, id, T1, { useAi: false });
    if (!r.ok) throw new Error(r.error);
    expect(r.version).toBe(1);
    expect(r.aiUsed).toBe(false);
    expect(r.aiNote).toContain('Local checks only');
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues.every((i) => T1.includes(i.quote))).toBe(true);
    expect(weak('vocabulary:very')).toBe(1);
  });

  it('returns stored feedback for identical text without an AI call or a count change', async () => {
    const id = sid();
    setMockResponder(aiReply([aiIssue('She')]));
    const a = await submitForFeedback(db, id, T1, { useAi: true });
    const countBefore = weak('vocabulary:very');
    const b = await submitForFeedback(db, id, T1, { useAi: true });
    if (!a.ok || !b.ok) throw new Error('failed');
    expect(calls).toBe(1);
    expect(b.duplicate).toBe(true);
    expect(b.issues.map((i) => i.quote)).toEqual(a.issues.map((i) => i.quote));
    expect(b.strengths).toEqual(['Nice start.']);
    expect(weak('vocabulary:very')).toBe(countBefore);
    expect(getSession(db, id)!.revisions).toHaveLength(1);
  });

  it('creates version 2 for changed text and reports progress', async () => {
    const id = sid();
    await submitForFeedback(db, id, T1, { useAi: false });
    const r = await submitForFeedback(db, id, T2, { useAi: false });
    if (!r.ok) throw new Error(r.error);
    expect(r.version).toBe(2);
    expect(r.progress).not.toBeNull();
    expect(r.progress!.resolved).toBeGreaterThan(0);
    expect(r.progress!.remaining).toBe(r.issues.length);
  });

  it('counts an earlier issue as resolved when its quote has gone', async () => {
    const id = sid();
    await submitForFeedback(db, id, 'We went to the the market today.', { useAi: false });
    const r = await submitForFeedback(db, id, 'We went to the market today.', { useAi: false });
    if (!r.ok) throw new Error(r.error);
    expect(r.progress!.resolved).toBe(1);
    const first = getSession(db, id)!.revisions[0].issues.find((i) => i.key === 'grammar:doubled-word')!;
    expect(first.resolved).toBe(true);
  });

  it('never calls the responder when useAi is false', async () => {
    setMockResponder(async () => {
      throw new Error('the AI must not be called');
    });
    const r = await submitForFeedback(db, sid(), T1, { useAi: false });
    expect(r.ok).toBe(true);
  });

  it('stores local feedback with an explanatory note when there is no key', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '');
    const r = await submitForFeedback(db, sid(), T1, { useAi: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.aiUsed).toBe(false);
    expect(r.aiNote).toContain('ANTHROPIC_API_KEY');
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('merges AI and local issues with the same quote into one', async () => {
    setMockResponder(aiReply([aiIssue('very sad', 'weak-intensifier')]));
    const r = await submitForFeedback(db, sid(), T1, { useAi: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.aiUsed).toBe(true);
    expect(r.issues.filter((i) => i.quote === 'very sad')).toHaveLength(1);
    expect(r.issues.find((i) => i.quote === 'very sad')!.source).toBe('ai');
    expect(r.strengths).toEqual(['Nice start.']);
  });

  it('stores no more than 10 issues', async () => {
    const many = Array.from({ length: 8 }, (_, i) => aiIssue(`word${i}`, `t${i}`));
    const text = many.map((m) => m.quote).join(' ') + ' very good very bad. Then we ran. Then we sat. Then we left.';
    setMockResponder(aiReply(many));
    const r = await submitForFeedback(db, sid(), text, { useAi: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.issues.length).toBeLessThanOrEqual(10);
  });

  it('rejects empty text and an unknown session', async () => {
    expect((await submitForFeedback(db, sid(), '  ', { useAi: false })).ok).toBe(false);
    expect((await submitForFeedback(db, 999, 'Text.', { useAi: false })).ok).toBe(false);
  });
});

describe('hint levels and resolving', () => {
  it('setHintLevel only raises the level', async () => {
    const id = sid();
    const r = await submitForFeedback(db, id, T1, { useAi: false });
    if (!r.ok) throw new Error(r.error);
    const fid = r.issues[0].id;
    expect(setHintLevel(db, fid, 3).ok).toBe(true);
    expect(setHintLevel(db, fid, 2).ok).toBe(true);
    expect(getSession(db, id)!.revisions[0].issues[0].hintLevelShown).toBe(3);
    expect(setHintLevel(db, fid, 9 as never).ok).toBe(false);
    expect(setHintLevel(db, 99999, 2).ok).toBe(false);
  });

  it('markResolved sets the flag', async () => {
    const id = sid();
    const r = await submitForFeedback(db, id, T1, { useAi: false });
    if (!r.ok) throw new Error(r.error);
    expect(markResolved(db, r.issues[0].id).ok).toBe(true);
    expect(getSession(db, id)!.revisions[0].issues[0].resolved).toBe(true);
  });
});

describe('stats', () => {
  it('lists recurring weaknesses (3 or more) with labels', async () => {
    for (let i = 0; i < 3; i++) {
      const id = sid();
      await submitForFeedback(db, id, `Day ${i}: it was very good.`, { useAi: false });
    }
    const w = getWeaknesses(db);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].count).toBeGreaterThanOrEqual(3);
    expect(w[0].label.length).toBeGreaterThan(0);
  });

  it('does not list a weakness seen fewer than 3 times', async () => {
    await submitForFeedback(db, sid(), 'It was very good.', { useAi: false });
    expect(getWeaknesses(db)).toEqual([]);
  });

  it('returns issues per 100 words per session', async () => {
    const id = sid();
    await submitForFeedback(db, id, T1, { useAi: false });
    const p = getProgress(db);
    expect(p).toHaveLength(1);
    expect(p[0].issuesPer100Words).toBeGreaterThan(0);
    expect(p[0].sessionId).toBe(id);
  });

  it('finds inflected forms of the expressions that were asked for', () => {
    db.run("INSERT INTO expressions (slug, text, kind, simple_meaning, contextual_meaning, usage_notes, register, level) VALUES ('whispered','whispered','word','m','c','u','neutral','beginner')");
    expect(getUsedExpressions(db, 'She whispers to him.', ['whispered', 'ghost'])).toEqual(['whispered']);
    expect(getUsedExpressions(db, 'Nothing here.', ['whispered'])).toEqual([]);
  });
});
