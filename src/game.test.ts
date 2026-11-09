import { describe, expect, it } from 'vitest';
import { playGreedy } from './bots';
import { Game } from './game';
import { buildLevel, splitCapacity } from './level';
import { LEVELS } from './levels';
import { mulberry32 } from './rng';
import { buildTrack, castRay, RULES, type Rule } from './rules';
import { EMPTY, SandGrid, STONE } from './sand';

function settle(grid: SandGrid): void {
  for (let i = 0; i < 1000 && grid.step(); i++);
}

describe('SandGrid', () => {
  it('drops a grain to the floor', () => {
    const grid = new SandGrid(3, 5, 1);
    grid.set(1, 0, 1);
    settle(grid);
    expect(grid.get(1, 4)).toBe(1);
    expect(grid.get(1, 0)).toBe(EMPTY);
    expect(grid.settled).toBe(true);
  });

  it('never moves stone and conserves grains', () => {
    const grid = new SandGrid(10, 10, 7);
    grid.set(5, 5, STONE);
    for (let x = 0; x < 10; x++) grid.set(x, 0, 1 + (x % 3));
    settle(grid);
    expect(grid.get(5, 5)).toBe(STONE);
    expect(grid.remaining).toBe(10);
    expect([...grid.colorCounts().values()].reduce((a, b) => a + b)).toBe(10);
  });

  it('is deterministic for the same seed', () => {
    const run = () => {
      const grid = new SandGrid(20, 20, 42);
      for (let x = 0; x < 20; x++) for (let y = 0; y < 5; y++) grid.set(x, y, 1);
      grid.set(10, 19, STONE);
      settle(grid);
      return Array.from(grid.cells);
    };
    expect(run()).toEqual(run());
  });
});

describe('rules', () => {
  // Column of [red, blue, red] from the top, in a 1-wide board.
  const column = () => {
    const grid = new SandGrid(1, 3, 1);
    grid.set(0, 0, 1);
    grid.set(0, 1, 2);
    grid.set(0, 2, 1);
    return grid;
  };
  const down = { x: 0, y: 0, dx: 0, dy: 1, side: 'top' as const };

  it('line of fire stops at another color', () => {
    const grid = column();
    expect(castRay(grid, down, 1, 'line', 10, true)).toBe(1);
    expect(grid.get(0, 2)).toBe(1);
  });

  it('exposed sees through other colors', () => {
    expect(castRay(column(), down, 1, 'exposed', 10, true)).toBe(2);
  });

  it('top-only track crosses the top once', () => {
    expect(buildTrack(6, 4, 'top')).toHaveLength(6);
    expect(buildTrack(6, 4, 'line')).toHaveLength(20);
  });
});

describe('levels', () => {
  it('splits capacity exactly', () => {
    const rng = mulberry32(3);
    for (const total of [1, 9, 250, 1234, 5000]) {
      expect(splitCapacity(total, 200, rng).reduce((a, b) => a + b)).toBe(total);
    }
  });

  it.each(LEVELS.map((l) => [l.name, l] as const))('%s: collectors match grain counts', (_, def) => {
    const { grid, lanes } = buildLevel(def);
    const capacity = new Map<number, number>();
    for (const c of lanes.flat()) capacity.set(c.color, (capacity.get(c.color) ?? 0) + c.capacity);
    expect(capacity).toEqual(grid.colorCounts());
  });
});

describe('greedy playthrough', () => {
  const cases = LEVELS.flatMap((def) => RULES.map((r) => [def.name, r.id, def] as const));
  it.each(cases)('%s (%s) is winnable', (_, rule, def) => {
    const game = playGreedy(new Game(def, rule as Rule));
    expect({ state: game.state, reason: game.loseReason, left: game.grid.remaining }).toEqual({
      state: 'won',
      reason: null,
      left: 0,
    });
  });
});

describe('replay', () => {
  const def = LEVELS.find((l) => l.name === 'Mushroom')!;

  it('reproduces a game exactly from its moves and their ticks', () => {
    const played = playGreedy(new Game(def, 'line'));
    const replayed = new Game(def, 'line').replay(played.moves, played.tickCount + 1);
    expect(replayed.state).toBe(played.state);
    expect(replayed.tickCount).toBe(played.tickCount);
    expect(replayed.moves).toEqual(played.moves);
    expect(Array.from(replayed.grid.cells)).toEqual(Array.from(played.grid.cells));
  });

  it('depends on timing between moves, not just their order', () => {
    const played = playGreedy(new Game(def, 'line'));
    const k = 5;
    // Same moves in the same order, but from move k on, each is made a third of a second later.
    // (Delaying every move equally would just start the whole game later and change nothing.)
    const delay = 20;
    const late = played.moves.map((m, i) => (i >= k ? { ...m, tick: m.tick + delay } : m));
    const checkpoint = played.moves[k + 3]!.tick;
    const original = new Game(def, 'line').replay(played.moves, checkpoint);
    const delayed = new Game(def, 'line').replay(late, checkpoint + delay);
    // If only order mattered, the delayed game would be in the same position, just later.
    expect(Array.from(delayed.grid.cells)).not.toEqual(Array.from(original.grid.cells));
  });
});
