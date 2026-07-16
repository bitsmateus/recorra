import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker/worker.module';
import { initSentry } from '@/config/observability';

async function bootstrap() {
  initSentry();
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger('Worker').log('Recorrai worker iniciado (regua + fila)');
}

bootstrap();
