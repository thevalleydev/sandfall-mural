import { BELT_CAPACITY, BELT_ENTRY_GAP, BELT_SPEED, BITE, SAND_STEPS_PER_TICK, SLOT_COUNT } from './config';
import { buildLevel, type Collector } from './level';
import type { LevelDef } from './levels';
import { buildTrack, canEatAnywhere, castRay, type Rule, type TrackStep } from './rules';
import type { SandGrid } from './sand';

export type GameState = 'playing' | 'won' | 'lost';
export type LoseReason = 'overflow' | 'stuck';

export interface BeltCollector {
  collector: Collector;
  /** Distance travelled along the track, in steps. */
  pos: number;
  /** Next track step to fire from. */
  nextStep: number;
}

export interface EatEvent {
  /** Cell index of the eaten grain. */
  cell: number;
  color: number;
  collectorId: number;
}

/** Moments the UI reacts to with sound and effects. */
export type GameEvent =
  | { type: 'deploy' }
  | { type: 'emptied'; collectorId: number; color: number }
  | { type: 'parked' }
  | { type: 'won' }
  | { type: 'lost' };

/**
 * One player move. The tick matters as much as the order: the same collector
 * sent a moment later meets a different board. Since the simulation is
 * deterministic, replaying the same moves at the same ticks reproduces a game exactly.
 */
export interface Move {
  /** Ticks completed before the move was made. */
  tick: number;
  /** 'lane' for a collector's first trip; 'slot' for re-sending a parked one. */
  source: 'lane' | 'slot';
  /** Lane or slot index. */
  index: number;
  color: number;
  /** Capacity left when it was sent. */
  capacity: number;
}

export interface GameStats {
  deploys: number;
  /** Tick of each successful deploy, for measuring how long players think between moves. */
  deployTicks: number[];
  maxSlotsUsed: number;
}

/** All game rules and state. No DOM, so it runs the same in tests and in the browser. */
export class Game {
  readonly def: LevelDef;
  readonly rule: Rule;
  readonly grid: SandGrid;
  readonly palette: string[];
  readonly lanes: Collector[][];
  readonly slots: (Collector | null)[];
  readonly belt: BeltCollector[] = [];
  readonly track: TrackStep[];
  /** Collectors the level starts with: the fewest moves it can possibly take. */
  readonly collectorCount: number;
  /** Grains in the picture at the start, which is also the collectors' total capacity. */
  readonly grainCount: number;
  readonly stats: GameStats = { deploys: 0, deployTicks: [], maxSlotsUsed: 0 };
  /** Grains eaten since the renderer last drained this list. */
  readonly eatEvents: EatEvent[] = [];
  /** Events since the UI last drained this list. */
  readonly events: GameEvent[] = [];
  readonly moves: Move[] = [];

  state: GameState = 'playing';
  loseReason: LoseReason | null = null;
  tickCount = 0;
  /** Bumps whenever collectors move between lanes, belt and slots, so the UI knows to redraw them. */
  version = 0;
  private stuckCheckedAt = -1;

  constructor(def: LevelDef, rule: Rule) {
    const built = buildLevel(def);
    this.def = def;
    this.rule = rule;
    this.grid = built.grid;
    this.palette = built.palette;
    this.lanes = built.lanes;
    this.collectorCount = built.lanes.flat().length;
    this.grainCount = this.grid.remaining;
    this.slots = Array.from({ length: SLOT_COUNT }, () => null);
    this.track = buildTrack(this.grid.width, this.grid.height, rule);
  }

  /** Moves that re-sent a parked collector. */
  get resends(): number {
    return this.moves.filter((m) => m.source === 'slot').length;
  }

  /**
   * Capacity carried on re-sends: what collectors brought back unused. Every
   * collector's first trip carries its full capacity and those add up to
   * exactly the grains in the picture, so this is the only avoidable cost.
   */
  get wasted(): number {
    return this.moves.reduce((sum, m) => (m.source === 'slot' ? sum + m.capacity : sum), 0);
  }

  /** Whether a collector could enter the belt right now. */
  get canDeploy(): boolean {
    return (
      this.state === 'playing' &&
      this.belt.length < BELT_CAPACITY &&
      this.belt.every((b) => b.pos >= BELT_ENTRY_GAP)
    );
  }

  deployFromLane(lane: number): boolean {
    const front = this.lanes[lane]?.[0];
    if (!front || !this.canDeploy) return false;
    this.lanes[lane]!.shift();
    this.launch(front, 'lane', lane);
    return true;
  }

  deployFromSlot(slot: number): boolean {
    const collector = this.slots[slot];
    if (!collector || !this.canDeploy) return false;
    this.slots[slot] = null;
    this.launch(collector, 'slot', slot);
    return true;
  }

  private launch(collector: Collector, source: Move['source'], index: number): void {
    this.moves.push({ tick: this.tickCount, source, index, color: collector.color, capacity: collector.capacity });
    this.belt.push({ collector, pos: 0, nextStep: 0 });
    this.stats.deploys++;
    this.stats.deployTicks.push(this.tickCount);
    this.events.push({ type: 'deploy' });
    this.version++;
  }

  /** Replays a move list on this (fresh) game, ticking until it ends or maxTicks pass. */
  replay(moves: readonly Move[], maxTicks: number): this {
    let next = 0;
    while (this.state === 'playing' && this.tickCount < maxTicks) {
      while (moves[next]?.tick === this.tickCount) {
        const m = moves[next++]!;
        if (m.source === 'lane') this.deployFromLane(m.index);
        else this.deployFromSlot(m.index);
      }
      this.tick();
    }
    return this;
  }

  /** Advances the game by one fixed tick. */
  tick(): void {
    if (this.state !== 'playing') return;
    this.tickCount++;
    for (let i = 0; i < SAND_STEPS_PER_TICK; i++) this.grid.step();

    for (const b of [...this.belt]) {
      b.pos += BELT_SPEED;
      while (b.nextStep <= b.pos && b.nextStep < this.track.length && b.collector.capacity > 0) {
        this.fire(b.collector, this.track[b.nextStep]!);
        b.nextStep++;
      }
      if (b.collector.capacity === 0) {
        this.events.push({ type: 'emptied', collectorId: b.collector.id, color: b.collector.color });
        this.removeFromBelt(b);
      } else if (b.nextStep >= this.track.length) {
        this.removeFromBelt(b);
        if (!this.park(b.collector)) return this.lose('overflow');
      }
    }

    if (this.grid.remaining === 0) {
      this.state = 'won';
      this.events.push({ type: 'won' });
      this.version++;
      return;
    }
    this.checkStuck();
  }

  private fire(collector: Collector, step: TrackStep): void {
    const eaten: number[] = [];
    const limit = Math.min(BITE, collector.capacity);
    collector.capacity -= castRay(this.grid, step, collector.color, this.rule, limit, true, eaten);
    for (const cell of eaten) this.eatEvents.push({ cell, color: collector.color, collectorId: collector.id });
  }

  private removeFromBelt(b: BeltCollector): void {
    this.belt.splice(this.belt.indexOf(b), 1);
    this.version++;
  }

  /** Puts a collector that finished its lap into a free slot. Returns false if there is none. */
  private park(collector: Collector): boolean {
    const free = this.slots.indexOf(null);
    if (free < 0) return false;
    this.slots[free] = collector;
    this.events.push({ type: 'parked' });
    const used = this.slots.filter(Boolean).length;
    this.stats.maxSlotsUsed = Math.max(this.stats.maxSlotsUsed, used);
    return true;
  }

  /**
   * The player is stuck when the belt is empty, the sand has settled, there is
   * no free slot to cycle a lane collector into (or no lane collectors left),
   * and no collector they could deploy would eat anything.
   */
  private checkStuck(): void {
    if (this.belt.length > 0 || !this.grid.settled || this.stuckCheckedAt === this.version) return;
    this.stuckCheckedAt = this.version;
    const slotsFull = this.slots.every(Boolean);
    const lanesEmpty = this.lanes.every((l) => l.length === 0);
    if (!slotsFull && !lanesEmpty) return;
    const candidates = [...this.slots, ...this.lanes.map((l) => l[0])].filter((c): c is Collector => !!c);
    if (!candidates.some((c) => canEatAnywhere(this.grid, this.track, c.color, this.rule))) this.lose('stuck');
  }

  private lose(reason: LoseReason): void {
    this.state = 'lost';
    this.loseReason = reason;
    this.events.push({ type: 'lost' });
    this.version++;
  }
}
