import { mulberry32, type Rng } from './rng';

export const EMPTY = 0;
export const STONE = 255;

/**
 * Falling-sand grid. Each cell holds EMPTY, a palette index (1..254), or STONE.
 * Grains fall straight down, or slide diagonally when blocked. Stone never moves.
 */
export class SandGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  /** Per-grain texture variation; it moves with the grain. */
  readonly shade: Uint8Array;
  private readonly rng: Rng;
  private scanLeft = false;
  /** False once a step moves nothing, until the grid is edited again. */
  private dirty = true;
  private grains = 0;

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
    this.shade = new Uint8Array(width * height);
    this.rng = mulberry32(seed);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): number {
    return this.cells[y * this.width + x]!;
  }

  set(x: number, y: number, value: number, shade = 0): void {
    const i = y * this.width + x;
    const old = this.cells[i]!;
    if (isGrain(old)) this.grains--;
    if (isGrain(value)) this.grains++;
    this.cells[i] = value;
    this.shade[i] = shade;
    this.dirty = true;
  }

  remove(x: number, y: number): void {
    this.set(x, y, EMPTY);
  }

  /** Colored grains left on the board (stone excluded). */
  get remaining(): number {
    return this.grains;
  }

  /** True when nothing moved on the last step and nothing was edited since. */
  get settled(): boolean {
    return !this.dirty;
  }

  /** Advances gravity by one cell. Returns true if any grain moved. */
  step(): boolean {
    if (!this.dirty) return false;
    const { width: w, height: h, cells, shade } = this;
    let moved = false;
    // Alternate scan direction so piles don't lean one way.
    this.scanLeft = !this.scanLeft;
    // Bottom-up, so a grain moves at most one row per step.
    for (let y = h - 2; y >= 0; y--) {
      for (let i = 0; i < w; i++) {
        const x = this.scanLeft ? w - 1 - i : i;
        const idx = y * w + x;
        if (!isGrain(cells[idx]!)) continue;
        const below = idx + w;
        let target = -1;
        if (cells[below] === EMPTY) {
          target = below;
        } else {
          const dir = this.rng() < 0.5 ? -1 : 1;
          if (x + dir >= 0 && x + dir < w && cells[below + dir] === EMPTY) target = below + dir;
          else if (x - dir >= 0 && x - dir < w && cells[below - dir] === EMPTY) target = below - dir;
        }
        if (target >= 0) {
          cells[target] = cells[idx]!;
          shade[target] = shade[idx]!;
          cells[idx] = EMPTY;
          moved = true;
        }
      }
    }
    this.dirty = moved;
    return moved;
  }

  /** Grain count per palette index. */
  colorCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const c of this.cells) {
      if (isGrain(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }
}

export function isGrain(cell: number): boolean {
  return cell !== EMPTY && cell !== STONE;
}
