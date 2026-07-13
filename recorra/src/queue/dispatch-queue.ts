import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '@/config/env';

export const DISPATCH_QUEUE = 'recorra-dispatch';

/**
 * Produtor da fila de disparos (BullMQ). Enfileira jobs com retentativa e
 * backoff exponencial. jobId = id do disparo → dedupe (não enfileira 2x).
 */
@Injectable()
export class DispatchQueue implements OnModuleDestroy {
  private readonly logger = new Logger(DispatchQueue.name);
  private readonly connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  readonly queue = new Queue(DISPATCH_QUEUE, {
    connection: this.connection as never,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });

  async enqueue(dispatchId: string, delayMs = 0) {
    await this.queue.add('send', { dispatchId }, { jobId: dispatchId, delay: delayMs });
  }

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }
}
