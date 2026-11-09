import { GRAIN_SHADES } from './config';
import { COLORS, type LevelDef } from './levels';
import { hashString, mulberry32, type Rng } from './rng';
import { SandGrid, STONE } from './sand';

export interface Collector {
  readonly id: number;
  /** Palette index of the color it eats. */
  readonly color: number;
  /** Grains it can still eat. */
  capacity: number;
}

export interface BuiltLevel {
  grid: SandGrid;
  /** Palette index → hex color. Index 0 is unused (empty). */
  palette: string[];
  lanes: Collector[][];
}

/** Turns level art into a sand grid and deals out collectors whose capacities exactly match the grain counts. */
export function buildLevel(def: LevelDef): BuiltLevel {
  const artH = def.art.length;
  const artW = def.art[0]?.length ?? 0;
  if (artW === 0) throw new Error(`Level "${def.name}" has no art`);

  const seed = hashString(def.name);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const grid = new SandGrid(artW * def.scale, artH * def.scale, seed);
  const palette = [''];
  const colorIndex = new Map<string, number>();

  def.art.forEach((row, ay) => {
    if (row.length !== artW) throw new Error(`Level "${def.name}" row ${ay} is ${row.length} wide, expected ${artW}`);
    for (let ax = 0; ax < artW; ax++) {
      const ch = row[ax]!;
      if (ch === '.') continue;
      let value = STONE;
      if (ch !== '#') {
        const hex = COLORS[ch];
        if (!hex) throw new Error(`Level "${def.name}" uses unknown art character "${ch}"`);
        value = colorIndex.get(ch) ?? palette.push(hex) - 1;
        colorIndex.set(ch, value);
      }
      for (let dy = 0; dy < def.scale; dy++) {
        for (let dx = 0; dx < def.scale; dx++) {
          grid.set(ax * def.scale + dx, ay * def.scale + dy, value, Math.floor(rng() * GRAIN_SHADES));
        }
      }
    }
  });

  return { grid, palette, lanes: dealCollectors(grid, def, rng) };
}

/**
 * Splits each color's grains into collectors, orders them roughly top-to-bottom
 * by where that color sits in the picture (with some jitter), and deals them
 * round-robin into lanes. Placeholder until the Phase 2 generator and solver.
 */
function dealCollectors(grid: SandGrid, def: LevelDef, rng: Rng): Collector[][] {
  const extent = new Map<number, { min: number; max: number }>();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = grid.get(x, y);
      if (c === STONE || c === 0) continue;
      const e = extent.get(c);
      if (e) e.max = y;
      else extent.set(c, { min: y, max: y });
    }
  }

  const keyed: { key: number; color: number; capacity: number }[] = [];
  for (const [color, count] of grid.colorCounts()) {
    const sizes = splitCapacity(count, def.chunk, rng);
    const { min, max } = extent.get(color)!;
    sizes.forEach((capacity, k) => {
      const depth = min + ((max - min) * (k + 0.5)) / sizes.length;
      keyed.push({ key: depth + rng() * grid.height * 0.15, color, capacity });
    });
  }
  keyed.sort((a, b) => a.key - b.key);

  const lanes: Collector[][] = Array.from({ length: def.lanes }, () => []);
  keyed.forEach((k, i) => lanes[i % def.lanes]!.push({ id: i + 1, color: k.color, capacity: k.capacity }));
  return lanes;
}

/** Splits `total` into chunks around `target` (rounded to tens, except the last), summing exactly to `total`. */
export function splitCapacity(total: number, target: number, rng: Rng): number[] {
  const sizes: number[] = [];
  let left = total;
  while (left > 0) {
    let size = Math.max(10, Math.round((target * (0.6 + rng() * 0.8)) / 10) * 10);
    if (left - size < target * 0.4) size = left;
    sizes.push(size);
    left -= size;
  }
  return sizes;
}
