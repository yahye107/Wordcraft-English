import { describe, it, expect } from 'vitest';
import { dayKey, shiftDay, daysBetween, startOfDay, weekday, isDayKey } from '@/lib/progress/days';

describe('dayKey', () => {
  it('uses the given offset in minutes east of UTC', () => {
    expect(dayKey('2026-03-01T23:30:00Z', 120)).toBe('2026-03-02');
    expect(dayKey('2026-03-01T23:30:00Z', -300)).toBe('2026-03-01');
    expect(dayKey('2026-03-02T00:30:00Z', -60)).toBe('2026-03-01');
  });

  it('crosses month and year ends', () => {
    expect(dayKey('2026-01-31T23:30:00Z', 120)).toBe('2026-02-01');
    expect(dayKey('2026-12-31T23:30:00Z', 120)).toBe('2027-01-01');
  });

  it('uses the machine local day when no offset is given', () => {
    const d = new Date('2026-06-15T10:00:00Z');
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(dayKey(d)).toBe(local);
    expect(dayKey('2026-06-15T10:00:00Z')).toBe(local);
  });

  it('returns an empty string for unparseable input and never throws', () => {
    for (const bad of ['nonsense', '', 'NaN', '2026-13-45T99:00:00Z']) expect(dayKey(bad, 0), bad).toBe('');
    expect(dayKey(new Date('x'), 0)).toBe('');
  });
});

describe('shiftDay and daysBetween', () => {
  it('shifts across months, years and a leap day', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-11-23', 0)).toBe('2026-11-23');
    expect(shiftDay('2026-11-23', -400)).toBe('2025-10-19');
  });

  it('counts the days between two keys', () => {
    expect(daysBetween('2026-11-20', '2026-11-23')).toBe(3);
    expect(daysBetween('2026-11-23', '2026-11-20')).toBe(-3);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('startOfDay, weekday, isDayKey', () => {
  it('gives the instant a local day starts', () => {
    expect(startOfDay('2026-03-02', 120)).toBe('2026-03-01T22:00:00.000Z');
    expect(startOfDay('2026-03-02', -300)).toBe('2026-03-02T05:00:00.000Z');
    expect(new Date(startOfDay('2026-03-02')).getHours()).toBe(0);
  });

  it('numbers weekdays from Monday', () => {
    expect(weekday('2026-11-23')).toBe(0);
    expect(weekday('2026-11-29')).toBe(6);
  });

  it('validates keys', () => {
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-1-1')).toBe(false);
    expect(isDayKey('')).toBe(false);
  });
});
