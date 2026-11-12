import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { databaseUrl, UNCONFIGURED_DATABASE_URL } from './database-url.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // 연결은 처음 쿼리할 때 맺는다. DATABASE_URL이 없거나 DB가 꺼져 있어도 서버는 뜨고 /health가 down으로 알려 준다.
    super({
      // 연결을 못 맺으면 5초 뒤 실패하고, TCP keepalive로 끊어진 연결을 운영체제가 알아채게 한다.
      // 쿼리에는 클라이언트 쪽 제한 시간(query_timeout)을 걸지 않았다. 시간 초과 에러가 나도 DB는 쿼리를 계속 실행하므로,
      // 쓰기에서는 "실패로 보였지만 커밋됨"이 되어 재시도 때 중복 쓰기가 생길 수 있다. 쓰기 기능을 만들 때 서버 쪽 취소를 정한다.
      adapter: new PrismaPg({
        connectionString: databaseUrl() ?? UNCONFIGURED_DATABASE_URL,
        connectionTimeoutMillis: 5000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        idleTimeoutMillis: 30_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
