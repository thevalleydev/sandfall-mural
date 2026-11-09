import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { LEVELS } from '../src/levels';
import { fingerprint, parKey, type ParEntry } from '../src/par';
import { RULES } from '../src/rules';
import { computePar } from '../src/compute-par';

/** Regenerates src/par.json. Run with `npm run par` after changing levels, config.ts or the bots. */
it('generates the par table', () => {
  const table: Record<string, ParEntry> = {};
  for (const def of LEVELS) {
    for (const r of RULES) table[parKey(def, r.id)] = { par: computePar(def, r.id), fingerprint: fingerprint(def, r.id) };
  }
  writeFileSync(new URL('../src/par.json', import.meta.url), `${JSON.stringify(table, null, 2)}\n`);
});
