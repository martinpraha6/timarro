import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'], // e2e/*.spec.ts belongs to Playwright
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Barrel / type-only / side-effect entry points — no meaningful unit surface.
        'src/index.ts',
        'src/register.ts',
        'src/schema/index.ts',
        'src/schema/types.ts',
      ],
      // Baseline from the current suite; leave a little headroom, fail on real drops.
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
