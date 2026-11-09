import { BITE } from './config';
import { Game } from './game';
import type { Collector } from './level';
import type { Rng } from './rng';
import { canEatAnywhere, castRay } from './rules';

/** Upper bound on a simulated attempt: 10 minutes of game time. */
const MAX_TICKS = 60 * 60 * 10;

/**
 * Greedy bot: deploys the first slot or lane-front collector that can eat
 * something now, otherwise any lane front (if a slot is free to catch it).
 * Stands in for a player who plans one move ahead.
 */
export function playGreedy(game: Game): Game {
  return play(game, () => {
    const eats = (color: number) => canEatAnywhere(game.grid, game.track, color, game.rule);
    const slot = game.slots.findIndex((c) => c && eats(c.color));
    if (slot >= 0) return game.deployFromSlot(slot);
    const lane = game.lanes.findIndex((l) => l[0] && eats(l[0].color));
    if (lane >= 0) return game.deployFromLane(lane);
    if (game.belt.length === 0 && game.slots.includes(null)) {
      return game.deployFromLane(game.lanes.findIndex((l) => l.length > 0));
    }
    return false;
  });
}

/** Random bot: taps any available collector as soon as the belt has room. Stands in for "tap and hope". */
export function playRandom(game: Game, rng: Rng): Game {
  return play(game, () => {
    const moves: (() => boolean)[] = [];
    game.slots.forEach((c, i) => c && moves.push(() => game.deployFromSlot(i)));
    game.lanes.forEach((l, i) => l.length && moves.push(() => game.deployFromLane(i)));
    return moves.length > 0 && moves[Math.floor(rng() * moves.length)]!();
  });
}

/**
 * Planner bot: estimates how much of each available collector's capacity one
 * lap would use, and sends the best fit. While collectors are still on the
 * belt it waits for one that would empty in a single lap, since the board
 * keeps opening up. Used to set each level's par.
 */
export function playPlanner(game: Game, maxMoves = Infinity): Game {
  return play(
    game,
    () => {
      const options: { fill: number; deploy: () => boolean }[] = [];
      game.slots.forEach((c, i) => c && options.push({ fill: lapFill(game, c), deploy: () => game.deployFromSlot(i) }));
      game.lanes.forEach((l, i) => l[0] && options.push({ fill: lapFill(game, l[0]), deploy: () => game.deployFromLane(i) }));
      const best = options.reduce<(typeof options)[number] | null>((a, b) => (!a || b.fill > a.fill ? b : a), null);
      if (!best) return false;
      if (best.fill >= 1) return best.deploy();
      if (game.belt.length > 0) return false;
      if (best.fill > 0) return best.deploy();
      // Nothing can eat: cycle a fresh lane collector into a slot (a parked one would just come back).
      const lane = game.lanes.findIndex((l) => l.length > 0);
      return lane >= 0 && game.slots.includes(null) && game.deployFromLane(lane);
    },
    maxMoves,
  );
}

/** Rough share of a collector's capacity it would use in one lap on the board as it is now (ignores falling sand). */
function lapFill(game: Game, collector: Collector): number {
  let reachable = 0;
  for (const step of game.track) {
    reachable += castRay(game.grid, step, collector.color, game.rule, BITE, false);
    if (reachable >= collector.capacity) return 1;
  }
  return reachable / collector.capacity;
}

/** Runs a bot until the game ends, time runs out, or it has used `maxMoves` moves without winning. */
function play(game: Game, move: () => boolean, maxMoves = Infinity): Game {
  while (game.state === 'playing' && game.tickCount < MAX_TICKS) {
    if (game.canDeploy && game.grid.settled) {
      if (game.stats.deploys >= maxMoves) break;
      move();
    }
    game.tick();
  }
  return game;
}
