import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'], // e2e/*.spec.ts belongs to Playwright
  },
});
