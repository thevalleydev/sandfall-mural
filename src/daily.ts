import DAILY_TABLE from './dailies.json';
import { LEVELS, type LevelDef } from './levels';
import { fingerprint } from './par';
import { hashString } from './rng';
import type { Rule } from './rules';

/**
 * The Daily Mural: one puzzle per calendar day, the same for everyone. The
 * date picks a picture (harder later in the week) and seeds a fresh collector
 * deal, so even a familiar picture is a new puzzle. Par for upcoming days is
 * precomputed into dailies.json by `npm run dailies` (a scheduled GitHub
 * Action keeps it 45 days ahead).
 */

/** The reach rule every daily uses. Change it once the playtest picks a winner, then run `npm run dailies`. */
export const DAILY_RULE: Rule = 'top';
/** Date of Daily Mural #1. */
const EPOCH = '2026-11-09';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type Tier = 'easy' | 'medium' | 'hard';

/** Pictures by difficulty under Top only, from the balance report (how often a random tapper wins). */
const TIERS: Record<Tier, string[]> = {
  easy: ['First Light', 'Landslide', 'Sunset'],
  medium: ['Heart', 'Pillars', 'Fish'],
  hard: ['Tree', 'Tricolour', 'Mushroom', 'Rainbow'],
};
/** Indexed by Date.getDay() (Sunday first): easy Mon–Tue, medium Wed–Thu, hard Fri–Sun. */
const WEEKDAY_TIER: readonly Tier[] = ['hard', 'easy', 'easy', 'medium', 'medium', 'hard', 'hard'];

export interface Daily {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Daily Mural number; #1 is the epoch date. */
  number: number;
  weekday: (typeof WEEKDAYS)[number];
  tier: Tier;
  def: LevelDef;
  seed: number;
  rule: Rule;
}

/**
 * The daily for a date. `deal` picks among alternative collector deals for the
 * same date; the generator moves to the next deal when the bots can't prove a
 * deal winnable, and records which one it used in dailies.json, so by default
 * this uses the recorded deal.
 */
export function dailyFor(date: string, deal = recordedDeal(date)): Daily {
  const day = utcDay(date);
  const weekday = new Date(day * 86_400_000).getUTCDay();
  const tier = WEEKDAY_TIER[weekday]!;
  const names = TIERS[tier];
  const name = names[hashString(`pick:${date}`) % names.length]!;
  return {
    date,
    number: day - utcDay(EPOCH) + 1,
    weekday: WEEKDAYS[weekday]!,
    tier,
    def: LEVELS.find((l) => l.name === name)!,
    seed: hashString(deal === 0 ? `daily:${date}` : `daily:${date}:${deal}`),
    rule: DAILY_RULE,
  };
}

function recordedDeal(date: string): number {
  return (DAILY_TABLE as Record<string, DailyParEntry>)[date]?.deal ?? 0;
}

/** Today's date in the player's own time zone, like Wordle. */
export function todayKey(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(utcDay(value));
}

export function addDays(date: string, days: number): string {
  return new Date((utcDay(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD key, independent of time zone and daylight saving. */
function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

// --- Par ---

export interface DailyParEntry {
  par: number;
  fingerprint: string;
  /** Which collector deal for this date (see dailyFor); 0 unless the first deal wasn't proven winnable. */
  deal: number;
}

/** Changes if the picture, rule, tuning, scoring version or seed changes, which makes a stored par stale. */
export function dailyFingerprint(daily: Daily): string {
  return hashString(JSON.stringify([fingerprint(daily.def, daily.rule), daily.seed])).toString(36);
}

export function dailyPar(daily: Daily): number | null {
  const entry = (DAILY_TABLE as Record<string, DailyParEntry>)[daily.date];
  return entry && entry.fingerprint === dailyFingerprint(daily) ? entry.par : null;
}
