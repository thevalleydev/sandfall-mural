import { defineConfig } from 'vitest/config';

// Separate config so the slow balance report doesn't run with the normal tests.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    testTimeout: 600_000,
  },
});
