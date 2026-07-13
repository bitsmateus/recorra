import { Controller, Get } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '@/common/prisma/prisma.service';
import { env } from '@/config/env';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'recorra-api', ts: new Date().toISOString() };
  }

  @Get('health/ready')
  async ready() {
    const checks: Record<string, string> = {};
    let ok = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'falha';
      ok = false;
    }
    let redis: Redis | null = null;
    try {
      redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
      await redis.connect();
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'falha';
      ok = false;
    } finally {
      redis?.disconnect();
    }
    return { status: ok ? 'ready' : 'degraded', checks, ts: new Date().toISOString() };
  }
}
