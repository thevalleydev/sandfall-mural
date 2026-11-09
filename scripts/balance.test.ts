import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { playGreedy, playPlanner, playRandom } from '../src/bots';
import { Game } from '../src/game';
import { LEVELS } from '../src/levels';
import { mulberry32 } from '../src/rng';
import { RULES } from '../src/rules';
import { computePar } from '../src/compute-par';

/**
 * Balance report: for every level and rule, does a one-move-ahead bot win,
 * and how often does a random tapper win? If random tapping wins nearly
 * always, planning doesn't matter and the level is too loose.
 *
 * Run with `npm run balance`; writes scripts/balance-report.md.
 */
const RANDOM_RUNS = 30;

describe('balance', () => {
  it('reports win rates', () => {
    const rows = LEVELS.flatMap((def, i) =>
      RULES.map((r) => {
        const greedy = playGreedy(new Game(def, r.id));
        const planner = playPlanner(new Game(def, r.id));
        let randomWins = 0;
        for (let s = 0; s < RANDOM_RUNS; s++) {
          if (playRandom(new Game(def, r.id), mulberry32(s + 1)).state === 'won') randomWins++;
        }
        return {
          level: `${i + 1} ${def.name}`,
          rule: r.id,
          collectors: greedy.collectorCount,
          greedy: greedy.state,
          'greedy moves': greedy.stats.deploys,
          'greedy secs': Math.round(greedy.tickCount / 60),
          planner: planner.state,
          'planner moves': planner.stats.deploys,
          'planner secs': Math.round(planner.tickCount / 60),
          par: computePar(def, r.id),
          'random win %': Math.round((100 * randomWins) / RANDOM_RUNS),
        };
      }),
    );
    const header = Object.keys(rows[0]!);
    const lines = [
      `| ${header.join(' | ')} |`,
      `|${header.map(() => ' --- ').join('|')}|`,
      ...rows.map((r) => `| ${Object.values(r).join(' | ')} |`),
    ];
    writeFileSync(new URL('./balance-report.md', import.meta.url), `# Balance report\n\n${lines.join('\n')}\n`);
  });
});
