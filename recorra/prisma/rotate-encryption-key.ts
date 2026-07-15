/**
 * Rotação da ENCRYPTION_KEY — re-cifra todas as credenciais de terceiros.
 *
 * Uso:
 *   ENCRYPTION_KEY_OLD="<chave antiga>" ENCRYPTION_KEY="<chave nova>" \
 *     npx tsx prisma/rotate-encryption-key.ts [--dry-run]
 *
 * Passos recomendados (sem downtime):
 *   1) Gere a nova chave: openssl rand -base64 32
 *   2) Suba o app com ENCRYPTION_KEY=<nova> e ENCRYPTION_KEY_OLD=<antiga>
 *      (o CryptoService decifra com a nova e cai pra antiga automaticamente).
 *   3) Rode este script (re-cifra tudo com a nova).
 *   4) Remova ENCRYPTION_KEY_OLD do ambiente.
 *   5) Considere as chaves antigas comprometidas — não reutilize.
 */
import { PrismaClient } from '@prisma/client';
import { decryptWith, encryptWith } from '../src/common/crypto/aes';

const OLD = process.env.ENCRYPTION_KEY_OLD;
const NEW = process.env.ENCRYPTION_KEY;
const DRY = process.argv.includes('--dry-run');

async function main() {
  if (!OLD || !NEW) {
    console.error('Defina ENCRYPTION_KEY_OLD (antiga) e ENCRYPTION_KEY (nova) no ambiente.');
    process.exit(1);
  }
  if (OLD === NEW) {
    console.error('ENCRYPTION_KEY_OLD e ENCRYPTION_KEY são iguais — nada a rotacionar.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const stats = { rotated: 0, skipped: 0, failed: 0 };

  async function rotate(
    label: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[],
    save: (id: string, cipher: string) => Promise<unknown>,
  ) {
    for (const row of rows) {
      const cipher: string | null = row.credentials;
      if (!cipher) continue;
      let plain: string;
      try {
        plain = decryptWith(OLD!, cipher);
      } catch {
        // Já está na chave nova? valida e pula (idempotente).
        try {
          decryptWith(NEW!, cipher);
          stats.skipped++;
        } catch {
          stats.failed++;
          console.warn(`[${label}] ${row.id}: não decifra nem com OLD nem com NEW`);
        }
        continue;
      }
      const reenc = encryptWith(NEW!, plain);
      if (!DRY) await save(row.id, reenc);
      stats.rotated++;
    }
  }

  await rotate('payment', await prisma.paymentProviderAccount.findMany(), (id, c) =>
    prisma.paymentProviderAccount.update({ where: { id }, data: { credentials: c } }),
  );
  await rotate('channel', await prisma.channelAccount.findMany(), (id, c) =>
    prisma.channelAccount.update({ where: { id }, data: { credentials: c } }),
  );
  await rotate('source', await prisma.sourceIntegration.findMany(), (id, c) =>
    prisma.sourceIntegration.update({ where: { id }, data: { credentials: c } }),
  );

  console.log(
    `${DRY ? '[DRY-RUN] ' : ''}Rotação concluída: ${stats.rotated} re-cifrados, ${stats.skipped} já na chave nova, ${stats.failed} falharam.`,
  );
  await prisma.$disconnect();
  if (stats.failed > 0) process.exit(2);
}

main().catch((e) => {
  console.error('Falha na rotação:', e);
  process.exit(1);
});
