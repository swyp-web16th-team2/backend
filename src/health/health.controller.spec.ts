import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { HealthController } from './health.controller.js';

function controller(db: 'up' | 'down', redis: 'up' | 'down' | 'wrong') {
  const prisma = {
    $queryRaw: () =>
      db === 'up'
        ? Promise.resolve([{ '?column?': 1 }])
        : Promise.reject(new Error('db')),
  } as unknown as PrismaService;
  const client = {
    ping: () =>
      redis === 'down'
        ? Promise.reject(new Error('redis'))
        : Promise.resolve(redis === 'up' ? 'PONG' : 'NOPE'),
  } as unknown as RedisService;
  return new HealthController(prisma, client);
}

describe('HealthController', () => {
  it('DB와 Redis가 모두 살아 있으면 ok', async () => {
    await expect(controller('up', 'up').check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      redis: 'up',
    });
  });

  it('DB가 죽어 있으면 503과 어느 쪽이 죽었는지 알려 준다', async () => {
    const error = await controller('down', 'up')
      .check()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'degraded',
      db: 'down',
      redis: 'up',
    });
  });

  it('Redis가 죽어 있거나 PONG이 아니면 503', async () => {
    for (const redis of ['down', 'wrong'] as const) {
      const error = await controller('up', redis)
        .check()
        .catch((e: unknown) => e);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'degraded',
        db: 'up',
        redis: 'down',
      });
    }
  });
});
