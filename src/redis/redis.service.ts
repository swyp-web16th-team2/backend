import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisUrl, UNCONFIGURED_REDIS_URL } from './redis-url.js';

// 장애가 길어져도 경고 로그가 계속 쌓이지 않게, 이 간격에 한 번만 남긴다.
const WARN_INTERVAL_MS = 60_000;

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  /** REDIS_URL이 설정돼 있는지. 없으면 연결을 시도하지 않는다(health도 바로 down으로 답한다). */
  readonly configured: boolean;

  constructor() {
    const url = redisUrl();
    // 연결은 처음 명령을 보낼 때 맺는다. Redis가 꺼져 있어도 서버는 뜨고 /health가 down으로 알려 준다.
    super(url ?? UNCONFIGURED_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 3000, // 응답이 없는 명령은 3초 뒤 실패시킨다
      // 주소가 없으면 재연결하지 않는다. 있으면 5초까지 간격을 늘려 가며 다시 시도한다.
      retryStrategy: (times) => (url ? Math.min(times * 500, 5000) : null),
    });
    this.configured = url !== undefined;

    const logger = new Logger(RedisService.name);
    let lastWarnAt = 0;
    this.on('error', (error) => {
      const now = Date.now();
      if (now - lastWarnAt < WARN_INTERVAL_MS) return;
      lastWarnAt = now;
      logger.warn(
        `Redis 연결 오류: ${error.message} (이 경고는 ${WARN_INTERVAL_MS / 1000}초에 한 번만 남깁니다)`,
      );
    });
    this.on('ready', () => {
      if (lastWarnAt) logger.log('Redis 연결이 복구됐습니다');
      lastWarnAt = 0;
    });
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}
