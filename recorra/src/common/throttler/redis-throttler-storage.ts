import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import IORedis from 'ioredis';
import { env } from '@/config/env';

/**
 * Rate limit no Redis: contador EXATO entre réplicas da API e que sobrevive a
 * restart (o balde em memória zera a cada deploy e conta por instância).
 *
 * FAIL-OPEN: rate limiting é uma proteção, não pode virar ponto único de falha.
 * Se o Redis estiver indisponível, LIBERA a request (em vez de derrubar a API
 * inteira com 500). A contagem exata volta assim que o Redis se recupera.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis = new IORedis(env.REDIS_URL, {
    // Falha rápido quando o Redis está fora, para o fail-open agir sem pendurar
    // a requisição (não enfileira comandos offline).
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  private readonly inner = new ThrottlerStorageRedisService(this.redis);
  private jaAvisou = false;

  constructor() {
    // Não deixa um erro de conexão não-tratado derrubar o processo.
    this.redis.on('error', (e) => {
      if (!this.jaAvisou) {
        this.logger.warn(`Redis do rate limiter indisponível — fail-open ativo: ${String(e?.message ?? e)}`);
        this.jaAvisou = true;
      }
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const r = await this.inner.increment(key, ttl, limit, blockDuration, throttlerName);
      this.jaAvisou = false;
      return r;
    } catch {
      // Redis fora: libera a request (fail-open) em vez de 500.
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
