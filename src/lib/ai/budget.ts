import type { Db } from '@/lib/db';
import { DEFAULT_MONTHLY_CAP_USD, getSetting } from '@/lib/settings';

/** USD per million tokens (input, output). Source: Anthropic published prices. */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-fable-5-2': { in: 8, out: 40 },
};
const MOST_EXPENSIVE = { in: 10, out: 50 };

/** An unknown model is priced high rather than at zero, so the spend cap stays safe. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? MOST_EXPENSIVE;
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

function monthBounds(now: Date): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: new Date(Date.UTC(y, m, 1)).toISOString(), end: new Date(Date.UTC(y, m + 1, 1)).toISOString() };
}

export function getMonthlySpendUsd(db: Db, now: Date = new Date()): number {
  const { start, end } = monthBounds(now);
  const row = db.get<{ total: number | null }>(
    'SELECT SUM(est_cost_usd) AS total FROM ai_usage WHERE created_at >= ? AND created_at < ?',
    [start, end],
  );
  return row?.total ?? 0;
}

export function getMonthlyCapUsd(db: Db): number {
  const n = Number(getSetting(db, 'monthly_cap_usd'));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_CAP_USD;
}

export function isOverBudget(db: Db, now: Date = new Date()): boolean {
  return getMonthlySpendUsd(db, now) >= getMonthlyCapUsd(db);
}
