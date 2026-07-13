import { Logger } from '@nestjs/common';
import { env } from './env';

/**
 * Inicializa o Sentry se SENTRY_DSN estiver configurado. Carregado de forma
 * tolerante: se o pacote não estiver instalado, apenas loga (não quebra o boot).
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
    new Logger('Sentry').log('Sentry inicializado');
  } catch {
    new Logger('Sentry').warn('SENTRY_DSN definido mas @sentry/node não instalado');
  }
}
