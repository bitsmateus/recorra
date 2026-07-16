import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Config dos testes de integração (sobem a app + Postgres + Redis).
 *
 * Precisa ser um arquivo separado: o `exclude` do vitest.config.ts ignora
 * test/integration/**, e nem `--dir` nem `--exclude` na linha de comando
 * sobrescrevem isso (a CLI SOMA ao exclude do config). Sem este arquivo,
 * `npm run test:e2e` encontrava zero testes e passava sem rodar nada.
 *
 * Requer o ambiente no ar: docker compose up -d && npx prisma migrate deploy
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
    // Sobem app e banco: bem mais lentos que os testes puros.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
