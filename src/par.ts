import * as config from './config';
import type { LevelDef } from './levels';
import PAR_TABLE from './par.json';
import { hashString } from './rng';
import type { Rule } from './rules';

/**
 * Par efficiency (%) for each level and rule, precomputed by `npm run par`
 * because the bots take up to several seconds per level. Each entry stores a
 * fingerprint of the level art, tuning values and scoring version it was
 * computed from; if any changes, the entry is stale, `parFor` returns null,
 * and a unit test fails until the table is regenerated.
 */
export interface ParEntry {
  par: number;
  fingerprint: string;
}

/** Bump when the bots or the scoring formula change, so old par values are treated as stale. */
const SCORING_VERSION = 2;

export function parKey(def: LevelDef, rule: Rule): string {
  return `${def.name}|${rule}`;
}

export function fingerprint(def: LevelDef, rule: Rule): string {
  // Sorted explicitly: browsers list module exports alphabetically, but Vitest lists them in source order.
  const tuning = Object.entries(config).sort(([a], [b]) => (a < b ? -1 : 1));
  return hashString(JSON.stringify([def, rule, tuning, SCORING_VERSION])).toString(36);
}

export function parFor(def: LevelDef, rule: Rule): number | null {
  const entry = (PAR_TABLE as Record<string, ParEntry>)[parKey(def, rule)];
  return entry && entry.fingerprint === fingerprint(def, rule) ? entry.par : null;
}
