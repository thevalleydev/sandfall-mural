import { BELT_SPEED, GRAIN_SHADES } from './config';
import type { Game } from './game';
import { STONE_COLOR } from './levels';
import type { TrackStep } from './rules';
import { EMPTY, STONE } from './sand';

/** Width of the belt around the board, in grain-widths. */
export const TRACK_CELLS = 7;
const PARTICLE_FRAMES = 14;
const MAX_PARTICLES = 400;
const SHADE_FACTORS = [0.86, 0.93, 1, 1.07];
/** Frames a collector stays swollen after a bite. */
const CHOMP_FRAMES = 6;
const BURST_FRAMES = 24;
const CONFETTI_FRAMES = 90;
const CONFETTI_PIECES = 140;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Where the board sits inside the stage, in CSS pixels. */
export interface Layout {
  cell: number;
  left: number;
  top: number;
  margin: number;
}

export function computeLayout(stageWidth: number, stageHeight: number, game: Game): Layout {
  const { width: w, height: h } = game.grid;
  const cell = Math.min(stageWidth / (w + 2 * TRACK_CELLS), stageHeight / (h + 2 * TRACK_CELLS));
  return {
    cell,
    margin: TRACK_CELLS * cell,
    left: (stageWidth - w * cell) / 2,
    top: (stageHeight - h * cell) / 2,
  };
}

/** Draws the sand grid into a canvas with one pixel per grain; CSS scales it up. */
export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private readonly colorTable: Uint32Array;
  private readonly stoneTable: Uint32Array;
  private readonly game: Game;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.game = game;
    canvas.width = game.grid.width;
    canvas.height = game.grid.height;
    this.ctx = canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(canvas.width, canvas.height);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.colorTable = new Uint32Array(game.palette.length * GRAIN_SHADES);
    game.palette.forEach((hex, i) => {
      if (hex) for (let s = 0; s < GRAIN_SHADES; s++) this.colorTable[i * GRAIN_SHADES + s] = shadedPixel(hex, s);
    });
    this.stoneTable = Uint32Array.from(SHADE_FACTORS, (_, s) => shadedPixel(STONE_COLOR, s));
  }

  draw(): void {
    const { cells, shade } = this.game.grid;
    const empty = packPixel(0x14, 0x15, 0x20);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      const s = shade[i]!;
      this.pixels[i] = c === EMPTY ? empty : c === STONE ? this.stoneTable[s]! : this.colorTable[c * GRAIN_SHADES + s]!;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}

interface Particle {
  x: number;
  y: number;
  color: string;
  collectorId: number;
  age: number;
}

/** A collector popping when it empties: an expanding ring and sparks. */
interface Burst {
  x: number;
  y: number;
  color: string;
  age: number;
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  color: string;
  age: number;
}

/** Draws the belt, the collectors riding it, and grains flying into them. */
export class OverlayRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  /** Last known screen position of each belt collector, so particles can finish their flight after it leaves. */
  private lastPos = new Map<number, { x: number; y: number }>();
  /** Frames since each collector last ate, for the chomp pulse. */
  private chompAge = new Map<number, number>();
  private bursts: Burst[] = [];
  private confetti: Confetto[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(game: Game, layout: Layout): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBelt(game, layout);

    const radius = Math.min(layout.margin * 0.42, 22);
    for (const b of game.belt) {
      const p = beltPoint(game.track, b.pos, layout, game.grid.width, game.grid.height);
      this.lastPos.set(b.collector.id, p);
      const age = this.chompAge.get(b.collector.id) ?? CHOMP_FRAMES;
      this.chompAge.set(b.collector.id, age + 1);
      const pulse = reducedMotion ? 1 : 1 + 0.18 * Math.max(0, 1 - age / CHOMP_FRAMES);
      drawChip(ctx, p.x, p.y, radius * pulse, game.palette[b.collector.color]!, String(b.collector.capacity));
    }

    this.spawnParticles(game, layout);
    this.drawParticles(layout);
    this.drawBursts(radius);
    this.drawConfetti(layout);
  }

  reset(): void {
    this.particles = [];
    this.bursts = [];
    this.confetti = [];
    this.lastPos.clear();
    this.chompAge.clear();
  }

  /** Pops a collector that just emptied, at its last position on the belt. */
  burst(collectorId: number, color: string): void {
    const p = this.lastPos.get(collectorId);
    if (p && !reducedMotion) this.bursts.push({ ...p, color, age: 0 });
  }

  /** Sand-colored confetti thrown up from the middle of the board. */
  celebrate(game: Game, layout: Layout): void {
    if (reducedMotion) return;
    const colors = game.palette.filter(Boolean);
    const cx = layout.left + (game.grid.width * layout.cell) / 2;
    const cy = layout.top + (game.grid.height * layout.cell) / 2;
    for (let i = 0; i < CONFETTI_PIECES; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 5 + Math.random() * 7;
      this.confetti.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: (Math.random() - 0.5) * 0.4,
        angle: Math.random() * Math.PI,
        color: colors[i % colors.length]!,
        age: Math.floor(Math.random() * 10),
      });
    }
  }

  private drawBelt(game: Game, layout: Layout): void {
    const { ctx } = this;
    const { left, top, cell, margin } = layout;
    const w = game.grid.width * cell;
    const h = game.grid.height * cell;
    const half = margin / 2;

    ctx.beginPath();
    if (game.rule === 'top') {
      ctx.moveTo(left, top - half);
      ctx.lineTo(left + w, top - half);
    } else {
      ctx.roundRect(left - half, top - half, w + margin, h + margin, half);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = margin * 0.72;
    ctx.strokeStyle = '#262938';
    ctx.stroke();
    // Moving dashes show the belt direction.
    ctx.setLineDash([cell * 2, cell * 3]);
    ctx.lineDashOffset = -game.tickCount * BELT_SPEED * cell;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3d4260';
    ctx.stroke();
    ctx.setLineDash([]);

    // Entrance marker.
    ctx.fillStyle = game.canDeploy ? '#f6cf45' : '#3d4260';
    ctx.beginPath();
    ctx.moveTo(left - half - 6, top - half - 7);
    ctx.lineTo(left - half + 6, top - half);
    ctx.lineTo(left - half - 6, top - half + 7);
    ctx.fill();
  }

  private spawnParticles(game: Game, layout: Layout): void {
    const w = game.grid.width;
    for (const e of game.eatEvents) {
      if (this.particles.length >= MAX_PARTICLES) break;
      this.particles.push({
        x: layout.left + ((e.cell % w) + 0.5) * layout.cell,
        y: layout.top + (Math.floor(e.cell / w) + 0.5) * layout.cell,
        color: game.palette[e.color]!,
        collectorId: e.collectorId,
        age: 0,
      });
    }
    for (const e of game.eatEvents) this.chompAge.set(e.collectorId, 0);
    game.eatEvents.length = 0;
  }

  private drawParticles(layout: Layout): void {
    const { ctx } = this;
    const size = Math.max(2, layout.cell);
    this.particles = this.particles.filter((p) => {
      p.age++;
      const target = this.lastPos.get(p.collectorId) ?? p;
      const t = easeIn(p.age / PARTICLE_FRAMES);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x + (target.x - p.x) * t - size / 2, p.y + (target.y - p.y) * t - size / 2, size, size);
      return p.age < PARTICLE_FRAMES;
    });
  }

  private drawBursts(radius: number): void {
    const { ctx } = this;
    this.bursts = this.bursts.filter((b) => {
      b.age++;
      const t = b.age / BURST_FRAMES;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, radius * (1 + t * 1.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = b.color;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const d = radius * (0.8 + easeOut(t) * 2.2);
        ctx.fillRect(b.x + Math.cos(a) * d - 2, b.y + Math.sin(a) * d - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      return b.age < BURST_FRAMES;
    });
  }

  private drawConfetti(layout: Layout): void {
    const { ctx } = this;
    const size = Math.max(4, layout.cell * 1.3);
    this.confetti = this.confetti.filter((c) => {
      c.age++;
      c.vy += 0.28;
      c.vx *= 0.985;
      c.x += c.vx;
      c.y += c.vy;
      c.angle += c.spin;
      ctx.globalAlpha = Math.min(1, (CONFETTI_FRAMES - c.age) / 20);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = c.color;
      ctx.fillRect(-size / 2, -size / 3, size, size * 0.66);
      ctx.restore();
      ctx.globalAlpha = 1;
      return c.age < CONFETTI_FRAMES;
    });
  }
}

/** Screen position of a collector `pos` steps along the track, interpolated within a side. */
export function beltPoint(track: TrackStep[], pos: number, layout: Layout, w: number, h: number): { x: number; y: number } {
  const i = Math.min(Math.floor(pos), track.length - 1);
  const a = stepPoint(track[i]!, layout, w, h);
  const next = track[i + 1];
  if (!next || next.side !== track[i]!.side) return a;
  const b = stepPoint(next, layout, w, h);
  const f = pos - i;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function stepPoint(step: TrackStep, { left, top, cell, margin }: Layout, w: number, h: number): { x: number; y: number } {
  const half = margin / 2;
  switch (step.side) {
    case 'top':
      return { x: left + (step.x + 0.5) * cell, y: top - half };
    case 'right':
      return { x: left + w * cell + half, y: top + (step.y + 0.5) * cell };
    case 'bottom':
      return { x: left + (step.x + 0.5) * cell, y: top + h * cell + half };
    case 'left':
      return { x: left - half, y: top + (step.y + 0.5) * cell };
  }
}

function drawChip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, label: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffffcc';
  ctx.stroke();
  ctx.fillStyle = isLight(color) ? '#1c1e2b' : '#fff';
  ctx.font = `800 ${Math.round(r * 0.75)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

function easeIn(t: number): number {
  return t * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** True for colors where dark text reads better than white. */
export function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

function shadedPixel(hex: string, shade: number): number {
  const f = SHADE_FACTORS[shade] ?? 1;
  const [r, g, b] = hexToRgb(hex).map((v) => Math.min(255, Math.round(v * f))) as [number, number, number];
  return packPixel(r, g, b);
}

/** ImageData is RGBA bytes; on little-endian machines (all real devices) that reads as ABGR in a Uint32. */
function packPixel(r: number, g: number, b: number): number {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
