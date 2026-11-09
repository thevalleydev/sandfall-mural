import { describe, expect, it } from 'vitest';
import { playGreedy } from './bots';
import { Game } from './game';
import { LEVELS } from './levels';
import { fingerprint, parFor, parKey } from './par';
import PAR_TABLE from './par.json';
import { Records, type Attempt, type KeyValueStore } from './records';
import { RULES } from './rules';
import { efficiency, gameEfficiency, starsFor, starString } from './score';
import { movesEmoji, shareText } from './share';

describe('efficiency', () => {
  it('is 100% with no waste and drops with what re-sends carried', () => {
    expect(efficiency(1000, 0)).toBe(100);
    expect(efficiency(1000, 10)).toBe(99);
    expect(efficiency(1000, 1000)).toBe(50);
    // Floored, so only a perfect run shows 100%.
    expect(efficiency(10000, 1)).toBe(99.9);
  });

  it('counts only re-sends against you, by the capacity they carried', () => {
    const game = playGreedy(new Game(LEVELS[3]!, 'line'));
    expect(game.state).toBe('won');
    const firstTrips = game.moves.filter((m) => m.source === 'lane').reduce((sum, m) => sum + m.capacity, 0);
    expect(firstTrips).toBe(game.grainCount);
    const carried = game.moves.reduce((sum, m) => sum + m.capacity, 0);
    expect(gameEfficiency(game)).toBe(Math.floor((1000 * game.grainCount) / carried) / 10);
  });
});

describe('stars', () => {
  it('rates efficiency against par', () => {
    expect(starsFor(false, 100, 90)).toBe(0);
    expect(starsFor(true, 95, 90)).toBe(3);
    expect(starsFor(true, 90, 90)).toBe(3);
    expect(starsFor(true, 80, 90)).toBe(2);
    expect(starsFor(true, 79.9, 90)).toBe(1);
    expect(starString(2)).toBe('★★☆');
  });
});

describe('par table', () => {
  it('is up to date with every level and rule (run `npm run par` if this fails)', () => {
    const stale = LEVELS.flatMap((def) =>
      RULES.filter((r) => parFor(def, r.id) === null).map((r) => parKey(def, r.id)),
    );
    expect(stale).toEqual([]);
    expect(Object.keys(PAR_TABLE)).toHaveLength(LEVELS.length * RULES.length);
  });

  it('changes fingerprint when a level changes', () => {
    const def = LEVELS[0]!;
    expect(fingerprint({ ...def, chunk: def.chunk + 1 }, 'line')).not.toBe(fingerprint(def, 'line'));
  });
});

describe('records', () => {
  const memory = (): KeyValueStore => {
    const map = new Map<string, string>();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  };
  const def = LEVELS[0]!;
  const attempt = (eff: number, seconds = 30): Attempt => ({ efficiency: eff, resends: 1, seconds, stars: 2 });

  it('tracks first clear, personal bests and recent clears', () => {
    const records = new Records(memory());
    expect(records.add(def, 'line', false, attempt(0, 10)).firstClear).toBe(false);

    const first = records.add(def, 'line', true, attempt(80, 30));
    expect(first).toMatchObject({ firstClear: true, newBestEfficiency: false, newBestTime: false });

    const better = records.add(def, 'line', true, { ...attempt(92, 35), stars: 3 });
    expect(better).toMatchObject({ firstClear: false, newBestEfficiency: true, newBestTime: false });
    expect(better.after).toMatchObject({ plays: 3, wins: 2, bestEfficiency: 92, bestSeconds: 30, bestStars: 3 });
    expect(better.after.recent.map((a) => a.efficiency)).toEqual([80, 92]);

    // Other rules are tracked separately.
    expect(records.get(def, 'top').wins).toBe(0);
  });

  it('keeps only the last 10 clears', () => {
    const records = new Records(memory());
    for (let i = 0; i < 12; i++) records.add(def, 'line', true, attempt(80 + i));
    expect(records.get(def, 'line').recent.map((a) => a.efficiency)).toEqual([82, 83, 84, 85, 86, 87, 88, 89, 90, 91]);
  });
});

describe('share text', () => {
  it('includes the score, par, re-sends and a link to the same level', () => {
    const text = shareText({
      levelNumber: 4,
      levelName: 'Mushroom',
      ruleLabel: 'Line of fire',
      stars: 3,
      efficiency: 91.2,
      par: 74.8,
      resends: 2,
      seconds: 61.4,
      perfect: false,
      newBest: true,
      movesLine: '🟦🟥🔴',
      url: 'https://example.com/?level=4&rule=line',
    });
    expect(text).toBe(
      'Sandfall Mural #4 Mushroom (Line of fire)\n' +
        '★★★ 91.2% efficient (par 74.8%) · 2 re-sends · 61s · New personal best\n' +
        '🟦🟥🔴\n' +
        'Can you beat it? https://example.com/?level=4&rule=line',
    );
  });

  it('shows first sends as squares and re-sends as circles, 10 per line', () => {
    const palette = ['', '#3b6fd8', '#e5484d', '#f6cf45'];
    const move = (color: number, source: 'lane' | 'slot') => ({ tick: 0, source, index: 0, color, capacity: 1 });
    expect(movesEmoji([move(1, 'lane'), move(2, 'lane'), move(2, 'slot'), move(3, 'lane')], palette)).toBe('🟦🟥🔴🟨');
    expect(movesEmoji(Array.from({ length: 12 }, () => move(1, 'lane')), palette)).toBe('🟦'.repeat(10) + '\n🟦🟦');
  });
});
