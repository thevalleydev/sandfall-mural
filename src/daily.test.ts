import { describe, expect, it } from 'vitest';
import { addDays, dailyFingerprint, dailyFor, dailyPar, DAILY_RULE, isDateKey, todayKey, type DailyParEntry } from './daily';
import DAILY_TABLE from './dailies.json';
import { DailyResults } from './daily-results';
import type { KeyValueStore } from './records';

const memory = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};
const score = { efficiency: 90, stars: 2 as const, seconds: 40, resends: 1, movesLine: '🟦' };

describe('daily selection', () => {
  it('numbers dailies from the epoch and uses the daily rule', () => {
    const first = dailyFor('2026-11-09');
    expect(first).toMatchObject({ number: 1, weekday: 'Mon', tier: 'easy', rule: DAILY_RULE });
    expect(dailyFor('2026-11-10').number).toBe(2);
  });

  it('is the same puzzle for everyone on a date, and a different deal on other dates', () => {
    expect(dailyFor('2026-11-20')).toEqual(dailyFor('2026-11-20'));
    expect(dailyFor('2026-11-20').seed).not.toBe(dailyFor('2026-11-21').seed);
  });

  it('gets harder through the week', () => {
    const tiers = Array.from({ length: 7 }, (_, i) => dailyFor(addDays('2026-11-09', i)).tier);
    expect(tiers).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'hard']);
  });

  it('handles dates and month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US daylight saving change
    expect(isDateKey('2026-11-09')).toBe(true);
    expect(isDateKey('nope')).toBe(false);
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('daily par table', () => {
  it('only holds entries that match their daily (run `npm run dailies` if this fails)', () => {
    const stale = Object.entries(DAILY_TABLE as Record<string, DailyParEntry>)
      .filter(([date, entry]) => entry.fingerprint !== dailyFingerprint(dailyFor(date, entry.deal)))
      .map(([date]) => date);
    expect(stale).toEqual([]);
    for (const date of Object.keys(DAILY_TABLE)) expect(dailyPar(dailyFor(date))).not.toBeNull();
  });
});

describe('daily results', () => {
  it('makes the first win official and later plays practice', () => {
    const results = new DailyResults(memory());
    const day = '2026-11-12';
    expect(results.record(day, day, false, score)).toMatchObject({ official: false, result: { attempts: 1, won: false } });
    expect(results.record(day, day, true, score)).toMatchObject({ official: true, result: { attempts: 2, won: true, efficiency: 90 } });
    const practice = results.record(day, day, true, { ...score, efficiency: 99 });
    expect(practice.official).toBe(false);
    expect(results.get(day)).toMatchObject({ attempts: 2, efficiency: 90 });
  });

  it('only counts today’s daily', () => {
    const results = new DailyResults(memory());
    expect(results.record('2026-11-10', '2026-11-12', true, score).official).toBe(false);
    expect(results.get('2026-11-10')).toBeUndefined();
  });

  it('counts streaks of consecutive won days, alive until today ends', () => {
    const results = new DailyResults(memory());
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']) results.record(day, day, true, score);
    // Not played today (the 7th) yet: the streak from the 5th and 6th is still alive.
    expect(results.streak('2026-11-07')).toEqual({ current: 2, best: 3 });
    // Missed a whole day: the streak is gone.
    expect(results.streak('2026-11-08').current).toBe(0);
  });

  it('lays out the current week from Monday', () => {
    const results = new DailyResults(memory());
    results.record('2026-11-11', '2026-11-11', true, score);
    const week = results.week('2026-11-12');
    expect(week.map((d) => d.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(week[2]!.result?.won).toBe(true);
  });
});
