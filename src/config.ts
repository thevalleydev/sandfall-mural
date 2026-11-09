// Tuning knobs for the prototype. Everything here is a guess to be playtested.

/** Fixed simulation rate. The game logic always runs at this rate so outcomes don't depend on frame rate. */
export const TICK_HZ = 60;
/** Sand gravity steps per tick (grains fall this many cells per tick). */
export const SAND_STEPS_PER_TICK = 2;
/** How far a collector moves along the belt per tick, in track steps (one step = one grain-width). */
export const BELT_SPEED = 0.8;
/** Maximum collectors on the belt at once. */
export const BELT_CAPACITY = 4;
/** A new collector can't enter until the previous one is this many steps along. */
export const BELT_ENTRY_GAP = 10;
/** Holding slots for collectors that finish a lap with capacity left. */
export const SLOT_COUNT = 5;
/** Maximum grains a collector eats from a single ray (one track step). */
export const BITE = 4;
/** Number of shade variants per sand color, for grain texture. */
export const GRAIN_SHADES = 4;
