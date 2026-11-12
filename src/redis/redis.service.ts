import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    // 연결은 처음 명령을 보낼 때 맺는다. Redis가 꺼져 있어도 서버는 뜨고 /health가 down으로 알려 준다.
    super(process.env.REDIS_URL ?? 'redis://127.0.0.1:6380', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
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
