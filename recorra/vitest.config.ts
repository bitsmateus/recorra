import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // e2e (que sobem a app + banco) rodam via `npm run test:e2e`.
    exclude: ['**/node_modules/**', 'test/integration/**'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
