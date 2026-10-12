import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // VexFlow (with its music font) is one ~700 kB chunk, loaded only when sheet music is first shown.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
