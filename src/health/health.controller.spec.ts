import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, vi } from 'vitest';
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

describe('HealthController 연결이 멈췄을 때', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('같은 순간의 요청은 한 번의 점검을 같이 쓴다', async () => {
    const queryRaw = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 10)),
    );
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const client = {
      ping: () => Promise.resolve('PONG'),
    } as unknown as RedisService;
    const health = new HealthController(prisma, client);
    const results = await Promise.all([
      health.check(),
      health.check(),
      health.check(),
    ]);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('응답이 없으면 시간 제한 뒤 503, 그동안 새 점검을 쌓지 않는다', async () => {
    vi.useFakeTimers();
    const queryRaw = vi.fn(() => new Promise(() => {})); // 영원히 끝나지 않는 쿼리
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const client = {
      ping: () => Promise.resolve('PONG'),
    } as unknown as RedisService;
    const health = new HealthController(prisma, client);

    const first = health.check().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000);
    expect(
      ((await first) as ServiceUnavailableException).getResponse(),
    ).toEqual({
      status: 'degraded',
      db: 'down',
      redis: 'up',
    });

    for (let i = 0; i < 20; i++) {
      const again = (await health
        .check()
        .catch((e: unknown) => e)) as ServiceUnavailableException;
      expect(again.getResponse()).toEqual({
        status: 'degraded',
        db: 'down',
        redis: 'up',
      });
    }
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
