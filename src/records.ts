import type { LevelDef } from './levels';
import type { Rule } from './rules';
import type { Stars } from './score';

/** Personal bests per level and rule, kept on this device. */
export interface Attempt {
  /** Efficiency percent (higher is better). */
  efficiency: number;
  resends: number;
  seconds: number;
  stars: Stars;
}

export interface LevelRecord {
  plays: number;
  wins: number;
  bestEfficiency: number | null;
  bestSeconds: number | null;
  bestStars: Stars;
  /** Most recent wins, oldest first. */
  recent: Attempt[];
}

export interface ResultSummary {
  before: LevelRecord;
  after: LevelRecord;
  firstClear: boolean;
  newBestEfficiency: boolean;
  newBestTime: boolean;
}

/** The subset of localStorage this module uses, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** v2: scored by efficiency. v1 records (scored by moves) are ignored. */
const KEY = 'sandfall.records.v2';
const RECENT_LIMIT = 10;

const EMPTY_RECORD: LevelRecord = { plays: 0, wins: 0, bestEfficiency: null, bestSeconds: null, bestStars: 0, recent: [] };

export class Records {
  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore = localStorage) {
    this.store = store;
  }

  get(def: LevelDef, rule: Rule): LevelRecord {
    return this.load()[key(def, rule)] ?? structuredClone(EMPTY_RECORD);
  }

  /** Records a finished attempt and reports what changed. */
  add(def: LevelDef, rule: Rule, won: boolean, attempt: Attempt): ResultSummary {
    const all = this.load();
    const before = all[key(def, rule)] ?? structuredClone(EMPTY_RECORD);
    const after: LevelRecord = structuredClone(before);
    after.plays++;
    if (won) {
      after.wins++;
      after.bestEfficiency = Math.max(attempt.efficiency, before.bestEfficiency ?? -Infinity);
      after.bestSeconds = Math.min(attempt.seconds, before.bestSeconds ?? Infinity);
      after.bestStars = Math.max(attempt.stars, before.bestStars) as Stars;
      after.recent = [...before.recent, attempt].slice(-RECENT_LIMIT);
    }
    all[key(def, rule)] = after;
    this.store.setItem(KEY, JSON.stringify(all));
    return {
      before,
      after,
      firstClear: won && before.wins === 0,
      newBestEfficiency: won && before.bestEfficiency !== null && attempt.efficiency > before.bestEfficiency,
      newBestTime: won && before.bestSeconds !== null && attempt.seconds < before.bestSeconds,
    };
  }

  private load(): Record<string, LevelRecord> {
    try {
      const parsed: unknown = JSON.parse(this.store.getItem(KEY) ?? '{}');
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, LevelRecord>) : {};
    } catch {
      return {};
    }
  }
}

function key(def: LevelDef, rule: Rule): string {
  return `${def.name}|${rule}`;
}
