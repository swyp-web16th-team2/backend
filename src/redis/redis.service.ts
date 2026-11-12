import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisUrl, UNCONFIGURED_REDIS_URL } from './redis-url.js';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    // 연결은 처음 명령을 보낼 때 맺는다. Redis가 꺼져 있어도 서버는 뜨고 /health가 down으로 알려 준다.
    super(redisUrl() ?? UNCONFIGURED_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 3000, // 응답이 없는 명령은 3초 뒤 실패시킨다
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    const logger = new Logger(RedisService.name);
    this.on('error', (error) =>
      logger.warn(`Redis 연결 오류: ${error.message}`),
    );
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}
