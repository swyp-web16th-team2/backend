import { afterEach, vi } from 'vitest';
import { redisUrl, UNCONFIGURED_REDIS_URL } from './redis-url.js';

describe('redisUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('없거나 공백이면 undefined', () => {
    vi.stubEnv('REDIS_URL', '');
    expect(redisUrl()).toBeUndefined();
    vi.stubEnv('REDIS_URL', '  ');
    expect(redisUrl()).toBeUndefined();
  });

  it('있으면 그대로 쓴다', () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6380');
    expect(redisUrl()).toBe('redis://localhost:6380');
  });

  it('설정이 없을 때 대신 쓰는 주소는 절대 연결되지 않는 .invalid 주소', () => {
    expect(new URL(UNCONFIGURED_REDIS_URL).hostname.endsWith('.invalid')).toBe(
      true,
    );
  });
});
