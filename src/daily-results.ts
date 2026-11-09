import { addDays } from './daily';
import type { KeyValueStore } from './records';
import type { Stars } from './score';

/**
 * Daily Mural results on this device. Your official score for a day is your
 * first win; later plays of the same daily are practice and don't change it.
 * Streaks count consecutive days with an official win.
 */
export interface DailyResult {
  /** Finished attempts, counting up to and including the first win. */
  attempts: number;
  won: boolean;
  efficiency?: number;
  stars?: Stars;
  seconds?: number;
  resends?: number;
  /** Emoji moves summary of the winning run, so the official result can be re-shared later. */
  movesLine?: string;
}

export interface DailyOutcome {
  /** This attempt set the day's official score (it was the first win). */
  official: boolean;
  result: DailyResult;
  streak: Streak;
}

export interface Streak {
  current: number;
  best: number;
}

const KEY = 'sandfall.daily.v1';

export class DailyResults {
  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore = localStorage) {
    this.store = store;
  }

  get(date: string): DailyResult | undefined {
    return this.load()[date];
  }

  /** Records a finished attempt at a daily. Only today's daily counts toward results and streaks. */
  record(
    date: string,
    today: string,
    won: boolean,
    score: { efficiency: number; stars: Stars; seconds: number; resends: number; movesLine: string },
  ): DailyOutcome {
    const all = this.load();
    const previous = all[date];
    if (date !== today || previous?.won) {
      return { official: false, result: previous ?? { attempts: 0, won: false }, streak: this.streak(today) };
    }
    const result: DailyResult = { attempts: (previous?.attempts ?? 0) + 1, won, ...(won ? score : {}) };
    all[date] = result;
    this.store.setItem(KEY, JSON.stringify(all));
    return { official: won, result, streak: this.streak(today) };
  }

  /**
   * Consecutive days won up to today. A streak survives until today ends: if
   * today isn't won yet, it counts back from yesterday.
   */
  streak(today: string): Streak {
    const all = this.load();
    const wonOn = (date: string) => all[date]?.won === true;
    let current = 0;
    for (let d = wonOn(today) ? today : addDays(today, -1); wonOn(d); d = addDays(d, -1)) current++;

    let best = 0;
    let run = 0;
    let last = '';
    for (const date of Object.keys(all).filter(wonOn).sort()) {
      run = last && addDays(last, 1) === date ? run + 1 : 1;
      best = Math.max(best, run);
      last = date;
    }
    return { current, best: Math.max(best, current) };
  }

  /** Results for Monday to Sunday of the week containing `today`. */
  week(today: string): { date: string; result: DailyResult | undefined }[] {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = addDays(today, -((weekday + 6) % 7));
    const all = this.load();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return { date, result: all[date] };
    });
  }

  private load(): Record<string, DailyResult> {
    try {
      const parsed: unknown = JSON.parse(this.store.getItem(KEY) ?? '{}');
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, DailyResult>) : {};
    } catch {
      return {};
    }
  }
}
