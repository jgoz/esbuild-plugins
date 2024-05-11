import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxConcurrency: 1,
    setupFiles: ['test/config/serializer.ts'],
  },
});
