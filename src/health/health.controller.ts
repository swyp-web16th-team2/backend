import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

const TIMEOUT_MS = 2000;

type State = 'up' | 'down';

// 연결이 멈춰 있어도 /health가 오래 매달리지 않게 시간 제한을 둔다.
function probe(check: () => Promise<unknown>): Promise<State> {
  const timeout = new Promise<State>((resolve) =>
    setTimeout(() => resolve('down'), TIMEOUT_MS),
  );
  return Promise.race([
    check().then(
      () => 'up' as const,
      () => 'down' as const,
    ),
    timeout,
  ]);
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(async () => {
        if ((await this.redis.ping()) !== 'PONG')
          throw new Error('PONG이 아님');
      }),
    ]);
    const body = {
      status: db === 'up' && redis === 'up' ? 'ok' : 'degraded',
      db,
      redis,
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
