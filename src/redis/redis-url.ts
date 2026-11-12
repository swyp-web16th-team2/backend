// 주소가 없을 때 ioredis가 기본 포트(6379)의 다른 Redis에 붙지 않게 하려는 도우미.
// 서버는 Redis 없이도 떠야 하므로, 없으면 절대 연결되지 않는 주소(.invalid)를 대신 넘긴다.
export const UNCONFIGURED_REDIS_URL = 'redis://unconfigured.invalid:1';

export function redisUrl(): string | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url ? url : undefined;
}
