import type { Game } from './game';

export type Stars = 0 | 1 | 2 | 3;

/** How far below par efficiency (in percentage points) still earns two stars. */
const TWO_STAR_POINTS = 10;

/**
 * Efficiency: the grains in the picture as a share of all the capacity you
 * sent around the belt. First trips carry exactly the picture's grains, so
 * only re-sends lower it, each by however much that collector still had left.
 * A near-miss barely costs anything; a badly timed re-send costs a lot.
 * 100% means nothing was ever re-sent.
 *
 * Floored to one decimal so only a truly perfect run shows 100%.
 */
export function efficiency(grainCount: number, wasted: number): number {
  return Math.floor((1000 * grainCount) / (grainCount + wasted)) / 10;
}

export function gameEfficiency(game: Game): number {
  return efficiency(game.grainCount, game.wasted);
}

/** ★★★ at or above par efficiency, ★★ within 10 points of it, ★ for any win. */
export function starsFor(won: boolean, efficiencyPercent: number, par: number): Stars {
  if (!won) return 0;
  if (efficiencyPercent >= par) return 3;
  if (efficiencyPercent >= par - TWO_STAR_POINTS) return 2;
  return 1;
}

export function twoStarThreshold(par: number): number {
  return Math.round((par - TWO_STAR_POINTS) * 10) / 10;
}

export function starString(stars: Stars): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}
