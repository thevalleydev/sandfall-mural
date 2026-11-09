import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { solvedPar } from '../src/compute-par';
import { addDays, dailyFingerprint, dailyFor, todayKey, type DailyParEntry } from '../src/daily';

/** Days of dailies to keep ready ahead of today; the scheduled deploy refreshes this weekly. */
const DAYS_AHEAD = 45;
/** Days kept behind today, for players in time zones behind UTC and links to recent dailies. */
const DAYS_BEHIND = 7;
/** Alternative collector deals to try per date before giving up. */
const MAX_DEALS = 20;

/**
 * Regenerates src/dailies.json: par for each upcoming Daily Mural. A deal is
 * only used once a bot has won it, so every daily is proven winnable; if
 * neither bot wins, the next deal for that date is tried. Entries that are
 * still valid are reused, so a weekly run only computes new days.
 * Run with `npm run dailies`.
 */
it('generates the daily par table', () => {
  const url = new URL('../src/dailies.json', import.meta.url);
  const old = JSON.parse(readFileSync(url, 'utf8')) as Record<string, DailyParEntry>;
  const today = todayKey();
  const table: Record<string, DailyParEntry> = {};
  for (let offset = -DAYS_BEHIND; offset <= DAYS_AHEAD; offset++) {
    const date = addDays(today, offset);
    const previous = old[date];
    if (previous && previous.fingerprint === dailyFingerprint(dailyFor(date, previous.deal))) {
      table[date] = previous;
      continue;
    }
    for (let deal = 0; deal < MAX_DEALS && !table[date]; deal++) {
      const daily = dailyFor(date, deal);
      const par = solvedPar(daily.def, daily.rule, daily.seed);
      if (par !== null) table[date] = { par, fingerprint: dailyFingerprint(daily), deal };
    }
    if (!table[date]) throw new Error(`No winnable deal found for the ${date} daily`);
  }
  writeFileSync(url, `${JSON.stringify(table, null, 2)}\n`);
});
