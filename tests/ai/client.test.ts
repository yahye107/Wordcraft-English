import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { AiUnavailableError, askClaude, setMockResponder } from '@/lib/ai/client';
import { estimateCostUsd, getMonthlySpendUsd, isOverBudget } from '@/lib/ai/budget';
import { setSetting } from '@/lib/settings';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('WORDCRAFT_AI_MOCK', '');
  setMockResponder(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setMockResponder(null);
});

const schema = z.object({ a: z.number() });
const ask = () => askClaude({ db, feature: 'test', system: 's', user: 'u', schema });

describe('askClaude', () => {
  it('throws AiUnavailableError when no key is set', async () => {
    await expect(ask()).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('returns parsed output from the mock responder and logs usage', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(async () => ({ text: '{"a":1}', inputTokens: 1000, outputTokens: 500 }));
    await expect(ask()).resolves.toEqual({ a: 1 });
    const row = db.get<{ feature: string; input_tokens: number; output_tokens: number; est_cost_usd: number }>(
      'SELECT feature, input_tokens, output_tokens, est_cost_usd FROM ai_usage',
    )!;
    expect(row).toMatchObject({ feature: 'test', input_tokens: 1000, output_tokens: 500 });
    expect(row.est_cost_usd).toBeGreaterThan(0);
  });

  it('pulls JSON out of prose or a code fence', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(async () => ({ text: 'Here you go:\n```json\n{"a": 7}\n```', inputTokens: 1, outputTokens: 1 }));
    await expect(ask()).resolves.toEqual({ a: 7 });
  });

  it('throws AiUnavailableError when the output does not match the schema', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(async () => ({ text: '{"a":"not a number"}', inputTokens: 1, outputTokens: 1 }));
    await expect(ask()).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('throws AiUnavailableError when the output is not JSON at all', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(async () => ({ text: 'sorry, no', inputTokens: 1, outputTokens: 1 }));
    await expect(ask()).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('wraps a failing responder as AiUnavailableError', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(async () => { throw new Error('network down'); });
    await expect(ask()).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('refuses to call once the monthly cap is reached', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    const responder = vi.fn(async () => ({ text: '{"a":1}', inputTokens: 1, outputTokens: 1 }));
    setMockResponder(responder);
    setSetting(db, 'monthly_cap_usd', '1');
    db.run("INSERT INTO ai_usage (feature, model, est_cost_usd) VALUES ('x', 'm', 1.5)");
    await expect(ask()).rejects.toBeInstanceOf(AiUnavailableError);
    expect(responder).not.toHaveBeenCalled();
  });
});

describe('budget', () => {
  it('is over budget once spend reaches the cap, and not in the next calendar month', () => {
    db.run("INSERT INTO ai_usage (feature, model, est_cost_usd, created_at) VALUES ('x','m',5,'2026-11-10T12:00:00.000Z')");
    expect(getMonthlySpendUsd(db, new Date('2026-11-19T00:00:00Z'))).toBe(5);
    expect(isOverBudget(db, new Date('2026-11-19T00:00:00Z'))).toBe(true); // default cap is 5
    expect(isOverBudget(db, new Date('2026-12-01T00:00:00Z'))).toBe(false);
  });

  it('uses the cap from settings', () => {
    db.run("INSERT INTO ai_usage (feature, model, est_cost_usd, created_at) VALUES ('x','m',5,'2026-11-10T12:00:00.000Z')");
    setSetting(db, 'monthly_cap_usd', '20');
    expect(isOverBudget(db, new Date('2026-11-19T00:00:00Z'))).toBe(false);
  });

  it('estimates cost per million tokens for known models', () => {
    expect(estimateCostUsd('claude-sonnet-5-5', 1_000_000, 0)).toBeCloseTo(2);
    expect(estimateCostUsd('claude-sonnet-5-5', 0, 1_000_000)).toBeCloseTo(10);
    expect(estimateCostUsd('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6);
  });

  it('estimates an unknown model at the most expensive known rate rather than zero', () => {
    expect(estimateCostUsd('some-new-model', 1_000_000, 0)).toBeGreaterThan(0);
  });
});
