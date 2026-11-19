import { describe, it, expect } from 'vitest';
import { newCardState, schedule, type CardState } from '@/lib/srs/schedule';

const DAY = 86_400_000;
const T0 = new Date('2026-11-20T09:00:00.000Z');
const after = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

describe('newCardState', () => {
  it('is due now with ease 2.5', () => {
    expect(newCardState(T0)).toEqual({ ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, dueAt: T0.toISOString(), lastReviewedAt: null });
  });
});

describe('schedule', () => {
  it('good gives 1 day, then 6, then ease-scaled', () => {
    let c = newCardState(T0);
    c = schedule(c, 'good', T0);
    expect(c.intervalDays).toBe(1);
    c = schedule(c, 'good', after(T0, 1));
    expect(c.intervalDays).toBe(6);
    c = schedule(c, 'good', after(T0, 7));
    expect(c.intervalDays).toBe(15);
    expect(c.reps).toBe(3);
  });

  it('again resets repetitions, adds a lapse and returns in 1 day', () => {
    let c = newCardState(T0);
    c = schedule(c, 'good', T0);
    c = schedule(c, 'good', after(T0, 1));
    c = schedule(c, 'again', after(T0, 7));
    expect(c).toMatchObject({ reps: 0, lapses: 1, intervalDays: 1 });
  });

  it('ease never drops below 1.3', () => {
    let c = newCardState(T0);
    for (let i = 0; i < 30; i++) c = schedule(c, 'again', after(T0, i));
    expect(c.ease).toBeGreaterThanOrEqual(1.3);
    expect(c.ease).toBeCloseTo(1.3);
  });

  it('easy gives a longer interval than good', () => {
    const base: CardState = { ease: 2.5, intervalDays: 6, reps: 2, lapses: 0, dueAt: T0.toISOString(), lastReviewedAt: null };
    expect(schedule(base, 'easy', T0).intervalDays).toBeGreaterThan(schedule(base, 'good', T0).intervalDays);
    const fresh = newCardState(T0);
    expect(schedule(fresh, 'easy', T0).intervalDays).toBeGreaterThan(schedule(fresh, 'good', T0).intervalDays);
  });

  it('hard is shorter than good but longer than the previous interval', () => {
    const base: CardState = { ease: 2.5, intervalDays: 6, reps: 2, lapses: 0, dueAt: T0.toISOString(), lastReviewedAt: null };
    const hard = schedule(base, 'hard', T0).intervalDays;
    expect(hard).toBeLessThan(schedule(base, 'good', T0).intervalDays);
    expect(hard).toBeGreaterThan(6);
  });

  it('keeps intervals as whole days of at least 1', () => {
    let c = newCardState(T0);
    for (const g of ['hard', 'again', 'hard', 'good', 'easy', 'hard'] as const) {
      c = schedule(c, g, T0);
      expect(Number.isInteger(c.intervalDays)).toBe(true);
      expect(c.intervalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it('sets dueAt exactly intervalDays after now and records the review time', () => {
    const c = schedule(newCardState(T0), 'good', T0);
    expect(c.dueAt).toBe(after(T0, 1).toISOString());
    expect(c.lastReviewedAt).toBe(T0.toISOString());
  });

  it('does not change its input', () => {
    const c = newCardState(T0);
    const copy = { ...c };
    schedule(c, 'good', T0);
    expect(c).toEqual(copy);
  });
});
