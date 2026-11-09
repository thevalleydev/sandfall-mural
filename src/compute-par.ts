import { playGreedy, playPlanner } from './bots';
import { Game } from './game';
import type { LevelDef } from './levels';
import type { Rule } from './rules';
import { gameEfficiency } from './score';

// Kept out of score.ts so the browser bundle doesn't include the bots; only `npm run par`, `npm run dailies` and the balance report use this.

/**
 * Par is the best efficiency either bot reaches. It's the same for every
 * player on every device, because the simulation is deterministic, so it's a
 * fair thing to share and compare. The planner is cut off once it has used as
 * many moves as the greedy bot (more moves almost always means more waste),
 * which keeps `npm run par` fast. Falls back to 50% if neither bot wins
 * (tests check every level, so this shouldn't happen).
 */
export function computePar(def: LevelDef, rule: Rule, seed?: number): number {
  return solvedPar(def, rule, seed) ?? 50;
}

/** Par, or null if neither bot can win: the puzzle isn't proven winnable. */
export function solvedPar(def: LevelDef, rule: Rule, seed?: number): number | null {
  const greedy = playGreedy(new Game(def, rule, seed));
  const greedyWon = greedy.state === 'won';
  const planner = playPlanner(new Game(def, rule, seed), greedyWon ? greedy.stats.deploys : Infinity);
  const wins = [greedy, planner].filter((g) => g.state === 'won').map(gameEfficiency);
  return wins.length ? Math.max(...wins) : null;
}
