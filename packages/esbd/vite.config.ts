import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxThreads: 1,
    minThreads: 1,
    setupFiles: ['test/config/serializer.ts'],
  },
});
