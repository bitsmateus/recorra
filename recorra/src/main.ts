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

  app.use(
    json({
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(urlencoded({ extended: true }));

  app.use(helmet());
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', 'webhooks/:provider/:accountId', 'webhooks/inbound/:accountId'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`Recorra API on :${env.PORT}`);
}

bootstrap();
