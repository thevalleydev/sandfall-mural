import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (GitHub Pages serves it at /<repo>/).
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    // Greedy playthroughs simulate whole levels.
    testTimeout: 60_000,
  },
});
