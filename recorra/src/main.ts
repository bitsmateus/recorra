import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import type { Request } from 'express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from '@/config/env';
import { initSentry } from '@/config/observability';

async function bootstrap() {
  initSentry();
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  // Logger estruturado (pino) com masking de PII.
  app.useLogger(app.get(PinoLogger));

  // Atrás do proxy reverso (EasyPanel/Docker), confia no 1º hop para que o
  // rate limiter e os logs usem o IP REAL do cliente (via X-Forwarded-For).
  // Sem isto, req.ip é o IP do proxy e TODOS os clientes caem no mesmo balde do
  // ThrottlerGuard — 120 req/min no sistema inteiro, derrubando todo mundo junto.
  // `1` (e não `true`) evita spoof de IP: só confia no cabeçalho posto pelo seu proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Imports enviam o arquivo como base64 no corpo (até ~15 MB de arquivo →
  // ~20 MB em base64). Parser dedicado só nessas rotas, para NÃO elevar o
  // limite de corpo do resto da API. Sem isto, o default de 100 KB do Express
  // rejeitava (413) qualquer planilha real antes do check de 15 MB do service.
  app.use('/api/clientes/importar', json({ limit: '25mb' }));
  app.use(
    json({
      // Limite global sadio: cobre payloads de API normais (ingest em lote,
      // etc.) e barra corpos gigantes que poderiam estourar memória.
      limit: '1mb',
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  app.use(helmet());
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', 'webhooks/:provider/:accountId', 'webhooks/inbound/:accountId'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`Recorrai API on :${env.PORT}`);
}

bootstrap();
