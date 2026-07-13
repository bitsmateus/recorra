import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '@/config/env';
import { DispatchService } from '@/modules/dunning/dispatch.service';
import { DISPATCH_QUEUE } from './dispatch-queue';

/**
 * Consumidor da fila de disparos (roda no processo worker).
 * Processa cada job chamando DispatchService.processOne; a retentativa/backoff
 * é gerenciada pelo BullMQ. Após esgotar as tentativas, marca o disparo FALHA.
 */
@Injectable()
export class DispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchWorker.name);
  private worker?: Worker;
  private connection?: IORedis;

  constructor(private readonly dispatch: DispatchService) {}

  onModuleInit() {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      DISPATCH_QUEUE,
      async (job) => {
        const { dispatchId } = job.data as { dispatchId: string };
        return this.dispatch.processOne(dispatchId);
      },
      { connection: this.connection, concurrency: 10 },
    );

    this.worker.on('failed', async (job, err) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        // esgotou as tentativas → marca FALHA definitiva
        await this.dispatch.marcarFalhaDefinitiva(job.data.dispatchId, `fila: ${err.message}`).catch(() => undefined);
        this.logger.warn(`Disparo ${job.data.dispatchId} falhou definitivamente: ${err.message}`);
      }
    });

    this.logger.log('DispatchWorker (BullMQ) iniciado');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
