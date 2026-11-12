import { afterEach, vi } from 'vitest';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('REDIS_URL이 없으면 configured가 false이고 연결을 시도하지 않는다', async () => {
    vi.stubEnv('REDIS_URL', '');
    const redis = new RedisService();
    try {
      expect(redis.configured).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(redis.status).toBe('wait'); // lazyConnect: 명령을 보내기 전에는 연결하지 않는다
    } finally {
      redis.disconnect();
    }
  });

  it('REDIS_URL이 있으면 configured가 true', () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6380');
    const redis = new RedisService();
    try {
      expect(redis.configured).toBe(true);
    } finally {
      redis.disconnect();
    }
  });
});
