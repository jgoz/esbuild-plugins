import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxConcurrency: 1,
    testTimeout: 20000,
  },
});
