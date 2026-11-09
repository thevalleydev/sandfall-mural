import { EMPTY, STONE, type SandGrid } from './sand';

/**
 * The open design question for the prototype: which grains can a collector reach?
 * All three are playable so the playtest can decide.
 */
export type Rule = 'line' | 'exposed' | 'top';

export const RULES: readonly { id: Rule; label: string; hint: string }[] = [
  {
    id: 'line',
    label: 'Line of fire',
    hint: 'Collectors circle the board and eat the first grains of their color they hit from each side.',
  },
  {
    id: 'exposed',
    label: 'Exposed',
    hint: 'Collectors circle the board and eat any grain of their color touching empty space, seeing through other colors.',
  },
  {
    id: 'top',
    label: 'Top only',
    hint: 'Collectors cross the top once and eat from the surface. Everything else has to fall into reach.',
  },
];

export function isRule(value: unknown): value is Rule {
  return RULES.some((r) => r.id === value);
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** One position on the belt: the cell where its ray enters the board and the direction it travels. */
export interface TrackStep {
  x: number;
  y: number;
  dx: number;
  dy: number;
  side: Side;
}

/** The belt runs clockwise around the board, or just across the top for the 'top' rule. */
export function buildTrack(w: number, h: number, rule: Rule): TrackStep[] {
  const steps: TrackStep[] = [];
  for (let x = 0; x < w; x++) steps.push({ x, y: 0, dx: 0, dy: 1, side: 'top' });
  if (rule === 'top') return steps;
  for (let y = 0; y < h; y++) steps.push({ x: w - 1, y, dx: -1, dy: 0, side: 'right' });
  for (let x = w - 1; x >= 0; x--) steps.push({ x, y: h - 1, dx: 0, dy: -1, side: 'bottom' });
  for (let y = h - 1; y >= 0; y--) steps.push({ x: 0, y, dx: 1, dy: 0, side: 'left' });
  return steps;
}

/**
 * Casts one ray inward from a track step and finds up to `limit` grains of `color`
 * that the rule allows the collector to eat. When `eat` is true they are removed
 * and their cell indexes pushed to `out`. Returns how many were (or would be) eaten.
 */
export function castRay(
  grid: SandGrid,
  step: TrackStep,
  color: number,
  rule: Rule,
  limit: number,
  eat: boolean,
  out?: number[],
): number {
  let n = 0;
  let x = step.x;
  let y = step.y;
  while (n < limit && grid.inBounds(x, y)) {
    const c = grid.get(x, y);
    if (c === STONE) break;
    if (c === color) {
      if (rule !== 'exposed' || isExposed(grid, x, y)) {
        n++;
        if (eat) {
          grid.remove(x, y);
          out?.push(y * grid.width + x);
        }
      }
    } else if (c !== EMPTY && rule !== 'exposed') {
      // Another color blocks the line of fire.
      break;
    }
    x += step.dx;
    y += step.dy;
  }
  return n;
}

/** A grain is exposed if a neighbor is empty or it sits on the board edge (the belt runs along every edge). */
function isExposed(grid: SandGrid, x: number, y: number): boolean {
  return open(grid, x, y - 1) || open(grid, x + 1, y) || open(grid, x, y + 1) || open(grid, x - 1, y);
}

function open(grid: SandGrid, x: number, y: number): boolean {
  return !grid.inBounds(x, y) || grid.get(x, y) === EMPTY;
}

/** Could a collector of this color eat anything on one lap, given the board as it is now? */
export function canEatAnywhere(grid: SandGrid, track: TrackStep[], color: number, rule: Rule): boolean {
  return track.some((step) => castRay(grid, step, color, rule, 1, false) > 0);
}
